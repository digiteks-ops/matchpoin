/**
 * DTR — Dynamic Tennis Rating engine (Modified Elo).
 * Thin typed wrapper around the shared dtr-core module so the Supabase app,
 * the admin simulation, and CLI scripts all use the same formula.
 */

import {
  DTR_ABSOLUTE_MIN_RATING,
  DTR_CATEGORIES,
  DTR_DEFAULT_RATING,
  DTR_MIN_RATING,
  calculateDtrSingles,
  calculateDtrDoubles,
  dtrCategoryLabel,
  dtrKFactor,
  dtrStartingRating,
} from "./dtr-core.mjs";

export {
  DTR_ABSOLUTE_MIN_RATING,
  DTR_CATEGORIES,
  DTR_DEFAULT_RATING,
  DTR_MIN_RATING,
  dtrCategoryLabel,
  dtrKFactor,
  dtrStartingRating,
};

export type DtrCategory = "Beginner" | "Intermediate" | "Advanced" | "Expert";

export interface RatingCategoryInfo {
  category: DtrCategory;
  minRating: number;
  maxRating: number;
  description: string;
}

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  beginner:
    "Beginner: maksimal 2 tahun bermain. Membiasakan pukulan dasar, servis, dan konsistensi rally.",
  intermediate:
    "Intermediate: lebih dari 2 tahun bermain. Rally stabil dengan tempo sedang dan pemahaman penempatan lapangan.",
  advanced:
    "Advanced: pernah mengikuti PORDA, PORPROV, PON. Pukulan kuat, antisipasi taktis tinggi, dan performa kompetisi yang matang.",
  expert:
    "Pemain turnamen tingkat tinggi dengan konsistensi dan strategi eksekusi tinggi.",
};

export const RATING_CATEGORIES: RatingCategoryInfo[] = DTR_CATEGORIES.map((category) => ({
  category: category.label as DtrCategory,
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
  kFactorStandard: 30,
  kFactorProvisional: 30,
  provisionalMatchThreshold: 11,
  logisticDivisor: 400,
  // No 1000 floor: DTR_MIN_RATING is the starting rating, not a minimum.
  minRating: DTR_ABSOLUTE_MIN_RATING,
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
 * Returns the DTR rating category for a given rating value.
 */
export function getRatingCategory(rating: number): DtrCategory {
  return dtrCategoryLabel(rating) as DtrCategory;
}

/**
 * E = 1 / (1 + 10 ^ ((Opponent Rating - Player Rating) / 400))
 */
export function calculateExpectedScore(
  ratingA: number,
  ratingB: number,
  logisticDivisor: number = 400
): number {
  return 1 / (1 + Math.pow(10, (ratingB - ratingA) / (logisticDivisor || 400)));
}

/**
 * Generates a clear Indonesian explanation for a DTR rating change.
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
      return `Penyesuaian DTR pemain baru setelah menang (${sign}).`;
    }
    if (isOpponentStronger) {
      return `Kemenangan melawan lawan berating lebih tinggi (${sign}).`;
    }
    if (isOpponentWeaker) {
      return `Kemenangan atas lawan berating lebih rendah (${sign}).`;
    }
    return `Kemenangan imbang melawan lawan selevel (${sign}).`;
  }

  if (isProvisional) {
    return `Penyesuaian DTR pemain baru setelah kalah (${sign}).`;
  }
  if (isOpponentWeaker) {
    return `Kekalahan dari lawan berating lebih rendah (${sign}).`;
  }
  if (isOpponentStronger) {
    return `Kekalahan dari lawan berating lebih tinggi (${sign}).`;
  }
  return `Kekalahan tipis dalam duel seimbang (${sign}).`;
}

function isProvisional(matchesPlayed: number): boolean {
  return (matchesPlayed ?? 0) <= 10;
}

/**
 * Calculates DTR adjustment for a Singles match.
 */
export function calculateSinglesMatchRating(
  playerA: PlayerRatingState,
  playerB: PlayerRatingState,
  winner: "A" | "B" | "DRAW",
  config: RatingEngineConfig = DEFAULT_RATING_CONFIG
): { playerA: RatingChangeResult; playerB: RatingChangeResult } {
  void config;

  const calc = calculateDtrSingles(
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
 * Calculates DTR adjustment for a Doubles or Mixed Doubles match.
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

  const calc = calculateDtrDoubles(
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