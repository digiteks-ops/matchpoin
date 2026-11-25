import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { ika17ClassOfRating, ika17TeamRating } from "@/lib/tournaments/ika17-core.mjs";

export interface TournamentListItem {
  id: string;
  name: string;
  slug: string | null;
  category: string;
  season: string;
  league_key: string | null;
  league_name: string | null;
  start_date: string;
  end_date: string;
  main_event_start_date: string | null;
  main_event_end_date: string | null;
  registration_deadline: string | null;
  status: string;
  max_participants: number;
  registration_count: number;
  pending_count: number;
  is_registered: boolean;
  my_status: string | null;
}

export interface TournamentPartner {
  id: string;
  name: string;
  gender: string | null;
}

export interface LeagueOverview {
  league: {
    id: string;
    name: string;
    category: string;
    season: string;
    start_date: string;
    end_date: string;
    status: string;
    max_participants: number;
  } | null;
  participants: Array<{
    entryId: string;
    userId: string;
    name: string;
    avatarUrl: string | null;
    province: string | null;
    cityName: string | null;
    joinedAt: string | null;
  }>;
  standings: Array<{
    entryId: string;
    name: string;
    avatarUrl: string | null;
    province: string | null;
    cityName: string | null;
    points: number;
    wins: number;
    losses: number;
    matchesPlayed: number;
    gamesFor: number;
    gamesAgainst: number;
    gameDiff: number;
    rank: number;
    needsTiebreak: boolean;
    level: string | null;
    rating: number | null;
  }>;
}

function client() {
  return createClient();
}

/**
 * Server-side reader for registration rows. RLS now limits players to their own
 * registrations, so quota counts, partner exclusions and public league rosters
 * are read with the service role (the data returned to the browser is filtered
 * to public-safe fields by each caller).
 */
function dataClient() {
  return createAdminClient() ?? createClient();
}

interface RegistrationCountRow {
  tournament_id: string;
  accepted: number;
  pending: number;
}

