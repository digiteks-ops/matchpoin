import type { Connection, RowDataPacket } from "mysql2/promise";

export interface MySqlMatchHistoryEntry {
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
}

export interface MySqlPlayerStats {
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
  recentMatches: MySqlMatchHistoryEntry[];
}

interface HistoryRow extends RowDataPacket {
  id: string;
  title: string;
  match_date: string;
  start_time: string;
  match_status: string;
  match_metadata: unknown;
  created_at: string;
  court_name: string | null;
  team: number;
  result_team1_score: number | null;
  result_team2_score: number | null;
  winner_team: number | null;
  result_status: string | null;
  result_metadata: unknown;
  opponent_name: string | null;
}

interface RatingRow extends RowDataPacket {
  current_rating: number | string | null;
  peak_rating: number | string | null;
  matches_played: number;
  wins: number;
  losses: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  mens_singles: "Tunggal Putra",
  womens_singles: "Tunggal Putri",
  mens_doubles: "Ganda Putra",
  womens_doubles: "Ganda Putri",
  mixed_doubles: "Ganda Campuran",
};

function objectValue(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function resultStatus(status: string | null): MySqlMatchHistoryEntry["resultStatus"] {
  if (status === "confirmed") return "confirmed";
  if (status === "pending") return "pending";
  if (status === "under_review" || status === "disputed") return "under_review";
  return "none";
}

export async function getMySqlPlayerStats(
  connection: Connection,
  userId: string
): Promise<MySqlPlayerStats> {
  const [historyRows] = await connection.execute<HistoryRow[]>(
    `SELECT match_record.id, match_record.title,
            DATE_FORMAT(match_record.match_date, '%Y-%m-%d') AS match_date,
            TIME_FORMAT(match_record.start_time, '%H:%i:%s') AS start_time,
            match_record.status AS match_status, match_record.metadata AS match_metadata,
            DATE_FORMAT(match_record.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
            court.name AS court_name, participant.team,
            match_result.team1_score AS result_team1_score,
            match_result.team2_score AS result_team2_score,
            match_result.winner_team, match_result.status AS result_status,
            match_result.metadata AS result_metadata,
            (
              SELECT COALESCE(profile.display_name, opponent.full_name)
              FROM match_participants AS opponent_participant
              JOIN users AS opponent ON opponent.id = opponent_participant.user_id
              LEFT JOIN player_profiles AS profile ON profile.user_id = opponent.id
              WHERE opponent_participant.match_id = match_record.id
                AND opponent_participant.user_id <> participant.user_id
                AND opponent_participant.team <> participant.team
                AND opponent_participant.left_at IS NULL
                AND (opponent_participant.is_organizer = TRUE OR
                  COALESCE(JSON_UNQUOTE(JSON_EXTRACT(opponent_participant.metadata, '$.status')), 'confirmed') = 'confirmed')
              ORDER BY opponent_participant.joined_at ASC
              LIMIT 1
            ) AS opponent_name
     FROM match_participants AS participant
     JOIN matches AS match_record ON match_record.id = participant.match_id
     LEFT JOIN tennis_courts AS court ON court.id = match_record.court_id
     LEFT JOIN match_results AS match_result ON match_result.match_id = match_record.id
     WHERE participant.user_id = ? AND participant.left_at IS NULL
     ORDER BY match_record.match_date DESC, match_record.start_time DESC,
              match_record.created_at DESC
     LIMIT 100`,
    [userId]
  );
  const [ratings] = await connection.execute<RatingRow[]>(
    `SELECT current_rating, peak_rating, matches_played, wins, losses
     FROM player_ratings WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const rating = ratings[0];
  const recentMatches = historyRows.map((row): MySqlMatchHistoryEntry => {
    const metadata = objectValue(row.match_metadata);
    const category = typeof metadata.category === "string" ? metadata.category : "mens_singles";
    const status = resultStatus(row.result_status);
    const team = row.team === 2 ? 2 : 1;
    const scoreA =
      row.result_team1_score === null
        ? null
        : team === 1 ? row.result_team1_score : row.result_team2_score;
    const scoreB =
      row.result_team2_score === null
        ? null
        : team === 1 ? row.result_team2_score : row.result_team1_score;
    const result =
      status !== "confirmed" || row.winner_team === null
        ? "unknown"
        : row.winner_team === team ? "win" : "loss";
    const resultMetadata = objectValue(row.result_metadata);
    return {
      id: row.id,
      title: row.title,
      matchDate: row.match_date,
      startTime: row.start_time,
      courtName: row.court_name || "Lapangan tidak diketahui",
      category,
      categoryLabel: CATEGORY_LABELS[category] ?? category,
      status: row.match_status,
      opponentName: row.opponent_name,
      opponentRating: null,
      scoreA,
      scoreB,
      result,
      resultStatus: status,
      photoUrls: Array.isArray(resultMetadata.photo_urls)
        ? resultMetadata.photo_urls.filter((url): url is string => typeof url === "string")
        : [],
      createdAt: row.created_at,
    };
  });
  const winsFromHistory = recentMatches.filter((match) => match.result === "win").length;
  const lossesFromHistory = recentMatches.filter((match) => match.result === "loss").length;
  const singles = recentMatches.filter((match) => match.category.endsWith("_singles"));
  const doubles = recentMatches.filter((match) => match.category.endsWith("_doubles"));
  const totalMatches = Number(rating?.matches_played ?? winsFromHistory + lossesFromHistory);
  const wins = Number(rating?.wins ?? winsFromHistory);
  const losses = Number(rating?.losses ?? lossesFromHistory);

  return {
    totalMatches,
    wins,
    losses,
    winPercentage: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
    singlesMatches: singles.length,
    singlesWins: singles.filter((match) => match.result === "win").length,
    singlesLosses: singles.filter((match) => match.result === "loss").length,
    doublesMatches: doubles.length,
    doublesWins: doubles.filter((match) => match.result === "win").length,
    doublesLosses: doubles.filter((match) => match.result === "loss").length,
    currentRating: Number(rating?.current_rating ?? 1),
    bestRating: Number(rating?.peak_rating ?? rating?.current_rating ?? 1),
    recentMatches: recentMatches.slice(0, 5),
  };
}
