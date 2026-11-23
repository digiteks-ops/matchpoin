export const LEADERBOARD_MIN_MATCHES_NON_BEGINNER: number;
export const LEADERBOARD_IMMEDIATE_LEVEL: string;

/** True bila level ini harus mengumpulkan pertandingan dulu. */
export function leaderboardRequiresMatches(level: string | null | undefined): boolean;

/** Batas pertandingan untuk level tersebut (0 untuk beginner). */
export function leaderboardMinMatches(level: string | null | undefined): number;

/** True bila pemain sudah boleh tampil di leaderboard. */
export function isLeaderboardEligible(
  level: string | null | undefined,
  matchesPlayed: number | null | undefined
): boolean;

/** Sisa pertandingan yang dibutuhkan (0 = sudah lolos). */
export function leaderboardMatchesRemaining(
  level: string | null | undefined,
  matchesPlayed: number | null | undefined
): number;
