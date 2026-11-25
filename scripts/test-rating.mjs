/**
 * MPR verification script.
 * Run with: npm run test:rating
 */

import assert from "node:assert/strict";
import {
  MPR_K_FACTOR,
  MPR_POINT_SWING,
  MPR_STARTING_RATING,
  calculateMprDoubles,
  calculateMprSingles,
  mprCategory,
  mprKFactor,
  mprStartingRating,
} from "../src/lib/rating/mpr-core.mjs";

const player = (userId, rating, matchesPlayed = 0) => ({ userId, rating, matchesPlayed });
const log = (label, value) => console.log(`PASS  ${label}: ${value}`);

// 1. K factor tetap: laga seimbang +40 / -40
assert.equal(MPR_POINT_SWING, 40);
assert.equal(MPR_K_FACTOR, 80);
for (const matchesPlayed of [0, 1, 2, 10, 31, 100]) {
  assert.equal(mprKFactor(matchesPlayed), 80, String(matchesPlayed));
}
log("K factor", `${MPR_K_FACTOR} (tetap)`);

// 2. Rating awal & kategori
assert.equal(MPR_STARTING_RATING, 1000);
for (const level of ["beginner", "intermediate", "advanced", "expert"]) {
  assert.equal(mprStartingRating(level), 1000, level);
}
assert.equal(mprCategory(1099), "beginner");
assert.equal(mprCategory(1100), "intermediate");
assert.equal(mprCategory(1599), "intermediate");
assert.equal(mprCategory(1600), "advanced");
assert.equal(mprCategory(1999), "advanced");
assert.equal(mprCategory(2000), "expert");
log("Rating awal", "1000 untuk semua pemain baru");
log("Kategori", "0-1099 / 1100-1599 / 1600-1999 / 2000+");

// 3. Laga seimbang
const equal = calculateMprSingles(player("a", 1000), player("b", 1000), "A");
assert.equal(equal.matchK, 80);
assert.equal(equal.playerA.delta, 40);
assert.equal(equal.playerB.delta, -40);
log("Menang lawan seimbang", `+${equal.playerA.delta}`);
log("Kalah lawan seimbang", `${equal.playerB.delta}`);

// 4. Dinamis: lawan lebih kuat vs lebih lemah
const upset = calculateMprSingles(player("low", 1000), player("high", 1400), "A");
const favoriteWins = calculateMprSingles(player("high", 1400), player("low", 1000), "A");
const badLoss = calculateMprSingles(player("high", 1400), player("low", 1000), "B");
const expectedLoss = calculateMprSingles(player("low", 1000), player("high", 1400), "B");

assert.ok(upset.playerA.delta > 40, "menang lawan lebih tinggi harus di atas +40");
assert.ok(favoriteWins.playerA.delta < 40, "menang lawan lebih rendah harus di bawah +40");
assert.ok(badLoss.playerA.delta < -40, "kalah dari lawan lebih rendah harus di bawah -40");
assert.ok(expectedLoss.playerA.delta > -40, "kalah dari lawan lebih tinggi minusnya kecil");
log("Menang lawan rating lebih tinggi", `+${upset.playerA.delta}`);
log("Menang lawan rating lebih rendah", `+${favoriteWins.playerA.delta}`);
log("Kalah dari lawan rating lebih rendah", `${badLoss.playerA.delta}`);
log("Kalah dari lawan rating lebih tinggi", `${expectedLoss.playerA.delta}`);

// 5. Rating boleh turun di bawah 1000
const belowStart = calculateMprSingles(
  player("a", MPR_STARTING_RATING),
  player("b", MPR_STARTING_RATING),
  "B"
);
assert.equal(belowStart.playerA.newRating, MPR_STARTING_RATING - 40);
log("Rating turun di bawah 1000", `${belowStart.playerA.newRating}`);

// 6. Nol-sum
for (const [a, b] of [
  [1000, 1000],
  [1000, 1400],
  [1900, 1000],
]) {
  for (const winner of ["A", "B"]) {
    const result = calculateMprSingles(player("a", a), player("b", b), winner);
    assert.equal(result.playerA.delta + result.playerB.delta, 0);
  }
}
log("Nol-sum", "poin yang didapat = poin yang hilang");

// 7. Doubles
const doubles = calculateMprDoubles(
  [player("a1", 1400), player("a2", 1000)],
  [player("b1", 1200), player("b2", 1200)],
  1
);
assert.equal(doubles.team1Avg, 1200);
assert.equal(doubles.team2Avg, 1200);
assert.equal(doubles.team1Results[0].delta, 40);
assert.equal(doubles.team2Results[0].delta, -40);
log("Doubles seimbang", `+${doubles.team1Results[0].delta} / ${doubles.team2Results[0].delta}`);

console.log("\nAll MPR checks passed.");
