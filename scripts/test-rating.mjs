/**
 * DTR verification script.
 * Run with: npm run test:rating
 */

import assert from "node:assert/strict";
import {
  DTR_MIN_RATING,
  calculateDtrDoubles,
  calculateDtrSingles,
  dtrCategory,
  dtrKFactor,
  dtrStartingRating,
} from "../src/lib/rating/dtr-core.mjs";

const player = (userId, rating, matchesPlayed = 0) => ({ userId, rating, matchesPlayed });
const log = (label, value) => console.log(`PASS  ${label}: ${value}`);

// 1. Fixed K factor
assert.equal(dtrKFactor(0), 30);
assert.equal(dtrKFactor(10), 30);
assert.equal(dtrKFactor(11), 30);
assert.equal(dtrKFactor(31), 30);
assert.equal(dtrKFactor(100), 30);
log("K factor", "30 (fixed)");

// 2. Starting ratings and categories
assert.equal(dtrStartingRating("beginner"), 1000);
assert.equal(dtrStartingRating("intermediate"), 1500);
assert.equal(dtrStartingRating("advanced"), 2000);
assert.equal(dtrStartingRating("expert"), 2500);
assert.equal(dtrCategory(1000), "beginner");
assert.equal(dtrCategory(1500), "intermediate");
assert.equal(dtrCategory(2000), "advanced");
assert.equal(dtrCategory(2500), "expert");
log("Starting ratings", "1000 / 1500 / 2000 / 2500");
log("Categories", "Beginner / Intermediate / Advanced / Expert");

// 3. Equal ratings, K=30 => about 15 points
const equal = calculateDtrSingles(player("a", 1500), player("b", 1500), "A");
assert.equal(equal.matchK, 30);
assert.equal(equal.playerA.delta, 15);
assert.equal(equal.playerB.delta, -15);
log("Equal rating win", `+${equal.playerA.delta}`);
log("Equal rating loss", `${equal.playerB.delta}`);

// 4. Strong vs weak
const favoriteWins = calculateDtrSingles(player("strong", 2000), player("weak", 1500), "A");
const upset = calculateDtrSingles(player("weak", 1500), player("strong", 2000), "A");
assert.ok(favoriteWins.playerA.delta < 10, "favorite should gain little");
assert.ok(upset.playerA.delta > 20, "underdog should gain more");
assert.ok(upset.playerB.delta < -20, "favorite should lose more");
log("Favorite beats weaker", `+${favoriteWins.playerA.delta}`);
log("Underdog beats stronger", `+${upset.playerA.delta}`);
log("Stronger loses to underdog", `${upset.playerB.delta}`);

// 5. Rating can drop below 1000
const belowFloor = calculateDtrSingles(player("a", DTR_MIN_RATING), player("b", DTR_MIN_RATING), "B");
assert.equal(belowFloor.playerA.newRating, DTR_MIN_RATING - 15);
log("Rating below 1000", `${belowFloor.playerA.newRating}`);

// 6. Doubles: team averages and equal team change
const doubles = calculateDtrDoubles(
  [player("a1", 2000), player("a2", 1000)],
  [player("b1", 1500), player("b2", 1500)],
  1
);
assert.equal(doubles.team1Avg, 1500);
assert.equal(doubles.team2Avg, 1500);
assert.equal(doubles.team1Results[0].delta, doubles.team1Results[1].delta);
assert.equal(doubles.team2Results[0].delta, doubles.team2Results[1].delta);
log("Doubles team averages", `${doubles.team1Avg} vs ${doubles.team2Avg}`);
log(
  "Doubles changes",
  `winners +${doubles.team1Results[0].delta}, losers ${doubles.team2Results[0].delta}`
);

// 7. Doubles Match K is the fixed 30
const mixedK = calculateDtrDoubles(
  [player("a1", 1500, 0), player("a2", 1500, 0)],
  [player("b1", 1500, 40), player("b2", 1500, 40)],
  1
);
assert.equal(mixedK.matchK, 30);
log("Doubles Match K", `${mixedK.matchK}`);

console.log("\nAll DTR checks passed.");