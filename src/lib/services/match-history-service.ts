import { createClient } from "@/lib/supabase/server";

export interface MatchHistoryEntry {
  id: string;
  title: string;
  matchDate: string;
  startTime: string;
  courtName: string;
  category: string;
  categoryLabel: string;
  status: string;
  opponentName: string | null;
  opponentRating: number | null;
  scoreA: number | null;
  scoreB: number | null;
  result: "win" | "loss" | "draw" | "unknown";
  resultStatus: "pending" | "confirmed" | "under_review" | "none";
  photoUrls: string[];
  createdAt: string;
  /** Perubahan rating DTR pada pertandingan ini (null bila belum dihitung). */
  ratingChange: number | null;
  ratingBefore: number | null;
  ratingAfter: number | null;
}

export interface PlayerStats {
  totalMatches: number;
  wins: number;
  losses: number;
  winPercentage: number;
  singlesMatches: number;
  singlesWins: number;
  singlesLosses: number;
  doublesMatches: number;
  doublesWins: number;
  doublesLosses: number;
  currentRating: number;
  bestRating: number;
  recentMatches: MatchHistoryEntry[];
}

const CATEGORY_LABELS: Record<string, string> = {
  mens_singles: "Tunggal Putra",
  womens_singles: "Tunggal Putri",
  mens_doubles: "Ganda Putra",
  womens_doubles: "Ganda Putri",
  womens_doubles_intermediate: "Ganda Putri Beginner–Intermediate",
  mixed_doubles: "Ganda Campuran",
};

type MatchResultRow = {
  team1_score: number | null;
  team2_score: number | null;
  winner_team: number | null;
  status: string | null;
  metadata: unknown;
};

type ParticipationRow = {
  match_id: string;
  team: number | null;
  is_organizer: boolean | null;
  metadata: unknown;
  matches: {
    id: string;
    title: string;
    match_date: string;
    start_time: string;
    status: string | null;
    metadata: unknown;
    created_at: string;
    tennis_courts: { name: string } | { name: string }[] | null;
    match_results: MatchResultRow | MatchResultRow[] | null;
  } | null;
};

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstResult(value: MatchResultRow | MatchResultRow[] | null): MatchResultRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeResultStatus(status: string | null | undefined): MatchHistoryEntry["resultStatus"] {
  if (status === "confirmed") return "confirmed";
  if (status === "under_review" || status === "disputed") return "under_review";
  if (status === "pending") return "pending";
  return "none";
}

/**
 * Returns match history for a given player. Must be called from a server context.
 */
export async function getMatchHistory(
  userId: string,
  limit = 20
): Promise<MatchHistoryEntry[]> {
  const supabase = createClient();

  const { data: participations, error } = await supabase
    .from("match_participants")
    .select(
      `
        match_id,
        team,
        is_organizer,
        metadata,
        matches (
          id,
          title,
          match_date,
          start_time,
          status,
          metadata,
          created_at,
          tennis_courts ( name ),
          match_results (
            team1_score,
            team2_score,
            winner_team,
            status,
            metadata
          )
        )
      `
    )
    .eq("user_id", userId)
    .order("created_at", { referencedTable: "matches", ascending: false })
    .limit(limit);

  if (error || !participations) return [];

  const rows = (participations as unknown as ParticipationRow[]).filter(
    (p): p is ParticipationRow & { matches: NonNullable<ParticipationRow["matches"]> } =>
      Boolean(p.matches)
  );

  // Fetch opponent names from public player_profiles (the users table is RLS-protected).
  const matchIds = Array.from(new Set(rows.map((r) => r.match_id)));
  const opponentNames = await getOpponentNames(matchIds);

  return rows.map((p) => {
    const match = p.matches;
    const meta = metadataObject(match.metadata);
    const result = firstResult(match.match_results ?? null);
    const category = typeof meta.category === "string" ? meta.category : "mens_singles";
    const myTeam = p.team === 2 ? 2 : 1;
    const resultStatus = normalizeResultStatus(result?.status);

    let matchResult: MatchHistoryEntry["result"] = "unknown";
    if (resultStatus === "confirmed" && result?.winner_team) {
      if (result.winner_team === myTeam) matchResult = "win";
      else matchResult = "loss";
    }

    const scoreA =
      result && myTeam === 1 ? result.team1_score ?? null : result ? result.team2_score ?? null : null;
    const scoreB =
      result && myTeam === 1 ? result.team2_score ?? null : result ? result.team1_score ?? null : null;

    const resultMeta = metadataObject(result?.metadata);
    const photoUrls = Array.isArray(resultMeta.photo_urls)
      ? (resultMeta.photo_urls as unknown[]).filter((u): u is string => typeof u === "string")
      : [];

    const opponentName = opponentNames.get(`${match.id}:${myTeam === 1 ? 2 : 1}`) ?? null;

    return {
      id: match.id,
      title: match.title,
      matchDate: match.match_date,
      startTime: match.start_time,
      courtName: Array.isArray(match.tennis_courts)
        ? match.tennis_courts[0]?.name ?? "Lapangan tidak diketahui"
        : match.tennis_courts?.name ?? "Lapangan tidak diketahui",
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? category,
      status: match.status ?? "unknown",
      opponentName,
      opponentRating: null,
      scoreA,
      scoreB,
      result: matchResult,
      resultStatus,
      photoUrls,
      createdAt: match.created_at,
      // Diisi setelah rating_history dibaca (lihat getPlayerStats).
      ratingChange: null,
      ratingBefore: null,
      ratingAfter: null,
    };
  });
}

