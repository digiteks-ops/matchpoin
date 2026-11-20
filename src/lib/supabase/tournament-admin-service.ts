import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface ManagedRegistration {
  id: string;
  entryId: string;
  userId: string;
  playerName: string;
  gender: string | null;
  partnerUserId: string | null;
  partnerName: string | null;
  partnerGender: string | null;
  status: string;
  joinedAt: string | null;
  entryRole: string;
}

export interface ManagedCategory {
  id: string;
  name: string;
  category: string;
  maxParticipants: number;
  acceptedCount: number;
  pendingCount: number;
  rejectedCount: number;
  registrations: ManagedRegistration[];
}

export interface ManagedMatch {
  id: string;
  title: string;
  matchDate: string;
  startTime: string;
  status: string;
  category: string;
  tournamentId: string | null;
  team1: string[];
  team2: string[];
}

export interface ManagedLeague {
  leagueKey: string;
  leagueName: string;
  season: string;
  startDate: string;
  endDate: string;
  mainEventStart: string | null;
  mainEventEnd: string | null;
  registrationDeadline: string | null;
  categories: ManagedCategory[];
  matches: ManagedMatch[];
}

interface LeagueRow {
  id: string;
  name: string;
  category: string | null;
  season: string | null;
  league_key: string | null;
  league_name: string | null;
  start_date: string;
  end_date: string;
  main_event_start_date: string | null;
  main_event_end_date: string | null;
  registration_deadline: string | null;
  max_participants: number;
}

interface ParticipantRow {
  id: string;
  tournament_id: string;
  user_id: string;
  category: string | null;
  entry_id: string | null;
  entry_role: string | null;
  partner_user_id: string | null;
  status: string;
  joined_at: string | null;
}

function admin() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase service role is not configured.");
  return client;
}

export interface ManagedLeagueSummary {
  id: string;
  leagueKey: string;
  leagueName: string;
  season: string;
  startDate: string;
  endDate: string;
  categoryCount: number;
}

export async function listManagedLeagues(): Promise<ManagedLeagueSummary[]> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, category, season, league_key, league_name, start_date, end_date")
    .eq("is_league", true)
    .order("start_date", { ascending: false });
  if (error) throw new Error(`Gagal memuat daftar liga: ${error.message}`);

  const groups = new Map<string, ManagedLeagueSummary>();
  for (const row of data ?? []) {
    const key = row.league_key ?? row.season ?? row.id;
    const existing = groups.get(key);
    if (existing) {
      existing.categoryCount += 1;
      continue;
    }
    groups.set(key, {
      id: row.id,
      leagueKey: key,
      leagueName: row.league_name ?? "Liga Tennis IKA17",
      season: row.season ?? "",
      startDate: row.start_date,
      endDate: row.end_date,
      categoryCount: 1,
    });
  }

  return Array.from(groups.values());
}

