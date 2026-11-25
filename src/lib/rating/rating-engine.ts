/**
 * MPR — MatchPoin Rating engine (Modified Elo).
 * Thin typed wrapper around the shared mpr-core module so the Supabase app,
 * the admin simulation, and CLI scripts all use the same formula.
 */

import {
  MPR_ABSOLUTE_MIN_RATING,
  MPR_CALIBRATION_MATCHES,
  MPR_CATEGORIES,
  MPR_DEFAULT_RATING,
  MPR_K_FACTOR,
  MPR_LOGISTIC_DIVISOR,
  MPR_POINT_SWING,
  MPR_STARTING_RATING,
  calculateMprSingles,
  calculateMprDoubles,
  mprCalibrationRemaining,
  mprCategoryLabel,
  mprIsCalibrating,
  mprKFactor,
  mprRatingStatus,
  mprStartingRating,
} from "./mpr-core.mjs";

export {
  MPR_ABSOLUTE_MIN_RATING,
  MPR_CALIBRATION_MATCHES,
  MPR_CATEGORIES,
  MPR_DEFAULT_RATING,
  MPR_K_FACTOR,
  MPR_LOGISTIC_DIVISOR,
  MPR_POINT_SWING,
  MPR_STARTING_RATING,
  mprCalibrationRemaining,
  mprCategoryLabel,
  mprIsCalibrating,
  mprKFactor,
  mprRatingStatus,
  mprStartingRating,
};

export type MprCategory = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export interface RatingCategoryInfo {
  category: MprCategory;
  minRating: number;
  maxRating: number;
  description: string;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  beginner:
    "Beginner (MPR 0–1099): maksimal 2 tahun bermain. Membiasakan pukulan dasar, servis, dan konsistensi rally.",
  intermediate:
    "Intermediate (MPR 1100–1599): lebih dari 2 tahun bermain. Rally stabil dengan tempo sedang dan pemahaman penempatan lapangan.",
  advanced:
    "Advanced (MPR 1600–1999): pernah mengikuti PORDA, PORPROV, PON. Pukulan kuat, antisipasi taktis tinggi, dan performa kompetisi yang matang.",
  expert:
    "Expert (MPR 2000+): pemain turnamen tingkat tinggi dengan konsistensi dan strategi eksekusi tinggi.",
};

export const RATING_CATEGORIES: RatingCategoryInfo[] = MPR_CATEGORIES.map((category) => ({
  category: category.label as MprCategory,
  minRating: category.minRating,
  maxRating: category.maxRating ?? Number.MAX_SAFE_INTEGER,
  description: CATEGORY_DESCRIPTIONS[category.key] ?? "",
}));

export interface RatingEngineConfig {
  kFactorStandard: number;
  kFactorProvisional: number;
  provisionalMatchThreshold: number;
  logisticDivisor: number;
  minRating: number;
  maxRating: number;
}

export const DEFAULT_RATING_CONFIG: RatingEngineConfig = {
  kFactorStandard: MPR_K_FACTOR,
  kFactorProvisional: MPR_K_FACTOR,
  provisionalMatchThreshold: MPR_CALIBRATION_MATCHES,
  logisticDivisor: MPR_LOGISTIC_DIVISOR,
  // 1000 adalah rating awal, bukan lantai: rating boleh turun di bawahnya.
  minRating: MPR_ABSOLUTE_MIN_RATING,
  maxRating: Number.MAX_SAFE_INTEGER,
};

export interface PlayerRatingState {
  userId: string;
  currentRating: number;
  matchesPlayed: number;
  isProvisional?: boolean;
}

export interface RatingChangeResult {
  userId: string;
  oldRating: number;
  newRating: number;
  ratingDelta: number;
  expectedScore: number;
  actualScore: number;
  isProvisional: boolean;
  isUpset: boolean;
  changeReason: string;
  kFactor: number;
}

/**
 * Returns the MPR category for a given rating value.
 */
export function getRatingCategory(rating: number): MprCategory {
  return mprCategoryLabel(rating) as MprCategory;
}

/**
 * E = 1 / (1 + 10 ^ ((Opponent Rating - Player Rating) / 400))
 */
export function calculateExpectedScore(
  ratingA: number,
  ratingB: number,
  logisticDivisor: number = MPR_LOGISTIC_DIVISOR
): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / (logisticDivisor || MPR_LOGISTIC_DIVISOR)));
}

/**
 * Generates a clear Indonesian explanation for an MPR rating change.
 */
export function generateIndonesianRatingReason(
  isWinner: boolean,
  ratingDelta: number,
  playerRating: number,
  opponentRating: number,
  isProvisional: boolean
): string {
  const ratingDiff = opponentRating - playerRating;
  const isOpponentStronger = ratingDiff >= 30;
  const isOpponentWeaker = ratingDiff <= -30;
  const sign = ratingDelta >= 0 ? `+${Math.round(ratingDelta)}` : `${Math.round(ratingDelta)}`;

  if (isWinner) {
    if (isProvisional) {
      return `Penyesuaian MPR pemain baru setelah menang (${sign}).`;
    }
    if (isOpponentStronger) {
      return `Menang lawan rating lebih tinggi, poin besar (${sign}).`;
    }
    if (isOpponentWeaker) {
      return `Menang lawan rating lebih rendah, poin kecil (${sign}).`;
    }
    return `Menang lawan seimbang (${sign}).`;
  }

  if (isProvisional) {
    return `Penyesuaian MPR pemain baru setelah kalah (${sign}).`;
  }
  if (isOpponentWeaker) {
    return `Kalah dari lawan rating lebih rendah, poin minus besar (${sign}).`;
  }
  if (isOpponentStronger) {
    return `Kalah dari lawan rating lebih tinggi, minus kecil (${sign}).`;
  }
  return `Kalah lawan seimbang (${sign}).`;
}

