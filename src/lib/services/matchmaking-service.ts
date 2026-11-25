import { FullPlayerProfile } from "@/types/database.types";

export type CompatibilityTier = "Sangat Cocok" | "Cocok" | "Cukup Cocok";

export interface MatchmakingRecommendation {
  player: FullPlayerProfile;
  score: number;
  label: CompatibilityTier;
  ratingDiff: number;
  isSameCity: boolean;
  sharedFormats: string[];
  sharedTimes: string[];
  disclaimer: string;
}

/**
 * Computes matchmaking compatibility score and recommendation details.
 */
export function calculatePlayerCompatibility(
  currentUser: FullPlayerProfile,
  candidate: FullPlayerProfile
): MatchmakingRecommendation {
  let score = 0;

  // 1. MPR delta evaluation (max 40 pts)
  const ratingDiff = Math.abs(currentUser.currentRating - candidate.currentRating);
  if (ratingDiff <= 50) {
    score += 40;
  } else if (ratingDiff <= 100) {
    score += 25;
  } else if (ratingDiff <= 200) {
    score += 10;
  } else {
    score += 0;
  }

  // 2. City comparison (max 30 pts)
  const isSameCity = currentUser.cityId && candidate.cityId ? currentUser.cityId === candidate.cityId : true;
  if (isSameCity) {
    score += 30;
  }

  // 3. Format overlap (max 15 pts)
  const sharedFormats = (currentUser.preferredCategories || []).filter((f) =>
    (candidate.preferredCategories || []).includes(f)
  );
  if (sharedFormats.length > 0) {
    score += 15;
  } else if (!currentUser.preferredCategories?.length || !candidate.preferredCategories?.length) {
    score += 10; // Neutral default
  }

  // 4. Availability & time overlap (max 15 pts)
  const sharedTimes = (currentUser.preferredTimes || []).filter((t) =>
    (candidate.preferredTimes || []).includes(t)
  );
  if (sharedTimes.length > 0) {
    score += 15;
  } else if (!currentUser.preferredTimes?.length || !candidate.preferredTimes?.length) {
    score += 10; // Neutral default
  }

  // Assign label
  let label: CompatibilityTier = "Cukup Cocok";
  if (score >= 75) {
    label = "Sangat Cocok";
  } else if (score >= 50) {
    label = "Cocok";
  }

  return {
    player: candidate,
    score,
    label,
    ratingDiff: Math.round(ratingDiff),
    isSameCity,
    sharedFormats,
    sharedTimes,
    disclaimer:
      "Jadwal dan ketersediaan dapat berubah sewaktu-waktu. Silakan kirim undangan pertandingan untuk menyepakati waktu bermain bersama.",
  };
}

/**
 * Generates ranked recommendations for a player from an array of candidates.
 */
export function getRecommendedOpponents(
  currentUser: FullPlayerProfile,
  allPlayers: FullPlayerProfile[],
  limit: number = 6
): MatchmakingRecommendation[] {
  return allPlayers
    .filter((p) => p.userId !== currentUser.userId && p.isProfilePublic)
    .map((candidate) => calculatePlayerCompatibility(currentUser, candidate))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
