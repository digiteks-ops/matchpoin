import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/guards";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import type { RowDataPacket } from "mysql2/promise";
import AdminSettingsClient from "./AdminSettingsClient";

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  roles: string;
  is_super_admin: number;
  is_admin: number;
}

interface PlayerRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  display_name: string | null;
  city_name: string | null;
  province: string | null;
  current_rating: number | string | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  is_profile_public: boolean;
  profile_visibility: string;
  show_rating: boolean;
}

interface MatchRow {
  id: string;
  title: string;
  category: string;
  match_date: string;
  start_time: string;
  status: string;
  court_name: string | null;
  city_name: string | null;
  created_at: string;
  participant_count: number;
}

interface TournamentRow {
  id: string;
  name: string;
  category: string;
  season: string | null;
  status: string;
  max_participants: number;
  start_date: string;
  end_date: string;
  registration_deadline: string | null;
  confirmed_entries: number;
  pending_entries: number;
}

interface SystemHealth {
  database?: "healthy" | "degraded" | "error";
  authentication?: "healthy" | "degraded" | "error";
  storage?: "healthy" | "degraded" | "error";
  realtime?: "healthy" | "degraded" | "error";
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePageRole("admin", "/auth/login?redirectTo=/admin/settings");

  const { tab } = await searchParams;
  const activeTab = tab || "overview";

  const connection = await connectToMySql();
  try {
    let users: UserRow[] = [];
    let players: PlayerRow[] = [];
    let matches: MatchRow[] = [];
    let tournaments: TournamentRow[] = [];
    let systemHealth: SystemHealth = {};

    if (activeTab === "users" || activeTab === "overview") {
      const userResult = await connection.execute<RowDataPacket[]>(
        `SELECT u.id, u.email, u.full_name, u.created_at,
                COALESCE(GROUP_CONCAT(ro.code ORDER BY ro.code), 'player') AS roles,
                MAX(CASE WHEN ro.code = 'super_admin' THEN 1 ELSE 0 END) AS is_super_admin,
                MAX(CASE WHEN ro.code = 'admin' THEN 1 ELSE 0 END) AS is_admin
         FROM users AS u
         LEFT JOIN user_roles AS ur ON ur.user_id = u.id AND ur.revoked_at IS NULL
         LEFT JOIN roles AS ro ON ro.id = ur.role_id
         GROUP BY u.id, u.email, u.full_name, u.created_at
         ORDER BY u.created_at DESC
         LIMIT 200`
      );
      users = userResult[0] as unknown as UserRow[];
    }

    if (activeTab === "players" || activeTab === "overview") {
      const playerResult = await connection.execute<RowDataPacket[]>(
        `SELECT u.id, u.email, u.full_name, u.created_at,
                p.display_name, p.city_id, c.name AS city_name, c.province,
                r.current_rating, r.matches_played, r.wins, r.losses,
                p.is_profile_public, p.profile_visibility, p.show_rating
         FROM users AS u
         JOIN player_profiles AS p ON p.user_id = u.id
         LEFT JOIN player_ratings AS r ON r.user_id = u.id
         LEFT JOIN cities AS c ON c.id = u.city_id
         WHERE p.is_profile_public = TRUE AND p.profile_visibility = 'public'
           AND NOT EXISTS (
             SELECT 1 FROM user_roles ur JOIN roles ro ON ro.id = ur.role_id
             WHERE ur.user_id = u.id AND ur.revoked_at IS NULL AND ro.code IN ('admin', 'super_admin')
           )
         ORDER BY p.updated_at DESC
         LIMIT 200`
      );
      players = playerResult[0] as unknown as PlayerRow[];
    }

    if (activeTab === "matches" || activeTab === "overview") {
      const matchResult = await connection.execute<RowDataPacket[]>(
        `SELECT m.id, m.title, m.category, m.match_date, m.start_time, m.status,
                m.court_name, m.city_name, m.created_at,
                COUNT(mp.id) AS participant_count
         FROM matches AS m
         LEFT JOIN match_participants AS mp ON mp.match_id = m.id AND mp.left_at IS NULL
         GROUP BY m.id
         ORDER BY m.created_at DESC
         LIMIT 100`
      );
      matches = matchResult[0] as unknown as MatchRow[];
    }

    if (activeTab === "tournaments" || activeTab === "overview") {
      const tournamentResult = await connection.execute<RowDataPacket[]>(
        `SELECT t.id, t.name, t.category, t.season, t.status, t.max_participants,
                t.start_date, t.end_date, t.registration_deadline,
                COUNT(DISTINCT CASE WHEN tp.status <> 'rejected' THEN tp.entry_id END) AS confirmed_entries,
                COUNT(DISTINCT CASE WHEN tp.status = 'pending' THEN tp.entry_id END) AS pending_entries
         FROM tournaments AS t
         LEFT JOIN tournament_participants AS tp ON tp.tournament_id = t.id
         WHERE t.is_league = TRUE
         GROUP BY t.id
         ORDER BY t.start_date DESC`
      );
      tournaments = tournamentResult[0] as unknown as TournamentRow[];
    }

    if (activeTab === "overview") {
      try {
        const dbResult = await connection.execute<RowDataPacket[]>("SELECT 1 AS ok");
        systemHealth.database = dbResult[0][0]?.ok === 1 ? "healthy" : "degraded";
      } catch {
        systemHealth.database = "error";
      }

      systemHealth.authentication = "healthy";
      systemHealth.storage = "healthy";
      systemHealth.realtime = "healthy";
    }

    return <AdminSettingsClient
      activeTab={activeTab}
      initialUsers={users}
      initialPlayers={players}
      initialMatches={matches}
      initialTournaments={tournaments}
      initialSystemHealth={systemHealth}
    />;
  } finally {
    await connection.end();
  }
}