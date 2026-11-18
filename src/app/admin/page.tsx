import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/guards";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import type { RowDataPacket } from "mysql2/promise";
import AdminDashboardClient from "./AdminDashboardClient";

export default async function AdminDashboardPage() {
  await requirePageRole("admin", "/auth/login?redirectTo=/admin");

  const connection = await connectToMySql();
  try {
    const [
      userCountResult,
      playerCountResult,
      matchCountResult,
      tournamentCountResult,
      pendingRegCountResult,
      confirmedRegCountResult,
      recentActivityResult,
    ] = await Promise.all([
      connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM users"),
      connection.execute<RowDataPacket[]>(
        "SELECT COUNT(*) AS total FROM users u JOIN player_profiles p ON p.user_id = u.id WHERE p.is_profile_public = TRUE AND p.profile_visibility = 'public' AND NOT EXISTS (SELECT 1 FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id WHERE ur.user_id = u.id AND ur.revoked_at IS NULL AND ro.code IN ('admin', 'super_admin'))"
      ),
      connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM matches"),
      connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM tournaments"),
      connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM tournament_participants WHERE status = 'pending'"),
      connection.execute<RowDataPacket[]>("SELECT COUNT(*) AS total FROM tournament_participants WHERE status = 'confirmed'"),
      connection.execute<RowDataPacket[]>(
        `SELECT ral.id, ral.action, ral.previous_status, ral.new_status, ral.reason, ral.created_at,
                u.id AS actor_id, u.full_name AS actor_name, u.email AS actor_email,
                t.name AS tournament_name
         FROM tournament_registration_audit_logs AS ral
         JOIN users AS u ON u.id = ral.actor_id
         JOIN tournaments AS t ON t.id = ral.tournament_id
         ORDER BY ral.created_at DESC
         LIMIT 20`
      ),
    ]);

    const stats = {
      totalUsers: Number(userCountResult[0][0]?.total ?? 0),
      activePlayers: Number(playerCountResult[0][0]?.total ?? 0),
      totalMatches: Number(matchCountResult[0][0]?.total ?? 0),
      totalTournaments: Number(tournamentCountResult[0][0]?.total ?? 0),
      pendingRegistrations: Number(pendingRegCountResult[0][0]?.total ?? 0),
      confirmedRegistrations: Number(confirmedRegCountResult[0][0]?.total ?? 0),
    };

    const activity = (recentActivityResult[0] as RowDataPacket[]).map((row) => ({
      id: row.id,
      action: row.action,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      reason: row.reason,
      createdAt: row.created_at,
      actor: { id: row.actor_id, name: row.actor_name, email: row.actor_email },
      tournamentName: row.tournament_name,
    }));

    return <AdminDashboardClient initialStats={stats} initialActivity={activity} />;
  } finally {
    await connection.end();
  }
}