import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseStorageConfigured } from "@/lib/storage/supabase";

function admin() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase service role is not configured.");
  return client;
}

async function count(
  table: string,
  filter?: (query: { eq: (column: string, value: string) => unknown }) => unknown
) {
  let query: unknown = admin().from(table).select("id", { count: "exact", head: true });
  if (filter) query = filter(query as { eq: (column: string, value: string) => unknown });
  const { count: total, error } = (await query) as {
    count: number | null;
    error: { message: string } | null;
  };
  if (error) throw new Error(`Gagal menghitung ${table}: ${error.message}`);
  return total ?? 0;
}

export interface AdminDashboardStats {
  totalUsers: number;
  activePlayers: number;
  totalMatches: number;
  totalTournaments: number;
  pendingRegistrations: number;
  confirmedRegistrations: number;
}

export interface AdminActivityItem {
  id: string;
  action: string;
  previousStatus: string;
  newStatus: string;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string };
  tournamentName: string;
}

export async function getAdminDashboard(): Promise<{
  stats: AdminDashboardStats;
  activity: AdminActivityItem[];
}> {
  const supabase = admin();
  const [totalUsers, activePlayers, totalMatches, totalTournaments, registrationStats] =
    await Promise.all([
      count("users"),
      count("public_players"),
      count("matches"),
      count("tournaments"),
      supabase.rpc("admin_registration_stats").then(({ data, error }) => {
        if (error) {
          // A missing/older stats RPC must not blank the whole dashboard.
          console.error("admin_registration_stats failed:", error.message);
          return { pending_entries: 0, accepted_entries: 0 };
        }
        return (data ?? {}) as {
          pending_entries?: number;
          accepted_entries?: number;
        };
      }),
    ]);

  const pendingRegistrations = Number(registrationStats.pending_entries ?? 0);
  const confirmedRegistrations = Number(registrationStats.accepted_entries ?? 0);

  const { data: logs, error } = await supabase
    .from("tournament_registration_audit_logs")
    .select("id, action, previous_status, new_status, reason, created_at, actor_id, tournament_id")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) {
    // The activity feed is optional; log and show an empty list instead.
    console.error("admin activity log failed:", error.message);
  }
  const logRows = error ? [] : logs ?? [];

  const actorIds = Array.from(new Set(logRows.map((row) => row.actor_id).filter(Boolean)));
  const tournamentIds = Array.from(new Set(logRows.map((row) => row.tournament_id).filter(Boolean)));

  const [{ data: actors }, { data: tournaments }] = await Promise.all([
    actorIds.length
      ? supabase.from("users").select("id, full_name, email").in("id", actorIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null; email: string | null }> }),
    tournamentIds.length
      ? supabase.from("tournaments").select("id, name").in("id", tournamentIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
  ]);
  const actorById = new Map((actors ?? []).map((actor) => [actor.id, actor]));
  const tournamentById = new Map((tournaments ?? []).map((tournament) => [tournament.id, tournament]));

  const activity = logRows.map((row) => {
    const actor = actorById.get(row.actor_id);
    return {
      id: row.id,
      action: row.action,
      previousStatus: row.previous_status,
      newStatus: row.new_status,
      reason: row.reason,
      createdAt: row.created_at,
      actor: {
        id: row.actor_id,
        name: actor?.full_name ?? null,
        email: actor?.email ?? "",
      },
      tournamentName: tournamentById.get(row.tournament_id)?.name ?? "Turnamen",
    };
  });

  return {
    stats: {
      totalUsers,
      activePlayers,
      totalMatches,
      totalTournaments,
      pendingRegistrations,
      confirmedRegistrations,
    },
    activity,
  };
}

export interface AdminUserRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  roles: string;
  is_super_admin: number;
  is_admin: number;
}

