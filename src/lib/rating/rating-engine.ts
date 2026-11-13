/**
 * MATCHPOIN Rating Engine
 * Independent tennis matchmaking & rating engine.
 * Computes objective rating adjustments for Singles, Doubles, and Mixed Doubles.
 */

export interface RatingCategoryInfo {
  category: 'Beginner' | 'Upper Beginner' | 'Low Intermediate' | 'Upper Intermediate' | 'Advanced';
  minRating: number;
  maxRating: number;
  description: string;
}

export const RATING_CATEGORIES: RatingCategoryInfo[] = [
  {
    category: 'Beginner',
    minRating: 1.0,
    maxRating: 2.99,
    description: 'Pemain pemula, membiasakan pukulan dasar dan servis.',
  },
  {
    category: 'Upper Beginner',
    minRating: 3.0,
    maxRating: 4.49,
    description: 'Rally stabil dengan tempo sedang, pemahaman penempatan lapangan dasar.',
  },
  {
    category: 'Low Intermediate',
    minRating: 4.5,
    maxRating: 6.49,
    description: 'Kontrol bola terarah, variasi spin, dan pengalaman tanding terstruktur.',
  },
  {
    category: 'Upper Intermediate',
    minRating: 6.5,
    maxRating: 8.49,
    description: 'Pukulan kuat, antisipasi taktis tinggi, dan performa kompetisi matang.',
  },
  {
    category: 'Advanced',
    minRating: 8.5,
    maxRating: 10.0,
    description: 'Pemain turnamen tingkat tinggi dengan konsistensi dan strategi eksekusi tinggi.',
  },
];

export interface RatingEngineConfig {
  kFactorStandard: number;
  kFactorProvisional: number;
  provisionalMatchThreshold: number;
  logisticDivisor: number;
  minRating: number;
  maxRating: number;
}

export const DEFAULT_RATING_CONFIG: RatingEngineConfig = {
  kFactorStandard: 0.32,
  kFactorProvisional: 0.64,
  provisionalMatchThreshold: 5,
  logisticDivisor: 2.0,
  minRating: 1.0,
  maxRating: 10.0, // Matches the database check constraint and public rating scale
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
}

/**
 * Returns the rating category for a given rating value.
 */
export function getRatingCategory(rating: number): RatingCategoryInfo['category'] {
  if (rating >= 8.5) return 'Advanced';
  if (rating >= 6.5) return 'Upper Intermediate';
  if (rating >= 4.5) return 'Low Intermediate';
  if (rating >= 3.0) return 'Upper Beginner';
  return 'Beginner';
}

/**
 * Computes expected win probability for player A against player B using logistic curve.
 * E_A = 1 / (1 + 10 ^ ((R_B - R_A) / logisticDivisor))
 */
export function calculateExpectedScore(
  ratingA: number,
  ratingB: number,
  logisticDivisor: number = DEFAULT_RATING_CONFIG.logisticDivisor
): number {
  const exponent = (ratingB - ratingA) / logisticDivisor;
  return 1 / (1 + Math.pow(10, exponent));
}

/**
 * Generates clear, human-readable Indonesian explanation for rating changes.
 */
export function generateIndonesianRatingReason(
  isWinner: boolean,
  ratingDelta: number,
  playerRating: number,
  opponentRating: number,
  isProvisional: boolean
): string {
  const ratingDiff = opponentRating - playerRating;
  const isOpponentStronger = ratingDiff >= 0.3;
  const isOpponentWeaker = ratingDiff <= -0.3;
  const sign = ratingDelta >= 0 ? `+${ratingDelta.toFixed(2)}` : ratingDelta.toFixed(2);

  if (isWinner) {
    if (isProvisional) {
      return `Penyesuaian rating provisori pemain baru setelah menang (${sign}).`;
    }
    if (isOpponentStronger) {
      return `Kemenangan mengejutkan melawan pemain dengan rating lebih tinggi (${sign}).`;
    }
    if (isOpponentWeaker) {
      return `Kemenangan sesuai prediksi atas lawan dengan rating lebih rendah (${sign}).`;
    }
    return `Kemenangan imbang kompetitif melawan lawan selevel (${sign}).`;
  } else {
    if (isProvisional) {
      return `Penyesuaian rating provisori pemain baru setelah pertandingan (${sign}).`;
    }
    if (isOpponentWeaker) {
      return `Kekalahan tidak terduga dari lawan dengan rating lebih rendah (${sign}).`;
    }
    if (isOpponentStronger) {
      return `Kekalahan kompetitif melawan pemain unggulan berating lebih tinggi (${sign}).`;
    }
    return `Kekalahan tipis dalam duel seimbang (${sign}).`;
  }
}

/**
 * Calculates rating adjustment for a Singles Tennis Match.
 */
