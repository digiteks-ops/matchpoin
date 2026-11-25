import type { Connection, RowDataPacket } from "mysql2/promise";
import { mprIsCalibrating } from "@/lib/rating/mpr-core.mjs";

interface PublicPlayerRow extends RowDataPacket {
  user_id: string;
  display_name: string;
  full_name: string;
  avatar_url: string | null;
  gender: string | null;
  city_id: string | null;
  city_name: string | null;
  province: string | null;
  bio: string | null;
  preferred_hand: string | null;
  backhand: string | null;
  play_frequency: string | null;
  preferred_categories: unknown;
  preferred_times: unknown;
  self_assessed_level: string | null;
  playing_since: string | null;
  completion_score: number;
  allow_invites: boolean | number;
  show_rating: boolean | number;
  current_rating: number | string | null;
  peak_rating: number | string | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  is_verified_player: boolean | number;
}

interface CityRow extends RowDataPacket {
  id: string;
  name: string;
  province: string;
  sort_order: number | null;
}

function arrayValue(value: unknown): string[] {
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function mapPublicPlayer(row: PublicPlayerRow) {
  const matchesPlayed = Number(row.matches_played ?? 0);
  const wins = Number(row.wins ?? 0);
  return {
    userId: row.user_id,
    email: null,
    fullName: row.full_name || row.display_name || "Pemain MATCHPOIN",
    displayName: row.display_name || "Pemain MATCHPOIN",
    avatarUrl: row.avatar_url,
    gender: row.gender,
    cityId: row.city_id,
    cityName: row.city_name || "Lokasi belum diisi",
    province: row.province,
    bio: row.bio,
    preferredHand: row.preferred_hand === "left" ? "left" : "right",
    backhand: row.backhand === "one_handed" ? "one_handed" : "two_handed",
    playFrequency: row.play_frequency,
    selfAssessedLevel: row.self_assessed_level,
    playingSince: row.playing_since,
    preferredCategories: arrayValue(row.preferred_categories),
    preferredTimes: arrayValue(row.preferred_times),
    currentRating: row.current_rating === null ? null : Number(row.current_rating),
    peakRating: row.peak_rating === null ? null : Number(row.peak_rating),
    isProvisional: mprIsCalibrating(matchesPlayed),
    matchesPlayed: row.matches_played === null ? null : matchesPlayed,
    wins: row.wins === null ? null : wins,
    losses: row.losses === null ? null : Number(row.losses),
    winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
    completionScore: Number(row.completion_score ?? 0),
    isProfilePublic: true,
    allowInvites: Boolean(row.allow_invites),
    // MPR setiap pemain terpublish: rating tidak lagi disembunyikan.
    showRating: true,
    isVerifiedPlayer: Boolean(row.is_verified_player),
  };
}

export async function getPublicPlayers(
  connection: Connection,
  limit: number,
  order: "name" | "rating" = "name"
) {
  const ordering =
    order === "rating"
      ? "current_rating DESC, wins DESC, matches_played DESC, display_name ASC"
      : "display_name ASC";
  const [rows] = await connection.query<PublicPlayerRow[]>(
    `SELECT * FROM public_players ORDER BY ${ordering} LIMIT ?`,
    [limit]
  );
  return rows.map(mapPublicPlayer);
}

export async function getPublicPlayer(connection: Connection, userId: string) {
  const [rows] = await connection.execute<PublicPlayerRow[]>(
    "SELECT * FROM public_players WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return rows[0] ? mapPublicPlayer(rows[0]) : null;
}

export async function getActiveCities(connection: Connection) {
  const [rows] = await connection.execute<CityRow[]>(
    `SELECT id, name, province, sort_order FROM cities
     WHERE is_active = TRUE ORDER BY sort_order ASC, province ASC, name ASC`
  );
  return rows;
}
