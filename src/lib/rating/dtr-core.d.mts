export interface DtrPlayerState {
  userId: string;
  rating: number;
  matchesPlayed: number;
}

export interface DtrChangeResult {
  userId: string;
  oldRating: number;
  newRating: number;
  delta: number;
  expected: number;
  actual: number;
  kFactor: number;
}

export const DTR_MIN_RATING: number;
export const DTR_DEFAULT_RATING: number;
export const DTR_ABSOLUTE_MIN_RATING: number;
export const DTR_K_FACTOR: number;
export const DTR_LOGISTIC_DIVISOR: number;
export const DTR_STARTING_RATINGS: Record<string, number>;
export const DTR_CATEGORIES: Array<{
  key: string;
  label: string;
  minRating: number;
  maxRating: number | null;
}>;

export function dtrKFactor(matchesPlayed?: number): number;
export function dtrExpectedScore(playerRating: number, opponentRating: number): number;
export function dtrCategory(rating: number): string;
export function dtrCategoryLabel(rating: number): string;
export function dtrStartingRating(level: string | null | undefined): number;

export function calculateDtrSingles(
  playerA: DtrPlayerState,
  playerB: DtrPlayerState,
  winner: "A" | "B" | "DRAW"
): { matchK: number; playerA: DtrChangeResult; playerB: DtrChangeResult };

export function calculateDtrDoubles(
  team1: [DtrPlayerState, DtrPlayerState],
  team2: [DtrPlayerState, DtrPlayerState],
  winnerTeam: 1 | 2
): {
  matchK: number;
  team1Avg: number;
  team2Avg: number;
  team1Results: DtrChangeResult[];
  team2Results: DtrChangeResult[];
};