import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/errors";
import { MATCH_CATEGORY_LABELS, type MatchCategory } from "@/lib/matches/constants";

export interface MatchActivityPlayer {
  userId: string;
  name: string;
  avatarUrl: string | null;
  rating: number | null;
}

export interface MatchActivityTeam {
  team: 1 | 2;
  players: MatchActivityPlayer[];
  score: number | null;
  isWinner: boolean;
}

export interface MatchActivityEntry {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  matchDate: string;
  startTime: string;
  courtName: string;
  resultStatus: "confirmed" | "pending" | "under_review" | "rejected";
  winnerTeam: 1 | 2 | null;
  teams: [MatchActivityTeam, MatchActivityTeam];
}

type ResultRow = {
  team1_score: number | null;
  team2_score: number | null;
  winner_team: number | null;
  status: string | null;
};

type ParticipantRow = {
  user_id: string;
  team: number | null;
  is_organizer: boolean | null;
  metadata: unknown;
};

type ActivityMatchRow = {
  id: string;
  title: string;
  organizer_id: string;
  match_date: string;
  start_time: string;
  status: string | null;
  metadata: unknown;
  tennis_courts: { name: string } | { name: string }[] | null;
  match_results: ResultRow | ResultRow[] | null;
  match_participants: ParticipantRow[] | null;
};

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstResult(value: ResultRow | ResultRow[] | null): ResultRow | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function courtName(value: ActivityMatchRow["tennis_courts"]): string {
  if (Array.isArray(value)) return value[0]?.name ?? "Lapangan tidak diketahui";
  return value?.name ?? "Lapangan tidak diketahui";
}

function normalizeResultStatus(
  status: string | null | undefined
): MatchActivityEntry["resultStatus"] {
  if (status === "confirmed") return "confirmed";
  if (status === "rejected") return "rejected";
  if (status === "under_review" || status === "disputed") return "under_review";
  return "pending";
}

function isActiveParticipant(metadata: unknown): boolean {
  // "cancelled" = permohonan slot yang dibatalkan sendiri oleh pemohon.
  const status = metadataObject(metadata).status;
  return status !== "pending" && status !== "invited" && status !== "rejected" && status !== "cancelled";
}

/**
 * Recent confirmed matches with the players who competed and the final score.
 *
 * Public on purpose: every player (and guests) can see recent match activity on
 * `/matches`. Only CONFIRMED matches are returned, so a score that is still
 * pending or disputed never leaks publicly. Private matches are excluded by the
 * `matches are publicly readable` RLS policy.
 */
export async function getRecentMatchActivity(limit = 8): Promise<MatchActivityEntry[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("matches")
    .select(
      `
        id,
        title,
        organizer_id,
        match_date,
        start_time,
        status,
        metadata,
        tennis_courts ( name ),
        match_results (
          team1_score,
          team2_score,
          winner_team,
          status
        ),
        match_participants (
          user_id,
          team,
          is_organizer,
          metadata
        )
      `
    )
    .eq("status", "confirmed")
    .order("match_date", { ascending: false })
    .order("start_time", { ascending: false })
    .limit(limit);

  if (error) {
    logError("matches.activity", error);
    throw new Error("Gagal memuat aktivitas pertandingan.");
  }

  const rows = (data ?? []) as unknown as ActivityMatchRow[];
  if (rows.length === 0) return [];

  const userIds = Array.from(
    new Set([
      ...rows.flatMap((row) =>
        (row.match_participants ?? [])
          .filter((participant) => isActiveParticipant(participant.metadata))
          .map((participant) => participant.user_id)
      ),
      // Fallback untuk data lama tanpa baris peserta: host tetap ditampilkan.
      ...rows.map((row) => row.organizer_id),
    ])
  );

  const { data: players } = userIds.length
    ? await supabase
        .from("public_players")
        .select("user_id, display_name, full_name, avatar_url, current_rating")
        .in("user_id", userIds)
    : { data: [] as Array<Record<string, unknown>> };

  const playerById = new Map(
    (players ?? []).map((player) => [
      player.user_id as string,
      {
        userId: player.user_id as string,
        name:
          (player.display_name as string | null) ||
          (player.full_name as string | null) ||
          "Pemain MATCHPOIN",
        avatarUrl: (player.avatar_url as string | null) ?? null,
        rating:
          player.current_rating === null || player.current_rating === undefined
            ? null
            : Number(player.current_rating),
      },
    ])
  );

  return rows.map((row) => {
    const meta = metadataObject(row.metadata);
    const category =
      typeof meta.category === "string" ? (meta.category as MatchCategory) : "mens_singles";
    const result = firstResult(row.match_results);
    const winnerTeam =
      result?.winner_team === 1 || result?.winner_team === 2
        ? (result.winner_team as 1 | 2)
        : null;

    const teamPlayers = (team: 1 | 2): MatchActivityPlayer[] => {
      const players = (row.match_participants ?? [])
        .filter(
          (participant) =>
            isActiveParticipant(participant.metadata) &&
            (participant.team === 2 ? 2 : 1) === team
        )
        .map(
          (participant) =>
            playerById.get(participant.user_id) ?? {
              userId: participant.user_id,
              name: "Pemain MATCHPOIN",
              avatarUrl: null,
              rating: null,
            }
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      // Pertandingan lama bisa tidak punya baris peserta; tampilkan host agar
      // kartu aktivitas tidak kosong.
      if (players.length === 0 && team === 1) {
        const organizer = playerById.get(row.organizer_id);
        if (organizer) return [organizer];
      }
      return players;
    };

    return {
      id: row.id,
      title: row.title,
      category,
      categoryLabel: MATCH_CATEGORY_LABELS[category] ?? category,
      matchDate: row.match_date,
      startTime: row.start_time,
      courtName: courtName(row.tennis_courts),
      resultStatus: normalizeResultStatus(result?.status),
      winnerTeam,
      teams: [
        {
          team: 1,
          players: teamPlayers(1),
          score: result?.team1_score ?? null,
          isWinner: winnerTeam === 1,
        },
        {
          team: 2,
          players: teamPlayers(2),
          score: result?.team2_score ?? null,
          isWinner: winnerTeam === 2,
        },
      ],
    };
  });
}