export async function getTournamentList(userId: string | null): Promise<TournamentListItem[]> {
  const supabase = client();
  const data = dataClient();
  const { data: tournaments, error } = await supabase
    .from("tournaments")
    .select(
      "id, name, slug, category, season, league_key, league_name, start_date, end_date, main_event_start_date, main_event_end_date, registration_deadline, status, max_participants"
    )
    .eq("is_league", true)
    .order("start_date", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Gagal memuat kompetisi: ${error.message}`);

  const ids = (tournaments ?? []).map((row) => row.id);

  // Quota counts come from a definer RPC that only exposes aggregates. If that
  // RPC is unavailable (migration 00021 not applied yet), fall back to a bounded
  // server-side count so the quota never silently shows 0.
  const { data: countRows, error: countError } = await data.rpc("league_registration_counts");
  const counts = new Map<string, RegistrationCountRow>();
  if (!countError && Array.isArray(countRows)) {
    for (const row of countRows as RegistrationCountRow[]) {
      counts.set(row.tournament_id, row);
    }
  } else if (ids.length) {
    const { data: rows } = await data
      .from("tournament_participants")
      .select("tournament_id, entry_id, id, status, entry_role")
      .in("tournament_id", ids)
      .limit(5000);
    const accepted = new Map<string, Set<string>>();
    const pending = new Map<string, Set<string>>();
    for (const row of rows ?? []) {
      const key = row.entry_id ?? row.id;
      if (row.status === "accepted" || row.status === "confirmed") {
        const set = accepted.get(row.tournament_id) ?? new Set<string>();
        set.add(key);
        accepted.set(row.tournament_id, set);
      } else if (row.status === "pending" && row.entry_role === "captain") {
        const set = pending.get(row.tournament_id) ?? new Set<string>();
        set.add(key);
        pending.set(row.tournament_id, set);
      }
    }
    for (const id of ids) {
      counts.set(id, {
        tournament_id: id,
        accepted: accepted.get(id)?.size ?? 0,
        pending: pending.get(id)?.size ?? 0,
      });
    }
  }

  // The session client only returns the caller's own registrations under RLS.
  const { data: entries } =
    userId && ids.length
      ? await supabase
          .from("tournament_participants")
          .select("tournament_id, user_id, entry_id, status")
          .in("tournament_id", ids)
          .eq("user_id", userId)
      : {
          data: [] as Array<{
            tournament_id: string;
            user_id: string;
            entry_id: string | null;
            status: string;
          }>,
        };

  const statusForUser = new Map<string, string>();
  for (const entry of entries ?? []) {
    if (userId && entry.user_id === userId) {
      const current = statusForUser.get(entry.tournament_id);
      if (!current || current === "rejected" || entry.status !== "rejected") {
        statusForUser.set(entry.tournament_id, entry.status);
      }
    }
  }

  return (tournaments ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug ?? null,
    category: row.category ?? "mens_singles",
    season: row.season ?? "Musim 1 2027",
    league_key: row.league_key ?? null,
    league_name: row.league_name ?? null,
    start_date: row.start_date,
    end_date: row.end_date,
    main_event_start_date: row.main_event_start_date ?? null,
    main_event_end_date: row.main_event_end_date ?? null,
    registration_deadline: row.registration_deadline ?? null,
    status: row.status,
    max_participants: Number(row.max_participants),
    registration_count: Number(counts.get(row.id)?.accepted ?? 0),
    pending_count: Number(counts.get(row.id)?.pending ?? 0),
    is_registered: Boolean(statusForUser.get(row.id) && statusForUser.get(row.id) !== "rejected"),
    my_status: statusForUser.get(row.id) ?? null,
  }));
}

export async function getTournamentPartners(
  tournamentId: string,
  userId: string,
  category?: string | null
): Promise<TournamentPartner[] | null> {
  const supabase = client();
  const data = dataClient();
  const { data: tournament, error } = await supabase
    .from("tournaments")
    .select("id")
    .eq("id", tournamentId)
    .eq("is_league", true)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat kompetisi: ${error.message}`);
  if (!tournament) return null;

  const { data: players, error: playerError } = await supabase
    .from("public_players")
    .select("user_id, display_name, full_name, gender")
    .neq("user_id", userId)
    .order("display_name", { ascending: true })
    .limit(200);
  if (playerError) throw new Error(`Gagal memuat calon partner: ${playerError.message}`);

  let takenQuery = data
    .from("tournament_participants")
    .select("user_id")
    .eq("tournament_id", tournamentId)
    .neq("status", "rejected");
  if (category) takenQuery = takenQuery.eq("category", category);
  const { data: entries } = await takenQuery;
  const taken = new Set((entries ?? []).map((entry) => entry.user_id));

  return (players ?? [])
    .filter((player) => !taken.has(player.user_id))
    .slice(0, 100)
    .map((player) => ({
      id: player.user_id,
      name: player.display_name || player.full_name || "Pemain MATCHPOIN",
      gender: (player as { gender?: string | null }).gender ?? null,
    }));
}

