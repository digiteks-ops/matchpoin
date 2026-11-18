import { NextResponse } from "next/server";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { randomUUID } from "node:crypto";
import { notifyTournamentRegistration } from "@/lib/notifications/notification-service";

interface RejectRequest {
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

  let payload: RejectRequest;
  try {
    payload = (await request.json()) as RejectRequest;
  } catch {
    return NextResponse.json(
      { success: false, message: "Data tidak valid." },
      { status: 400 }
    );
  }

  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : null;
  if (!reason) {
    return NextResponse.json(
      { success: false, message: "Alasan penolakan wajib diisi." },
      { status: 400 }
    );
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  let transactionStarted = false;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    transactionStarted = true;

    // Get the registration with tournament info
    const [regRows] = await connection.execute<any[]>(
      `SELECT tp.*, t.name AS tournament_name
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

    // Update registration status to rejected
    await connection.execute(
      `UPDATE tournament_participants
       SET status = 'rejected'
       WHERE entry_id = ? AND tournament_id = ? AND status = 'pending'`,
      [entryId, tournamentId]
    );

    // Record audit log
    await connection.execute(
      `INSERT INTO tournament_registration_audit_logs
         (id, registration_id, tournament_id, action, actor_id, previous_status, new_status, reason)
       VALUES (?, ?, ?, 'rejected', ?, 'pending', 'rejected', ?)`,
      [randomUUID(), registrationId, tournamentId, guard.session.user.id, reason]
    );

    await connection.commit();
    transactionStarted = false;

    // Notify player of rejection
    await notifyTournamentRegistration(userId, tournamentId, tournamentName);
    if (partnerUserId) {
      await notifyTournamentRegistration(partnerUserId, tournamentId, tournamentName);
    }

    return NextResponse.json({
      success: true,
      message: "Pendaftaran ditolak.",
    });
  } catch (error) {
    if (transactionStarted && connection) {
      await connection.rollback();
    }
    logError("admin.tournaments.registrations.reject", error, { registrationId });
    return NextResponse.json(
      { success: false, message: "Gagal menolak pendaftaran. Coba lagi." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}