export async function getManagedLeague(tournamentId: string): Promise<ManagedLeague | null> {
  const supabase = admin();

  const { data: selected, error: selectedError } = await supabase
    .from("tournaments")
    .select(
      "id, name, category, season, league_key, league_name, start_date, end_date, main_event_start_date, main_event_end_date, registration_deadline, max_participants"
    )
    .eq("id", tournamentId)
    .maybeSingle();
  if (selectedError) throw new Error(`Gagal memuat turnamen: ${selectedError.message}`);
  if (!selected) return null;

  const league = selected as LeagueRow;
  let leagueQuery = supabase
    .from("tournaments")
    .select(
      "id, name, category, season, league_key, league_name, start_date, end_date, main_event_start_date, main_event_end_date, registration_deadline, max_participants"
    )
    .eq("is_league", true);

  leagueQuery = league.league_key
    ? leagueQuery.eq("league_key", league.league_key)
    : leagueQuery.eq("season", league.season ?? "");

  const { data: leagueRows, error: leagueError } = await leagueQuery.order("category", {
    ascending: true,
  });
  if (leagueError) throw new Error(`Gagal memuat kategori liga: ${leagueError.message}`);

  const categoryOrder = [
    "womens_singles",
    "womens_doubles",
    "mens_singles",
    "mens_doubles",
    "mixed_doubles",
  ];
  const categories = ((leagueRows ?? []) as LeagueRow[]).sort(
    (a, b) =>
      categoryOrder.indexOf(a.category ?? "") - categoryOrder.indexOf(b.category ?? "")
  );
  const tournamentIds = categories.map((row) => row.id);
  if (tournamentIds.length === 0) throw new Error("Kategori liga tidak ditemukan.");

  const { data: participantRows, error: participantError } = await supabase
    .from("tournament_participants")
    .select("id, tournament_id, user_id, category, entry_id, entry_role, partner_user_id, status, joined_at")
    .in("tournament_id", tournamentIds)
    .order("joined_at", { ascending: true })
    .limit(1000);
  if (participantError) throw new Error(`Gagal memuat pendaftar: ${participantError.message}`);

  const participants = (participantRows ?? []) as ParticipantRow[];
  const userIds = Array.from(
    new Set(
      participants
        .flatMap((row) => [row.user_id, row.partner_user_id])
        .filter((value): value is string => Boolean(value))
    )
  );

  const [{ data: users }, { data: profiles }] = userIds.length
    ? await Promise.all([
        supabase.from("users").select("id, full_name, email, gender").in("id", userIds),
        supabase.from("player_profiles").select("user_id, display_name").in("user_id", userIds),
      ])
    : [{ data: [] as Array<{ id: string; full_name: string | null; email: string | null; gender: string | null }> }, { data: [] as Array<{ user_id: string; display_name: string | null }> }];

  const profileById = new Map((profiles ?? []).map((row) => [row.user_id, row.display_name]));
  const nameById = new Map(
    (users ?? []).map((row) => [
      row.id,
      profileById.get(row.id) || row.full_name || row.email || "Pemain MATCHPOIN",
    ])
  );
  const genderById = new Map((users ?? []).map((row) => [row.id, row.gender ?? null]));

  const registrationsByTournament = new Map<string, Map<string, ManagedRegistration>>();
  for (const row of participants) {
    const entryKey = row.entry_id ?? row.id;
    const bucket = registrationsByTournament.get(row.tournament_id) ?? new Map<string, ManagedRegistration>();
    const existing = bucket.get(entryKey);
    const rowIsCaptain = (row.entry_role ?? "captain") === "captain";
    const existingIsCaptain = existing?.entryRole === "captain";

    // Captain rows carry partner_user_id and the team identity. Partner rows may
    // share the same joined_at timestamp, so never let row order decide which
    // player represents the entry.
    if (!existing || (rowIsCaptain && !existingIsCaptain)) {
      bucket.set(entryKey, {
        id: row.id,
        entryId: entryKey,
        userId: row.user_id,
        playerName: nameById.get(row.user_id) ?? "Pemain MATCHPOIN",
        gender: genderById.get(row.user_id) ?? null,
        partnerUserId: row.partner_user_id,
        partnerName: row.partner_user_id ? nameById.get(row.partner_user_id) ?? "Pemain MATCHPOIN" : null,
        partnerGender: row.partner_user_id ? genderById.get(row.partner_user_id) ?? null : null,
        status: existing && existing.status === "pending" ? existing.status : row.status,
        joinedAt: row.joined_at,
        entryRole: row.entry_role ?? "captain",
      });
    } else if (row.status === "pending" && existing.status !== "pending") {
      existing.status = row.status;
    }

    registrationsByTournament.set(row.tournament_id, bucket);
  }

  const categoriesWithRegistrations: ManagedCategory[] = categories
    .map((row) => {
      const registrations = Array.from(registrationsByTournament.get(row.id)?.values() ?? []).sort(
        (a, b) => (a.joinedAt ?? "").localeCompare(b.joinedAt ?? "")
      );
      return {
        id: row.id,
        name: row.name,
        category: row.category ?? "",
        maxParticipants: Number(row.max_participants ?? 24),
        acceptedCount: registrations.filter(
          (entry) => entry.status === "accepted" || entry.status === "confirmed"
        ).length,
        pendingCount: registrations.filter((entry) => entry.status === "pending").length,
        rejectedCount: registrations.filter((entry) => entry.status === "rejected").length,
        registrations,
      };
    })
    .filter((row) => Boolean(row.category));

  const { data: matchRows, error: matchError } = await supabase
    .from("matches")
    .select("id, title, match_date, start_time, status, metadata, tournament_id")
    .in("tournament_id", tournamentIds)
    .order("match_date", { ascending: false });
  if (matchError) throw new Error(`Gagal memuat pertandingan: ${matchError.message}`);

  const matchIds = (matchRows ?? []).map((row) => row.id);
  const { data: matchParticipants } = matchIds.length
    ? await supabase
        .from("match_participants")
        .select("match_id, user_id, team")
        .in("match_id", matchIds)
        .is("left_at", null)
    : { data: [] as Array<{ match_id: string; user_id: string; team: number | null }> };

  const teamsByMatch = new Map<string, { 1: string[]; 2: string[] }>();
  for (const row of matchParticipants ?? []) {
    const teams = teamsByMatch.get(row.match_id) ?? { 1: [], 2: [] };
    const team = row.team === 2 ? 2 : 1;
    teams[team].push(nameById.get(row.user_id) ?? "Pemain MATCHPOIN");
    teamsByMatch.set(row.match_id, teams);
  }

  const matches: ManagedMatch[] = (matchRows ?? []).map((row) => {
    const metadata =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const teams = teamsByMatch.get(row.id) ?? { 1: [], 2: [] };
    return {
      id: row.id,
      title: row.title,
      matchDate: row.match_date,
      startTime: row.start_time,
      status: row.status,
      category: typeof metadata.category === "string" ? metadata.category : "",
      tournamentId: row.tournament_id ?? null,
      team1: teams[1],
      team2: teams[2],
    };
  });

  return {
    leagueKey: league.league_key ?? league.season ?? league.id,
    leagueName: league.league_name ?? "Liga Tennis IKA17",
    season: league.season ?? "",
    startDate: league.start_date,
    endDate: league.end_date,
    mainEventStart: league.main_event_start_date,
    mainEventEnd: league.main_event_end_date,
    registrationDeadline: league.registration_deadline,
    categories: categoriesWithRegistrations,
    matches,
  };
}