export interface AdminPlayerRow {
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

export interface AdminMatchRow {
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

export interface AdminTournamentRow {
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

export interface AdminSystemHealth {
  database?: "healthy" | "degraded" | "error";
  authentication?: "healthy" | "degraded" | "error";
  storage?: "healthy" | "degraded" | "error";
  realtime?: "healthy" | "degraded" | "error";
}

export async function getAdminSettingsData(tab: string): Promise<{
  users: AdminUserRow[];
  players: AdminPlayerRow[];
  matches: AdminMatchRow[];
  tournaments: AdminTournamentRow[];
  systemHealth: AdminSystemHealth;
}> {
  const supabase = admin();
  let users: AdminUserRow[] = [];
  let players: AdminPlayerRow[] = [];
  let matches: AdminMatchRow[] = [];
  let tournaments: AdminTournamentRow[] = [];
  const systemHealth: AdminSystemHealth = {};

  if (tab === "users" || tab === "overview") {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(`Gagal memuat pengguna: ${error.message}`);

    const { data: roleRows, error: roleError } = await supabase
      .from("user_roles")
      .select("user_id, revoked_at, roles ( code )")
      .is("revoked_at", null);
    if (roleError) throw new Error(`Gagal memuat role: ${roleError.message}`);

    const rolesByUser = new Map<string, string[]>();
    for (const row of roleRows ?? []) {
      const role = (row as { roles?: { code?: string } | Array<{ code?: string }> }).roles;
      const code = Array.isArray(role) ? role[0]?.code : role?.code;
      if (!code) continue;
      const list = rolesByUser.get(row.user_id) ?? [];
      list.push(code);
      rolesByUser.set(row.user_id, list);
    }

    users = (data ?? []).map((user) => {
      const roles = rolesByUser.get(user.id) ?? ["player"];
      const sorted = Array.from(new Set(roles)).sort();
      return {
        id: user.id,
        email: user.email ?? "",
        full_name: user.full_name,
        created_at: user.created_at,
        roles: sorted.join(","),
        is_super_admin: sorted.includes("super_admin") ? 1 : 0,
        is_admin: sorted.includes("admin") ? 1 : 0,
      };
    });
  }

  if (tab === "players" || tab === "overview") {
    const { data, error } = await supabase
      .from("public_players")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(`Gagal memuat pemain: ${error.message}`);

    const playerIds = (data ?? []).map((row) => row.user_id);
    const { data: accounts } = playerIds.length
      ? await supabase.from("users").select("id, email, created_at").in("id", playerIds)
      : { data: [] as Array<{ id: string; email: string | null; created_at: string }> };
    const accountById = new Map((accounts ?? []).map((account) => [account.id, account]));

    players = (data ?? []).map((row) => ({
      id: row.user_id,
      email: accountById.get(row.user_id)?.email ?? "",
      full_name: row.full_name,
      created_at: accountById.get(row.user_id)?.created_at ?? row.updated_at,
      display_name: row.display_name,
      city_name: row.city_name,
      province: row.province,
      current_rating: row.current_rating,
      matches_played: row.matches_played,
      wins: row.wins,
      losses: row.losses,
      is_profile_public: true,
      profile_visibility: row.profile_visibility,
      show_rating: Boolean(row.show_rating),
    }));
  }

  if (tab === "matches" || tab === "overview") {
    const { data, error } = await supabase
      .from("matches")
      .select("id, title, category, match_date, start_time, status, court_name, city_name, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(`Gagal memuat pertandingan: ${error.message}`);

    const matchIds = (data ?? []).map((row) => row.id);
    const { data: participants } = matchIds.length
      ? await supabase.from("match_participants").select("match_id").in("match_id", matchIds).is("left_at", null)
      : { data: [] as Array<{ match_id: string }> };
    const countByMatch = new Map<string, number>();
    for (const participant of participants ?? []) {
      countByMatch.set(participant.match_id, (countByMatch.get(participant.match_id) ?? 0) + 1);
    }

    matches = (data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category ?? "mens_singles",
      match_date: row.match_date,
      start_time: row.start_time,
      status: row.status,
      court_name: row.court_name,
      city_name: row.city_name,
      created_at: row.created_at,
      participant_count: countByMatch.get(row.id) ?? 0,
    }));
  }

