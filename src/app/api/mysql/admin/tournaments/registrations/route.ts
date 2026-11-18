import { NextResponse } from "next/server";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import type { RowDataPacket } from "mysql2/promise";

interface PendingRegistrationRow extends RowDataPacket {
  id: string;
  tournament_id: string;
  user_id: string;
  category: string;
  entry_id: string;
  entry_role: string;
  partner_user_id: string | null;
  status: string;
  joined_at: string;
  tournament_name: string;
  tournament_category: string;
  tournament_max_participants: number;
  player_display_name: string;
  player_full_name: string;
  partner_display_name: string | null;
  partner_full_name: string | null;
  current_entries: number;
}

export async function GET() {
  const guard = await requireApiRole("super_admin");
  if (guard instanceof NextResponse) return guard;

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();

    const result = await connection.execute<PendingRegistrationRow[]>(
      `SELECT
         tp.id,
         tp.tournament_id,
         tp.user_id,
         tp.category,
         tp.entry_id,
         tp.entry_role,
         tp.partner_user_id,
         tp.status,
         tp.joined_at,
         t.name AS tournament_name,
         t.category AS tournament_category,
         t.max_participants AS tournament_max_participants,
         pp.display_name AS player_display_name,
         u.full_name AS player_full_name,
         pp2.display_name AS partner_display_name,
         u2.full_name AS partner_full_name,
         (SELECT COUNT(DISTINCT entry_id)
          FROM tournament_participants
          WHERE tournament_id = t.id AND status <> 'rejected') AS current_entries
       FROM tournament_participants AS tp
       JOIN tournaments AS t ON t.id = tp.tournament_id
       JOIN users AS u ON u.id = tp.user_id
       LEFT JOIN player_profiles AS pp ON pp.user_id = tp.user_id
       LEFT JOIN users AS u2 ON u2.id = tp.partner_user_id
       LEFT JOIN player_profiles AS pp2 ON pp2.user_id = tp.partner_user_id
       WHERE tp.status = 'pending'
         AND t.is_league = TRUE
       ORDER BY tp.joined_at ASC`
    );

    const rows = result[0];
    const registrations = rows.map((row) => ({
      id: row.id,
      tournamentId: row.tournament_id,
      tournamentName: row.tournament_name,
      tournamentCategory: row.tournament_category,
      tournamentMaxParticipants: row.tournament_max_participants,
      userId: row.user_id,
      category: row.category,
      entryId: row.entry_id,
      entryRole: row.entry_role,
      partnerUserId: row.partner_user_id,
      status: row.status,
      joinedAt: row.joined_at,
      playerName: row.player_display_name || row.player_full_name || "Pemain MATCHPOIN",
      partnerName: row.partner_display_name || row.partner_full_name || null,
      currentEntries: row.current_entries,
    }));

    return NextResponse.json({ success: true, registrations });
  } catch (error) {
    logError("admin.tournaments.registrations.list", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat pendaftaran tertunda." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}