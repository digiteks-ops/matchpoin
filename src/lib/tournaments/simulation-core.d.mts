export type SimulatedMatchResult = "win" | "loss";

export interface SimulatedMatch {
  id: string;
  round: number;
  opponent: string;
  opponentRatingBefore: number;
  result: SimulatedMatchResult;
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
  expected: number;
  kFactor: number;
}

export interface SimulatedPlayer {
  id: string;
  name: string;
  rank: number;
  qualified: boolean;
  category: string;
  startRating: number;
  finalRating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  ratingChange: number;
  winRatingGain: number;
  lossRatingDrop: number;
  avgWinGain: number;
  avgLossDrop: number;
  bestWinGain: number;
  worstLossDrop: number;
  matches: SimulatedMatch[];
}

export const SIMULATION_START_RATING: number;
export const SIMULATION_QUALIFIERS: number;
export const SIMULATION_ROUNDS: number;

export function simulateCategory(playerCount?: number): SimulatedPlayer[];