export function calculateSinglesMatchRating(
  playerA: PlayerRatingState,
  playerB: PlayerRatingState,
  winner: 'A' | 'B' | 'DRAW',
  config: RatingEngineConfig = DEFAULT_RATING_CONFIG
): { playerA: RatingChangeResult; playerB: RatingChangeResult } {
  const isProvisionalA = (playerA.matchesPlayed ?? 0) < config.provisionalMatchThreshold;
  const isProvisionalB = (playerB.matchesPlayed ?? 0) < config.provisionalMatchThreshold;

  const kA = isProvisionalA ? config.kFactorProvisional : config.kFactorStandard;
  const kB = isProvisionalB ? config.kFactorProvisional : config.kFactorStandard;

  const expectedA = calculateExpectedScore(playerA.currentRating, playerB.currentRating, config.logisticDivisor);
  const expectedB = 1 - expectedA;

  const scoreA = winner === 'A' ? 1.0 : winner === 'B' ? 0.0 : 0.5;
  const scoreB = 1 - scoreA;

  const rawDeltaA = kA * (scoreA - expectedA);
  const rawDeltaB = kB * (scoreB - expectedB);

  // Round to 2 decimal places
  const deltaA = Math.round(rawDeltaA * 100) / 100;
  const deltaB = Math.round(rawDeltaB * 100) / 100;

  const newRatingA = Math.max(config.minRating, Math.min(config.maxRating, Math.round((playerA.currentRating + deltaA) * 100) / 100));
  const newRatingB = Math.max(config.minRating, Math.min(config.maxRating, Math.round((playerB.currentRating + deltaB) * 100) / 100));

  const isUpsetA = winner === 'A' && playerB.currentRating - playerA.currentRating >= 0.3;
  const isUpsetB = winner === 'B' && playerA.currentRating - playerB.currentRating >= 0.3;

  return {
    playerA: {
      userId: playerA.userId,
      oldRating: playerA.currentRating,
      newRating: newRatingA,
      ratingDelta: deltaA,
      expectedScore: Math.round(expectedA * 1000) / 1000,
      actualScore: scoreA,
      isProvisional: isProvisionalA,
      isUpset: isUpsetA,
      changeReason: generateIndonesianRatingReason(scoreA > scoreB, deltaA, playerA.currentRating, playerB.currentRating, isProvisionalA),
    },
    playerB: {
      userId: playerB.userId,
      oldRating: playerB.currentRating,
      newRating: newRatingB,
      ratingDelta: deltaB,
      expectedScore: Math.round(expectedB * 1000) / 1000,
      actualScore: scoreB,
      isProvisional: isProvisionalB,
      isUpset: isUpsetB,
      changeReason: generateIndonesianRatingReason(scoreB > scoreA, deltaB, playerB.currentRating, playerA.currentRating, isProvisionalB),
    },
  };
}

/**
 * Calculates rating adjustment for Doubles or Mixed Doubles Match.
 * Evaluates team average ratings, expected team win rate, and distributes adjustments.
 */
export function calculateDoublesMatchRating(
  team1: [PlayerRatingState, PlayerRatingState],
  team2: [PlayerRatingState, PlayerRatingState],
  winnerTeam: 1 | 2 | 'DRAW',
  config: RatingEngineConfig = DEFAULT_RATING_CONFIG
): {
  team1Avg: number;
  team2Avg: number;
  team1Results: [RatingChangeResult, RatingChangeResult];
  team2Results: [RatingChangeResult, RatingChangeResult];
} {
  const team1Avg = Math.round(((team1[0].currentRating + team1[1].currentRating) / 2) * 100) / 100;
  const team2Avg = Math.round(((team2[0].currentRating + team2[1].currentRating) / 2) * 100) / 100;

  const expectedTeam1 = calculateExpectedScore(team1Avg, team2Avg, config.logisticDivisor);
  const expectedTeam2 = 1 - expectedTeam1;

  const scoreTeam1 = winnerTeam === 1 ? 1.0 : winnerTeam === 2 ? 0.0 : 0.5;
  const scoreTeam2 = 1 - scoreTeam1;

  function processPlayer(player: PlayerRatingState, expected: number, actual: number, opponentTeamAvg: number) {
    const isProvisional = (player.matchesPlayed ?? 0) < config.provisionalMatchThreshold;
    const k = isProvisional ? config.kFactorProvisional : config.kFactorStandard;
    const rawDelta = k * (actual - expected);
    const delta = Math.round(rawDelta * 100) / 100;
    const newRating = Math.max(config.minRating, Math.min(config.maxRating, Math.round((player.currentRating + delta) * 100) / 100));
    const isUpset = actual > 0.5 && opponentTeamAvg - player.currentRating >= 0.3;

    return {
      userId: player.userId,
      oldRating: player.currentRating,
      newRating,
      ratingDelta: delta,
      expectedScore: Math.round(expected * 1000) / 1000,
      actualScore: actual,
      isProvisional,
      isUpset,
      changeReason: generateIndonesianRatingReason(actual > 0.5, delta, player.currentRating, opponentTeamAvg, isProvisional),
    };
  }

  return {
    team1Avg,
    team2Avg,
    team1Results: [
      processPlayer(team1[0], expectedTeam1, scoreTeam1, team2Avg),
      processPlayer(team1[1], expectedTeam1, scoreTeam1, team2Avg),
    ],
    team2Results: [
      processPlayer(team2[0], expectedTeam2, scoreTeam2, team1Avg),
      processPlayer(team2[1], expectedTeam2, scoreTeam2, team1Avg),
    ],
  };
}
