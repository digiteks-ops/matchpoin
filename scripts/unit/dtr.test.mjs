import test from "node:test";
import assert from "node:assert/strict";
import {
  DTR_MIN_RATING,
  calculateDtrDoubles,
  calculateDtrSingles,
  dtrCategory,
  dtrKFactor,
  dtrStartingRating,
} from "../../src/lib/rating/dtr-core.mjs";

const player = (userId, rating, matchesPlayed = 0) => ({ userId, rating, matchesPlayed });

test("DTR uses a fixed K factor of 30", () => {
  assert.equal(dtrKFactor(0), 30);
  assert.equal(dtrKFactor(10), 30);
  assert.equal(dtrKFactor(11), 30);
  assert.equal(dtrKFactor(31), 30);
  assert.equal(dtrKFactor(100), 30);
});

test("DTR categories and starting ratings follow the spec", () => {
  assert.equal(dtrCategory(1000), "beginner");
  assert.equal(dtrCategory(1499), "beginner");
  assert.equal(dtrCategory(1500), "intermediate");
  assert.equal(dtrCategory(1999), "intermediate");
  assert.equal(dtrCategory(2000), "advanced");
  assert.equal(dtrCategory(2499), "advanced");
  assert.equal(dtrCategory(2500), "expert");

  assert.equal(dtrStartingRating("beginner"), 1000);
  assert.equal(dtrStartingRating("intermediate"), 1500);
  assert.equal(dtrStartingRating("advanced"), 2000);
  assert.equal(dtrStartingRating("expert"), 2500);
  assert.equal(dtrStartingRating(null), 1000);
});

test("equal ratings at K 30 move about 15 points", () => {
  const result = calculateDtrSingles(player("a", 1500), player("b", 1500), "A");
  assert.equal(result.matchK, 30);
  assert.equal(result.playerA.delta, 15);
  assert.equal(result.playerB.delta, -15);
  assert.equal(result.playerA.newRating, 1515);
  assert.equal(result.playerB.newRating, 1485);
});

test("beating a stronger opponent gains more; losing to a weaker opponent costs more", () => {
  const favoriteWins = calculateDtrSingles(player("strong", 2000), player("weak", 1500), "A");
  const upset = calculateDtrSingles(player("weak", 1500), player("strong", 2000), "A");

  // Strong beats weak: small gain. Weak loses: small drop.
  assert.ok(favoriteWins.playerA.delta < 10);
  assert.ok(favoriteWins.playerB.delta > -10);

  // Weak beats strong: large gain. Strong loses: large drop.
  assert.ok(upset.playerA.delta > 20);
  assert.ok(upset.playerB.delta < -20);
  assert.ok(Math.abs(upset.playerB.delta) > Math.abs(favoriteWins.playerB.delta));
});

test("rating never drops below the DTR minimum", () => {
  const result = calculateDtrSingles(player("a", DTR_MIN_RATING), player("b", DTR_MIN_RATING), "B");
  assert.ok(result.playerA.newRating >= DTR_MIN_RATING);
  assert.equal(result.playerA.delta, 0);
  assert.equal(result.playerB.newRating, DTR_MIN_RATING + 15);
});

test("doubles uses team averages and applies the same change to both teammates", () => {
  const result = calculateDtrDoubles(
    [player("a1", 2000), player("a2", 1000)],
    [player("b1", 1500), player("b2", 1500)],
    1
  );

  assert.equal(result.team1Avg, 1500);
  assert.equal(result.team2Avg, 1500);
  assert.equal(result.team1Results[0].delta, 15);
  assert.equal(result.team1Results[1].delta, 15);
  assert.equal(result.team2Results[0].delta, -15);
  assert.equal(result.team2Results[1].delta, -15);
});

test("doubles uses the fixed Match K of 30", () => {
  const result = calculateDtrDoubles(
    [player("a1", 1500, 0), player("a2", 1500, 0)],
    [player("b1", 1500, 40), player("b2", 1500, 40)],
    1
  );

  assert.equal(result.matchK, 30);
  assert.equal(result.team1Results[0].delta, 15);
  assert.equal(result.team2Results[0].delta, -15);
});