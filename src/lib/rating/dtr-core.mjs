// DTR — Dynamic Tennis Rating (Modified Elo, integer scale starting at 1000).
// Shared by the Supabase rating engine, the admin simulation, and CLI scripts.

// Rating a new player starts at. This is NOT a floor: a losing player keeps
// dropping below 1000, with DTR_ABSOLUTE_MIN_RATING as the only safety net.
export const DTR_MIN_RATING = 1000;
export const DTR_DEFAULT_RATING = 1000;
// Guard against corrupt arithmetic only; kept in sync with the CHECK
// constraints in supabase/migrations/00031_dtr_no_rating_floor.sql.
export const DTR_ABSOLUTE_MIN_RATING = 1;
export const DTR_K_FACTOR = 30;
export const DTR_LOGISTIC_DIVISOR = 400;

export const DTR_STARTING_RATINGS = {
  beginner: 1000,
  intermediate: 1500,
  advanced: 2000,
  expert: 2500,
};

export const DTR_CATEGORIES = [
  { key: "beginner", label: "Beginner", minRating: 1000, maxRating: 1499 },
  { key: "intermediate", label: "Intermediate", minRating: 1500, maxRating: 1999 },
  { key: "advanced", label: "Advanced", minRating: 2000, maxRating: 2499 },
  { key: "expert", label: "Expert", minRating: 2500, maxRating: null },
];

// DTR uses one fixed K factor for every match.
export function dtrKFactor(_matchesPlayed) {
  return DTR_K_FACTOR;
}

export function dtrExpectedScore(playerRating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / DTR_LOGISTIC_DIVISOR));
}

export function dtrCategory(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value)) return "beginner";
  if (value >= 2500) return "expert";
  if (value >= 2000) return "advanced";
  if (value >= 1500) return "intermediate";
  return "beginner";
}

export function dtrCategoryLabel(rating) {
  const key = dtrCategory(rating);
  return DTR_CATEGORIES.find((category) => category.key === key)?.label ?? "Beginner";
}

export function dtrStartingRating(level) {
  const key = String(level ?? "").trim().toLowerCase();
  return DTR_STARTING_RATINGS[key] ?? DTR_DEFAULT_RATING;
}

function normalizeRating(value) {
  // Missing values fall back to the 1000 starting rating. Real sub-1000 ratings
  // are kept as-is: 1000 is the starting point, not a floor.
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : DTR_DEFAULT_RATING;
}

function buildChange(player, expected, actual, delta, matchK) {
  const oldRating = normalizeRating(player.rating);
  const newRating = Math.max(DTR_ABSOLUTE_MIN_RATING, oldRating + Math.round(delta));
  return {
    userId: player.userId,
    oldRating,
    newRating,
    delta: newRating - oldRating,
    expected: Math.round(expected * 1000) / 1000,
    actual,
    kFactor: matchK,
  };
}

/**
 * Singles: one rating per player, Match K is the average of both K factors.
 */
export function calculateDtrSingles(playerA, playerB, winner) {
  const matchK = DTR_K_FACTOR;

  const ratingA = normalizeRating(playerA.rating);
  const ratingB = normalizeRating(playerB.rating);

  const expectedA = dtrExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  const scoreA = winner === "A" ? 1 : winner === "B" ? 0 : 0.5;
  const scoreB = winner === "B" ? 1 : winner === "A" ? 0 : 0.5;

  // One signed delta keeps both players consistent and zero-sum before clamping.
  const deltaA = Math.round(matchK * (scoreA - expectedA));
  const deltaB = -deltaA;

  return {
    matchK,
    playerA: buildChange({ ...playerA, rating: ratingA }, expectedA, scoreA, deltaA, matchK),
    playerB: buildChange({ ...playerB, rating: ratingB }, expectedB, scoreB, deltaB, matchK),
  };
}

/**
 * Doubles: compare team averages, use the average K of all four players, and
 * give both winners the same positive change and both losers the same negative.
 */
export function calculateDtrDoubles(team1, team2, winnerTeam) {
  const matchK = DTR_K_FACTOR;

  const team1Avg = (normalizeRating(team1[0].rating) + normalizeRating(team1[1].rating)) / 2;
  const team2Avg = (normalizeRating(team2[0].rating) + normalizeRating(team2[1].rating)) / 2;

  const expectedTeam1 = dtrExpectedScore(team1Avg, team2Avg);
  const expectedTeam2 = 1 - expectedTeam1;

  const scoreTeam1 = winnerTeam === 1 ? 1 : 0;
  const scoreTeam2 = winnerTeam === 2 ? 1 : 0;

  const team1Delta = Math.round(matchK * (scoreTeam1 - expectedTeam1));
  const team2Delta = -team1Delta;

  return {
    matchK,
    team1Avg: Math.round(team1Avg * 100) / 100,
    team2Avg: Math.round(team2Avg * 100) / 100,
    team1Results: team1.map((player) =>
      buildChange(player, expectedTeam1, scoreTeam1, team1Delta, matchK)
    ),
    team2Results: team2.map((player) =>
      buildChange(player, expectedTeam2, scoreTeam2, team2Delta, matchK)
    ),
  };
}