export async function getLeagueOverview(category: string): Promise<LeagueOverview> {
  const supabase = client();
  const data = dataClient();
  const { data: league, error } = await supabase
    .from("tournaments")
    .select("id, name, category, season, start_date, end_date, status, max_participants")
    .eq("category", category)
    .eq("is_league", true)
    .order("start_date", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat liga: ${error.message}`);
  if (!league) return { league: null, participants: [], standings: [] };

  const [{ data: entries, error: entryError }, { data: standings, error: standingError }] =
    await Promise.all([
      data
        .from("tournament_participants")
        .select("entry_id, user_id, joined_at, status")
        .eq("tournament_id", league.id)
        .in("status", ["accepted", "confirmed"])
        .order("joined_at", { ascending: true }),
      supabase
        .from("league_standings")
        .select("entry_id, position, played, won, lost, games_won, games_lost, game_diff, points, needs_tiebreak")
        .eq("tournament_id", league.id)
        .order("position", { ascending: true }),
    ]);
  if (entryError) throw new Error(`Gagal memuat peserta liga: ${entryError.message}`);
  if (standingError) throw new Error(`Gagal memuat klasemen: ${standingError.message}`);

  const userIds = Array.from(new Set((entries ?? []).map((entry) => entry.user_id)));
  const { data: players } = userIds.length
    ? await supabase
        .from("public_players")
        .select("user_id, display_name, full_name, avatar_url, province, city_name, self_assessed_level, current_rating")
        .in("user_id", userIds)
    : { data: [] as Array<Record<string, unknown>> };
  const playerById = new Map(
    (players ?? []).map((player) => [
      player.user_id as string,
      player as {
        user_id: string;
        display_name: string | null;
        full_name: string | null;
        avatar_url: string | null;
        province: string | null;
        city_name: string | null;
        self_assessed_level: string | null;
        current_rating: number | string | null;
      },
    ])
  );

  const byEntry = new Map<string, Array<{ user_id: string; joined_at: string | null }>>();
  for (const entry of entries ?? []) {
    const list = byEntry.get(entry.entry_id) ?? [];
    list.push({ user_id: entry.user_id, joined_at: entry.joined_at });
    byEntry.set(entry.entry_id, list);
  }

  const participants = (entries ?? []).map((entry) => {
    const player = playerById.get(entry.user_id);
    return {
      entryId: entry.entry_id ?? entry.user_id,
      userId: entry.user_id,
      name: player?.display_name || player?.full_name || "Pemain MATCHPOIN",
      avatarUrl: player?.avatar_url ?? null,
      province: player?.province ?? null,
      cityName: player?.city_name ?? null,
      joinedAt: entry.joined_at,
    };
  });

  const mapStanding = (
    entryId: string,
    values?: {
      position: number | null;
      played: number;
      won: number;
      lost: number;
      games_won: number;
      games_lost: number;
      game_diff: number;
      points: number;
      needs_tiebreak: boolean;
    },
    fallbackRank = 0
  ) => {
    const entryPlayers = byEntry.get(entryId) ?? [];
    const first = entryPlayers[0] ? playerById.get(entryPlayers[0].user_id) : undefined;
    const name = entryPlayers
      .map((entry) => playerById.get(entry.user_id)?.display_name)
      .filter((value): value is string => Boolean(value))
      .join(" & ");
    // Kelas liga tidak dipilih pemain: ditentukan dari MPR hasil pertandingan.
    // Tim ganda memakai rata-rata MPR kedua pemain.
    const teamRating = ika17TeamRating(
      entryPlayers.map((entry) => playerById.get(entry.user_id)?.current_rating ?? null)
    );
    return {
      entryId,
      name: name || first?.full_name || "Peserta",
      avatarUrl: first?.avatar_url ?? null,
      province: first?.province ?? null,
      cityName: first?.city_name ?? null,
      points: Number(values?.points ?? 0),
      wins: Number(values?.won ?? 0),
      losses: Number(values?.lost ?? 0),
      matchesPlayed: Number(values?.played ?? 0),
      gamesFor: Number(values?.games_won ?? 0),
      gamesAgainst: Number(values?.games_lost ?? 0),
      gameDiff: Number(values?.game_diff ?? 0),
      rank: Number(values?.position && values.position > 0 ? values.position : fallbackRank),
      needsTiebreak: Boolean(values?.needs_tiebreak),
      level: ika17ClassOfRating(teamRating),
      rating: teamRating,
    };
  };

  const standingRows = standings ?? [];
  return {
    league: {
      id: league.id,
      name: league.name,
      category: league.category ?? category,
      season: league.season ?? "",
      start_date: league.start_date,
      end_date: league.end_date,
      status: league.status,
      max_participants: league.max_participants,
    },
    participants,
    standings:
      standingRows.length > 0
        ? standingRows.map((row, index) => mapStanding(row.entry_id, row, index + 1))
        : Array.from(byEntry.keys()).map((entryId, index) => mapStanding(entryId, undefined, index + 1)),
  };
}

export async function getMatchResultContext(userId: string, matchId: string) {
  const admin = createAdminClient();
  if (!admin) throw new Error("Supabase service role is not configured.");
  const { data: match, error } = await admin
    .from("matches")
    .select("id, title, organizer_id, status, match_date, start_time, metadata")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat pertandingan: ${error.message}`);
  if (!match) return null;

  const { data: participant } = await admin
    .from("match_participants")
    .select("team")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (!participant) return null;

  const metadata =
    match.metadata && typeof match.metadata === "object" && !Array.isArray(match.metadata)
      ? (match.metadata as Record<string, unknown>)
      : {};
  const startTime = String(match.start_time ?? "");
  return {
    id: match.id,
    title: match.title,
    status: match.status,
    matchDate: match.match_date,
    startTime: startTime.length === 5 ? `${startTime}:00` : startTime,
    raceToScore: Number(metadata.race_to ?? 8),
    isOrganizer: match.organizer_id === userId,
    viewerTeam: participant.team === 2 ? 2 : 1,
  };
}
