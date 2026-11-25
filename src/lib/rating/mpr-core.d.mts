export interface MprPlayerState {
  userId: string;
  rating: number;
  matchesPlayed: number;
}

export interface MprChangeResult {
  userId: string;
  oldRating: number;
  newRating: number;
  delta: number;
  expected: number;
  actual: number;
  kFactor: number;
}

export const MPR_STARTING_RATING: number;
export const MPR_DEFAULT_RATING: number;
export const MPR_ABSOLUTE_MIN_RATING: number;
export const MPR_POINT_SWING: number;
export const MPR_K_FACTOR: number;
export const MPR_LOGISTIC_DIVISOR: number;
export const MPR_CALIBRATION_MATCHES: number;
export const MPR_STARTING_RATINGS: Record<string, number>;
export const MPR_CATEGORIES: Array<{
  key: string;
  label: string;
  minRating: number;
  maxRating: number | null;
}>;

export function mprKFactor(matchesPlayed?: number): number;
export function mprExpectedScore(playerRating: number, opponentRating: number): number;
export function mprCategory(rating: number): string;
export function mprCategoryLabel(rating: number): string;
export function mprStartingRating(level: string | null | undefined): number;
export function mprIsCalibrating(matchesPlayed: number | null | undefined): boolean;
export function mprCalibrationRemaining(matchesPlayed: number | null | undefined): number;
export function mprRatingStatus(matchesPlayed: number | null | undefined): "kalibrasi" | "resmi";

export function calculateMprSingles(
  playerA: MprPlayerState,
  playerB: MprPlayerState,
  winner: "A" | "B" | "DRAW"
): { matchK: number; playerA: MprChangeResult; playerB: MprChangeResult };

export function calculateMprDoubles(
  team1: [MprPlayerState, MprPlayerState],
  team2: [MprPlayerState, MprPlayerState],
  winnerTeam: 1 | 2
): {
  matchK: number;
  team1Avg: number;
  team2Avg: number;
  team1Results: MprChangeResult[];
  team2Results: MprChangeResult[];
};