async function getOpponentNames(matchIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (matchIds.length === 0) return map;

  const supabase = createClient();
  const { data: participants } = await supabase
    .from("match_participants")
    .select("match_id, user_id, team, metadata")
    .in("match_id", matchIds);

  const userIds = Array.from(
    new Set((participants ?? []).map((p) => p.user_id).filter(Boolean))
  );
  if (userIds.length === 0) return map;

  const { data: profiles } = await supabase
    .from("player_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);

  const nameByUser = new Map<string, string>();
  (profiles ?? []).forEach((p) => nameByUser.set(p.user_id, p.display_name || "Pemain MATCHPOIN"));

  (participants ?? []).forEach((p) => {
    const meta = metadataObject(p.metadata);
    if (meta.status === "pending" || meta.status === "rejected") return;
    const team = p.team === 2 ? 2 : 1;
    map.set(`${p.match_id}:${team}`, nameByUser.get(p.user_id) ?? "Pemain MATCHPOIN");
  });

  return map;
}

/**
 * Returns aggregated statistics for a given player.
 */
export async function getPlayerStats(userId: string): Promise<PlayerStats> {
  const supabase = createClient();

  const { data: rating } = await supabase
    .from("player_ratings")
    .select("current_rating, peak_rating, matches_played, wins, losses, draws")
    .eq("user_id", userId)
    .maybeSingle();

  const history = await getMatchHistory(userId, 100);

  // Perubahan rating per pertandingan: diambil dari rating_history, yang ditulis
  // saat hasil dikonfirmasi. Pemain bisa melihat naik/turun rating tiap match.
  const { data: ratingRows } = await supabase
    .from("rating_history")
    .select("match_id, old_rating, new_rating, rating_change")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  const ratingByMatch = new Map(
    (ratingRows ?? []).map((row) => [
      row.match_id as string,
      {
        before: row.old_rating === null ? null : Number(row.old_rating),
        after: row.new_rating === null ? null : Number(row.new_rating),
        change:
          row.rating_change !== null && row.rating_change !== undefined
            ? Number(row.rating_change)
            : row.old_rating !== null && row.new_rating !== null
            ? Number(row.new_rating) - Number(row.old_rating)
            : null,
      },
    ])
  );

  const withRating = history.map((entry) => {
    const change = ratingByMatch.get(entry.id);
    return {
      ...entry,
      ratingChange: change?.change ?? null,
      ratingBefore: change?.before ?? null,
      ratingAfter: change?.after ?? null,
    };
  });

  const wins = history.filter((m) => m.result === "win").length;
  const losses = history.filter((m) => m.result === "loss").length;
  const total = wins + losses;
  const winPct = total > 0 ? Math.round((wins / total) * 100) : 0;

  const singles = history.filter(
    (m) => m.category === "mens_singles" || m.category === "womens_singles"
  );
  const doubles = history.filter(
    (m) =>
      m.category === "mens_doubles" ||
      m.category === "womens_doubles" ||
      m.category === "mixed_doubles"
  );

  const totalMatches = rating?.matches_played ?? total;
  const totalWins = rating?.wins ?? wins;
  const totalLosses = rating?.losses ?? losses;
  const winPercentage =
    totalMatches > 0 ? Math.round((totalWins / totalMatches) * 100) : winPct;

  return {
    totalMatches,
    wins: totalWins,
    losses: totalLosses,
    winPercentage,
    singlesMatches: singles.length,
    singlesWins: singles.filter((m) => m.result === "win").length,
    singlesLosses: singles.filter((m) => m.result === "loss").length,
    doublesMatches: doubles.length,
    doublesWins: doubles.filter((m) => m.result === "win").length,
    doublesLosses: doubles.filter((m) => m.result === "loss").length,
    currentRating: Number(rating?.current_rating ?? 1000),
    bestRating: Number(rating?.peak_rating ?? rating?.current_rating ?? 1000000),
    // Maksimal 5 pertandingan terakhir, sesuai tampilan profil.
    recentMatches: withRating.slice(0, 5),
  };
}