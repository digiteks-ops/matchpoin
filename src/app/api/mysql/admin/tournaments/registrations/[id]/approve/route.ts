import { NextResponse } from "next/server";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { randomUUID } from "node:crypto";
import { notifyTournamentRegistration } from "@/lib/notifications/notification-service";

interface ApproveRequest {
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiRole("super_admin");
  if (guard instanceof NextResponse) return guard;

  const { id: registrationId } = await params;
  if (!registrationId) {
    return NextResponse.json(
      { success: false, message: "ID pendaftaran tidak valid." },
      { status: 400 }
    );
  }

  let payload: ApproveRequest;
  try {
    payload = (await request.json()) as ApproveRequest;
  } catch {
    return NextResponse.json(
      { success: false, message: "Data tidak valid." },
      { status: 400 }
    );
  }

  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : null;

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  let transactionStarted = false;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    transactionStarted = true;

    // Get the registration with tournament info
    const [regRows] = await connection.execute<any[]>(
      `SELECT tp.*, t.name AS tournament_name, t.max_participants
       FROM tournament_participants AS tp
       JOIN tournaments AS t ON t.id = tp.tournament_id
       WHERE tp.id = ? AND tp.status = 'pending'
       FOR UPDATE`,
      [registrationId]
    );

    if (!regRows[0]) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: "Pendaftaran tidak ditemukan atau sudah diproses." },
        { status: 404 }
      );
    }

    const registration = regRows[0];
    const tournamentId = registration.tournament_id;
    const entryId = registration.entry_id;
    const userId = registration.user_id;
    const partnerUserId = registration.partner_user_id;
    const tournamentName = registration.tournament_name;
    const maxParticipants = registration.max_participants;

    // Check quota - count confirmed entries for this tournament
    const [countRows] = await connection.execute<any[]>(
      `SELECT COUNT(DISTINCT entry_id) AS entries
       FROM tournament_participants
       WHERE tournament_id = ? AND status = 'confirmed'`,
      [tournamentId]
    );
    const currentEntries = Number(countRows[0]?.entries ?? 0);

    if (currentEntries >= maxParticipants) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: "Kuota kategori ini sudah penuh. Tidak dapat menyetujui pendaftaran." },
        { status: 409 }
      );
    }

    // Check if this entry would exceed quota (for doubles, entry counts as 1)
    const wouldExceedQuota = currentEntries + 1 > maxParticipants;
    if (wouldExceedQuota) {
      await connection.rollback();
      transactionStarted = false;
      return NextResponse.json(
        { success: false, message: "Kuota kategori ini sudah penuh. Tidak dapat menyetujui pendaftaran." },
        { status: 409 }
      );
    }

    // Update registration status to confirmed
    await connection.execute(
      `UPDATE tournament_participants
       SET status = 'confirmed'
       WHERE entry_id = ? AND tournament_id = ? AND status = 'pending'`,
      [entryId, tournamentId]
    );

    // Record audit log
    await connection.execute(
      `INSERT INTO tournament_registration_audit_logs
         (id, registration_id, tournament_id, action, actor_id, previous_status, new_status, reason)
       VALUES (?, ?, ?, 'approved', ?, 'pending', 'confirmed', ?)`,
      [randomUUID(), registrationId, tournamentId, guard.session.user.id, reason]
    );

    await connection.commit();
    transactionStarted = false;

    // Notify player of approval
    await notifyTournamentRegistration(userId, tournamentId, tournamentName);
    if (partnerUserId) {
      await notifyTournamentRegistration(partnerUserId, tournamentId, tournamentName);
    }

    return NextResponse.json({
      success: true,
      message: "Pendaftaran berhasil disetujui.",
    });
  } catch (error) {
    if (transactionStarted && connection) {
      await connection.rollback();
    }
    logError("admin.tournaments.registrations.approve", error, { registrationId });
    return NextResponse.json(
      { success: false, message: "Gagal menyetujui pendaftaran. Coba lagi." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}