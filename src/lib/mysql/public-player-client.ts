import { readErrorMessage } from "@/lib/errors";

export interface MySqlPublicPlayer {
  userId: string;
  fullName: string;
  displayName: string;
  avatarUrl: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  cityId: string | null;
  cityName: string;
  province: string | null;
  bio: string | null;
  preferredHand: "right" | "left";
  backhand: "one_handed" | "two_handed";
  playFrequency: "daily" | "weekly" | "biweekly" | "monthly" | "occasional" | null;
  selfAssessedLevel: "beginner" | "intermediate" | "advanced" | null;
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

export interface MySqlPlayerCity {
  id: string;
  name: string;
  province: string;
  sort_order: number | null;
}

interface MySqlPlayerListResponse {
  success: boolean;
  players: MySqlPublicPlayer[];
  cities: MySqlPlayerCity[];
  message?: string;
}

interface MySqlPlayerDetailResponse {
  success: boolean;
  player: MySqlPublicPlayer;
  message?: string;
}

export function isMySqlPublicPlayerReads(): boolean {
  return process.env.NEXT_PUBLIC_PLAYER_READ_BACKEND === "mysql";
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  return readErrorMessage(response, fallback);
}

export async function fetchMySqlPublicPlayers(
  limit: number,
  order: "name" | "rating" = "name"
): Promise<{ players: MySqlPublicPlayer[]; cities: MySqlPlayerCity[] }> {
  const query = new URLSearchParams({ limit: String(limit), order });
  const response = await fetch(`/api/mysql/players?${query}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Gagal memuat daftar pemain."));
  }
  const result = (await response.json()) as MySqlPlayerListResponse;
  if (!result.success || !Array.isArray(result.players) || !Array.isArray(result.cities)) {
    throw new Error(result.message || "Respons daftar pemain tidak valid.");
  }
  return { players: result.players, cities: result.cities };
}

export async function fetchMySqlPublicPlayer(
  userId: string
): Promise<MySqlPublicPlayer | null> {
  const response = await fetch(`/api/mysql/players/${encodeURIComponent(userId)}`, {
    cache: "no-store",
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(await errorMessage(response, "Gagal memuat profil pemain."));
  }
  const result = (await response.json()) as MySqlPlayerDetailResponse;
  if (!result.success || !result.player || typeof result.player.userId !== "string") {
    throw new Error(result.message || "Respons profil pemain tidak valid.");
  }
  return result.player;
}