  if (tab === "tournaments" || tab === "overview") {
    const { data, error } = await supabase
      .from("tournaments")
      .select("id, name, category, season, status, max_participants, start_date, end_date, registration_deadline")
      .eq("is_league", true)
      .order("start_date", { ascending: false });
    if (error) throw new Error(`Gagal memuat turnamen: ${error.message}`);

    const tournamentIds = (data ?? []).map((row) => row.id);
    const { data: entries } = tournamentIds.length
      ? await supabase
          .from("tournament_participants")
          .select("tournament_id, entry_id, status")
          .in("tournament_id", tournamentIds)
      : { data: [] as Array<{ tournament_id: string; entry_id: string; status: string }> };

    const confirmedByTournament = new Map<string, Set<string>>();
    const pendingByTournament = new Map<string, Set<string>>();
    for (const entry of entries ?? []) {
      if (entry.status === "rejected") continue;
      const target = entry.status === "pending" ? pendingByTournament : confirmedByTournament;
      const set = target.get(entry.tournament_id) ?? new Set<string>();
      set.add(entry.entry_id);
      target.set(entry.tournament_id, set);
    }

    tournaments = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category ?? "",
      season: row.season,
      status: row.status,
      max_participants: row.max_participants,
      start_date: row.start_date,
      end_date: row.end_date,
      registration_deadline: row.registration_deadline,
      confirmed_entries: confirmedByTournament.get(row.id)?.size ?? 0,
      pending_entries: pendingByTournament.get(row.id)?.size ?? 0,
    }));
  }

  if (tab === "overview") {
    try {
      const { error } = await supabase.from("roles").select("code", { head: true, count: "exact" });
      systemHealth.database = error ? "degraded" : "healthy";
    } catch {
      systemHealth.database = "error";
    }
    systemHealth.authentication =
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
        ? "healthy"
        : "degraded";
    systemHealth.storage = isSupabaseStorageConfigured() ? "healthy" : "degraded";
    systemHealth.realtime = "healthy";
  }

  return { users, players, matches, tournaments, systemHealth };
}

export interface PendingRegistration {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentCategory: string;
  tournamentMaxParticipants: number;
  userId: string;
  category: string;
  entryId: string;
  entryRole: string;
  partnerUserId: string | null;
  status: string;
  joinedAt: string;
  playerName: string;
  partnerName: string | null;
  currentEntries: number;
}

export async function listPendingRegistrations(): Promise<PendingRegistration[]> {
  return listRegistrations();
}

export interface RegistrationFilters {
  tournamentId?: string;
  status?: string;
}

export async function listRegistrations(
  filters: RegistrationFilters = {}
): Promise<PendingRegistration[]> {
  const { data, error } = await admin().rpc("admin_list_registrations", {
    p_tournament_id: filters.tournamentId ?? null,
    p_status: filters.status ?? null,
  });
  if (error) throw new Error(`Gagal memuat pendaftaran: ${error.message}`);
  return Array.isArray(data) ? (data as PendingRegistration[]) : [];
}

export interface RegistrationStats {
  pending: number;
  accepted: number;
  declined: number;
}

export async function getRegistrationStats(): Promise<RegistrationStats> {
  const { data, error } = await admin().rpc("admin_registration_stats");
  if (error) throw new Error(`Gagal memuat statistik pendaftaran: ${error.message}`);
  const row = (data ?? {}) as {
    pending_entries?: number;
    accepted_entries?: number;
    declined_entries?: number;
  };
  return {
    pending: Number(row.pending_entries ?? 0),
    accepted: Number(row.accepted_entries ?? 0),
    declined: Number(row.declined_entries ?? 0),
  };
}

export interface LeagueOption {
  id: string;
  name: string;
  category: string;
}

export async function listLeagueOptions(): Promise<LeagueOption[]> {
  const { data, error } = await admin()
    .from("tournaments")
    .select("id, name, category")
    .eq("is_league", true)
    .order("name", { ascending: true });
  if (error) throw new Error(`Gagal memuat daftar liga: ${error.message}`);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category ?? "",
  }));
}

export interface RegistrationDecision {
  success: boolean;
  message: string;
  tournament_id?: string;
  tournament_name?: string;
  user_id?: string;
  partner_user_id?: string | null;
}

export async function approveRegistration(
  registrationId: string,
  actorId: string,
  reason: string | null
): Promise<RegistrationDecision> {
  const { data, error } = await admin().rpc("admin_approve_registration", {
    p_registration_id: registrationId,
    p_actor_id: actorId,
    p_reason: reason,
  });
  if (error) throw new Error(`Gagal menyetujui pendaftaran: ${error.message}`);
  return data as RegistrationDecision;
}

export async function rejectRegistration(
  registrationId: string,
  actorId: string,
  reason: string | null
): Promise<RegistrationDecision> {
  const { data, error } = await admin().rpc("admin_reject_registration", {
    p_registration_id: registrationId,
    p_actor_id: actorId,
    p_reason: reason,
  });
  if (error) throw new Error(`Gagal menolak pendaftaran: ${error.message}`);
  return data as RegistrationDecision;
}