export interface LeagueInfoInput {
  leagueName: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string | null;
  mainEventStart: string | null;
  mainEventEnd: string | null;
}

export async function updateManagedLeague(
  tournamentIds: string[],
  input: LeagueInfoInput
): Promise<void> {
  const supabase = admin();
  const { error } = await supabase
    .from("tournaments")
    .update({
      league_name: input.leagueName,
      start_date: input.startDate,
      end_date: input.endDate,
      registration_deadline: input.registrationDeadline,
      main_event_start_date: input.mainEventStart,
      main_event_end_date: input.mainEventEnd,
    })
    .in("id", tournamentIds);
  if (error) throw new Error(`Gagal menyimpan info turnamen: ${error.message}`);
}

export async function getManagedTournamentCategory(tournamentId: string): Promise<{
  id: string;
  name: string;
  category: string;
  maxParticipants: number;
  cityName: string | null;
  province: string | null;
} | null> {
  const supabase = admin();
  const { data, error } = await supabase
    .from("tournaments")
    .select("id, name, category, max_participants, cities(name, province)")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat kategori turnamen: ${error.message}`);
  if (!data) return null;
  const city = Array.isArray(data.cities) ? data.cities[0] : data.cities;
  return {
    id: data.id,
    name: data.name,
    category: data.category ?? "",
    maxParticipants: Number(data.max_participants ?? 24),
    cityName: city?.name ?? null,
    province: city?.province ?? null,
  };
}