/**
 * Kalibrasi = dua pertandingan pertama. Rating tetap bergerak, tetapi belum
 * dianggap peringkat resmi sampai kalibrasi selesai.
 */
function isProvisional(matchesPlayed: number): boolean {
  return mprIsCalibrating(matchesPlayed);
}

/**
 * Calculates the MPR adjustment for a Singles match.
 */
export function calculateSinglesMatchRating(
  playerA: PlayerRatingState,
  playerB: PlayerRatingState,
  winner: "A" | "B" | "DRAW",
  config: RatingEngineConfig = DEFAULT_RATING_CONFIG
): { playerA: RatingChangeResult; playerB: RatingChangeResult } {
  void config;

  const calc = calculateMprSingles(
    {
      userId: playerA.userId,
      rating: playerA.currentRating,
      matchesPlayed: playerA.matchesPlayed ?? 0,
    },
    {
      userId: playerB.userId,
      rating: playerB.currentRating,
      matchesPlayed: playerB.matchesPlayed ?? 0,
    },
    winner
  );

  const provisionalA = isProvisional(playerA.matchesPlayed);
  const provisionalB = isProvisional(playerB.matchesPlayed);

  return {
    playerA: {
      userId: calc.playerA.userId,
      oldRating: calc.playerA.oldRating,
      newRating: calc.playerA.newRating,
      ratingDelta: calc.playerA.delta,
      expectedScore: calc.playerA.expected,
      actualScore: calc.playerA.actual,
      isProvisional: provisionalA,
      isUpset:
        winner === "A" && playerB.currentRating - playerA.currentRating >= 30,
      changeReason: generateIndonesianRatingReason(
        winner === "A",
        calc.playerA.delta,
        calc.playerA.oldRating,
        calc.playerB.oldRating,
        provisionalA
      ),
      kFactor: calc.playerA.kFactor,
    },
    playerB: {
      userId: calc.playerB.userId,
      oldRating: calc.playerB.oldRating,
      newRating: calc.playerB.newRating,
      ratingDelta: calc.playerB.delta,
      expectedScore: calc.playerB.expected,
      actualScore: calc.playerB.actual,
      isProvisional: provisionalB,
      isUpset:
        winner === "B" && playerA.currentRating - playerB.currentRating >= 30,
      changeReason: generateIndonesianRatingReason(
        winner === "B",
        calc.playerB.delta,
        calc.playerB.oldRating,
        calc.playerA.oldRating,
        provisionalB
      ),
      kFactor: calc.playerB.kFactor,
    },
  };
}

/**
 * Calculates the MPR adjustment for a Doubles or Mixed Doubles match.
 * Team rating is the average of the pair; Match K is the average of all four.
 */
export function calculateDoublesMatchRating(
  team1: [PlayerRatingState, PlayerRatingState],
  team2: [PlayerRatingState, PlayerRatingState],
  winnerTeam: 1 | 2 | "DRAW",
  config: RatingEngineConfig = DEFAULT_RATING_CONFIG
): {
  team1Avg: number;
  team2Avg: number;
  team1Results: [RatingChangeResult, RatingChangeResult];
  team2Results: [RatingChangeResult, RatingChangeResult];
} {
  void config;

  const normalizedWinner: 1 | 2 = winnerTeam === 2 ? 2 : 1;

  const calc = calculateMprDoubles(
    [
      {
        userId: team1[0].userId,
        rating: team1[0].currentRating,
        matchesPlayed: team1[0].matchesPlayed ?? 0,
      },
      {
        userId: team1[1].userId,
        rating: team1[1].currentRating,
        matchesPlayed: team1[1].matchesPlayed ?? 0,
      },
    ],
    [
      {
        userId: team2[0].userId,
        rating: team2[0].currentRating,
        matchesPlayed: team2[0].matchesPlayed ?? 0,
      },
      {
        userId: team2[1].userId,
        rating: team2[1].currentRating,
        matchesPlayed: team2[1].matchesPlayed ?? 0,
      },
    ],
    normalizedWinner
  );

  const toResult = (
    player: PlayerRatingState,
    result: typeof calc.team1Results[number],
    opponentTeamAvg: number
  ): RatingChangeResult => ({
    userId: result.userId,
    oldRating: result.oldRating,
    newRating: result.newRating,
    ratingDelta: result.delta,
    expectedScore: result.expected,
    actualScore: result.actual,
    isProvisional: isProvisional(player.matchesPlayed),
    isUpset:
      result.actual > 0.5 && opponentTeamAvg - player.currentRating >= 30,
    changeReason: generateIndonesianRatingReason(
      result.actual > 0.5,
      result.delta,
      result.oldRating,
      opponentTeamAvg,
      isProvisional(player.matchesPlayed)
    ),
    kFactor: result.kFactor,
  });

  return {
    team1Avg: calc.team1Avg,
    team2Avg: calc.team2Avg,
    team1Results: [
      toResult(team1[0], calc.team1Results[0], calc.team2Avg),
      toResult(team1[1], calc.team1Results[1], calc.team2Avg),
    ],
    team2Results: [
      toResult(team2[0], calc.team2Results[0], calc.team1Avg),
      toResult(team2[1], calc.team2Results[1], calc.team1Avg),
    ],
  };
}