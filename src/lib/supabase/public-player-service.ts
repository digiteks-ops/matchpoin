import "server-only";
import { unstable_cache } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { mprIsCalibrating } from "@/lib/rating/mpr-core.mjs";

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
  /**
   * Waktu login terakhir (ISO 8601) dari `player_profiles.last_seen_at`.
   * Null bila pemain belum pernah login sejak pencatatan ini ada.
   */
  lastSeenAt: string | null;
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
  last_seen_at: string | null;
}

interface OrderClause {
  column: string;
  ascending: boolean;
  nullsFirst?: boolean;
}

const ORDERING: Record<PublicPlayerOrder, OrderClause[]> = {
  rating: [
    { column: "current_rating", ascending: false },
    { column: "wins", ascending: false },
    { column: "matches_played", ascending: false },
    { column: "display_name", ascending: true },
  ],
  name: [{ column: "display_name", ascending: true }],
  // Terakhir login paling atas. `nullsFirst: false` menaruh pemain yang belum
  // pernah login di paling bawah, bukan di atas.
  last_active: [
    { column: "last_seen_at", ascending: false, nullsFirst: false },
    { column: "display_name", ascending: true },
  ],
} satisfies Record<PublicPlayerOrder, OrderClause[]>;

export type PublicPlayerOrder = "name" | "rating" | "last_active";

/** Validasi `?order=` dari query string; nilai tak dikenal jadi "name". */
export function normalizePublicPlayerOrder(value: string | null): PublicPlayerOrder {
  return value === "rating" || value === "last_active" ? value : "name";
}

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
    lastSeenAt: row.last_seen_at ?? null,
  };
}

const PUBLIC_PLAYER_COLUMNS =
  "user_id, display_name, full_name, avatar_url, gender, city_id, city_name, province, bio, preferred_hand, backhand, play_frequency, preferred_categories, preferred_times, self_assessed_level, playing_since, completion_score, allow_invites, show_rating, current_rating, peak_rating, matches_played, wins, losses, draws, is_verified_player, last_seen_at";

/** Sama seperti di atas tanpa `last_seen_at` (sebelum migration 00035). */
const PUBLIC_PLAYER_COLUMNS_LEGACY = PUBLIC_PLAYER_COLUMNS.replace(", last_seen_at", "");

/**
 * True bila error muncul karena `last_seen_at` belum ada di view, yaitu ketika
 * migration 00035 belum dijalankan. Hanya kasus itu yang di-fallback, supaya
 * error lain tetap terlihat.
 */
function isMissingLastSeenColumn(error: { message?: string } | null): boolean {
  return Boolean(error?.message && error.message.includes("last_seen_at"));
}

function client() {
  // Public data (players view + active cities) only needs the anon key. Using
  // the anon client first keeps /players and /leaderboard working even when the
  // service key is missing or invalid (e.g. a stale Vercel env var).
  const supabase = createPublicClient() ?? createAdminClient();
  if (!supabase) throw new Error("Supabase belum dikonfigurasi (URL/anon key).");
  return supabase;
}

async function runPublicPlayersQuery(
  limit: number,
  order: PublicPlayerOrder,
  columns: string = PUBLIC_PLAYER_COLUMNS
) {
  let query = client().from("public_players").select(columns).limit(limit);
  for (const clause of ORDERING[order]) {
    query = query.order(clause.column, {
      ascending: clause.ascending,
      ...(clause.nullsFirst === undefined ? {} : { nullsFirst: clause.nullsFirst }),
    });
  }
  return query;
}

export async function getPublicPlayers(
  limit: number,
  order: PublicPlayerOrder = "name"
): Promise<PublicPlayer[]> {
  let { data, error } = await runPublicPlayersQuery(limit, order);

  // Sebelum migration 00035, kolom `last_seen_at` belum ada. Jangan sampai
  // seluruh direktori pemain gagal hanya karena info login: ulangi tanpa kolom
  // tersebut dan urutkan menurut nama.
  if (isMissingLastSeenColumn(error)) {
    ({ data, error } = await runPublicPlayersQuery(
      limit,
      order === "last_active" ? "name" : order,
      PUBLIC_PLAYER_COLUMNS_LEGACY
    ));
  }

  if (error) throw new Error(`Gagal memuat daftar pemain: ${error.message}`);
  return ((data ?? []) as unknown as PublicPlayerRow[]).map(mapPublicPlayer);
}

export async function getPublicPlayer(userId: string): Promise<PublicPlayer | null> {
  let { data, error } = await client()
    .from("public_players")
    .select(PUBLIC_PLAYER_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (isMissingLastSeenColumn(error)) {
    ({ data, error } = await client()
      .from("public_players")
      .select(PUBLIC_PLAYER_COLUMNS_LEGACY)
      .eq("user_id", userId)
      .maybeSingle());
  }

  if (error) throw new Error(`Gagal memuat profil pemain: ${error.message}`);
  return data ? mapPublicPlayer(data as PublicPlayerRow) : null;
}

// Cities change rarely: cache the list for an hour across requests.
export const getActiveCities = unstable_cache(
  async (): Promise<PlayerCity[]> => {
    const { data, error } = await client()
      .from("cities")
      .select("id, name, province, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("province", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(`Gagal memuat kota: ${error.message}`);
    return (data ?? []) as PlayerCity[];
  },
  ["active-cities"],
  { revalidate: 3600, tags: ["cities"] }
);
