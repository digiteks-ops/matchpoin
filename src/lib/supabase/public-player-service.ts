import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PublicPlayer {
  userId: string;
  email: null;
  fullName: string;
  displayName: string;
  avatarUrl: string | null;
  gender: string | null;
  cityId: string | null;
  cityName: string;
  province: string | null;
  bio: string | null;
  preferredHand: "right" | "left";
  backhand: "one_handed" | "two_handed";
  playFrequency: string | null;
  selfAssessedLevel: string | null;
  playingSince: string | null;
  preferredCategories: string[];
  preferredTimes: string[];
  currentRating: number | null;
  peakRating: number | null;
  isProvisional: boolean;
  matchesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  winRate: number;
  completionScore: number;
  isProfilePublic: boolean;
  allowInvites: boolean;
  showRating: boolean;
  isVerifiedPlayer: boolean;
}

export interface PlayerCity {
  id: string;
  name: string;
  province: string;
  sort_order: number | null;
}

interface PublicPlayerRow {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
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
  completion_score: number | null;
  allow_invites: boolean | null;
  show_rating: boolean | null;
  current_rating: number | string | null;
  peak_rating: number | string | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  is_verified_player: boolean | null;
}

const ORDERING = {
  rating: [
    { column: "current_rating", ascending: false },
    { column: "wins", ascending: false },
    { column: "matches_played", ascending: false },
    { column: "display_name", ascending: true },
  ],
  name: [{ column: "display_name", ascending: true }],
} as const;

function arrayValue(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function mapPublicPlayer(row: PublicPlayerRow): PublicPlayer {
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
    isProvisional: matchesPlayed === 0,
    matchesPlayed: row.matches_played === null ? null : matchesPlayed,
    wins: row.wins === null ? null : wins,
    losses: row.losses === null ? null : Number(row.losses),
    winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
    completionScore: Number(row.completion_score ?? 0),
    isProfilePublic: true,
    allowInvites: Boolean(row.allow_invites),
    showRating: Boolean(row.show_rating),
    isVerifiedPlayer: Boolean(row.is_verified_player),
  };
}

const PUBLIC_PLAYER_COLUMNS =
  "user_id, display_name, full_name, avatar_url, gender, city_id, city_name, province, bio, preferred_hand, backhand, play_frequency, preferred_categories, preferred_times, self_assessed_level, playing_since, completion_score, allow_invites, show_rating, current_rating, peak_rating, matches_played, wins, losses, draws, is_verified_player";

function client() {
  const supabase = createAdminClient();
  if (!supabase) throw new Error("Supabase service role is not configured.");
  return supabase;
}

export async function getPublicPlayers(
  limit: number,
  order: "name" | "rating" = "name"
): Promise<PublicPlayer[]> {
  let query = client().from("public_players").select(PUBLIC_PLAYER_COLUMNS).limit(limit);
  for (const clause of ORDERING[order]) {
    query = query.order(clause.column, { ascending: clause.ascending });
  }
  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat daftar pemain: ${error.message}`);
  return ((data ?? []) as PublicPlayerRow[]).map(mapPublicPlayer);
}

export async function getPublicPlayer(userId: string): Promise<PublicPlayer | null> {
  const { data, error } = await client()
    .from("public_players")
    .select(PUBLIC_PLAYER_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`Gagal memuat profil pemain: ${error.message}`);
  return data ? mapPublicPlayer(data as PublicPlayerRow) : null;
}

export async function getActiveCities(): Promise<PlayerCity[]> {
  const { data, error } = await client()
    .from("cities")
    .select("id, name, province, sort_order")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .order("province", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw new Error(`Gagal memuat kota: ${error.message}`);
  return (data ?? []) as PlayerCity[];
}
