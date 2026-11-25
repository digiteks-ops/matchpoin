import test from "node:test";
import assert from "node:assert/strict";
import {
  MPR_ABSOLUTE_MIN_RATING,
  MPR_CALIBRATION_MATCHES,
  MPR_CATEGORIES,
  MPR_K_FACTOR,
  MPR_POINT_SWING,
  MPR_STARTING_RATING,
  calculateMprDoubles,
  calculateMprSingles,
  mprCalibrationRemaining,
  mprCategory,
  mprIsCalibrating,
  mprKFactor,
  mprRatingStatus,
  mprStartingRating,
} from "../../src/lib/rating/mpr-core.mjs";

const player = (userId, rating, matchesPlayed = 0) => ({ userId, rating, matchesPlayed });

test("MPR memakai K tetap 80 sehingga laga seimbang bergerak +40 / -40", () => {
  assert.equal(MPR_POINT_SWING, 40);
  assert.equal(MPR_K_FACTOR, 80);
  for (const matchesPlayed of [0, 1, 2, 10, 31, 100]) {
    assert.equal(mprKFactor(matchesPlayed), 80, String(matchesPlayed));
  }

  const result = calculateMprSingles(
    player("a", MPR_STARTING_RATING),
    player("b", MPR_STARTING_RATING),
    "A"
  );
  assert.equal(result.matchK, 80);
  assert.equal(result.playerA.delta, 40);
  assert.equal(result.playerB.delta, -40);

  const loss = calculateMprSingles(
    player("a", MPR_STARTING_RATING),
    player("b", MPR_STARTING_RATING),
    "B"
  );
  assert.equal(loss.playerA.delta, -40);
  assert.equal(loss.playerB.delta, 40);
});

test("batas kategori MPR: 0-1099, 1100-1599, 1600-1999, 2000+", () => {
  assert.deepEqual(
    MPR_CATEGORIES.map((category) => [category.key, category.minRating, category.maxRating]),
    [
      ["beginner", 0, 1099],
      ["intermediate", 1100, 1599],
      ["advanced", 1600, 1999],
      ["expert", 2000, null],
    ]
  );

  assert.equal(mprCategory(0), "beginner");
  assert.equal(mprCategory(1099), "beginner");
  assert.equal(mprCategory(1100), "intermediate");
  assert.equal(mprCategory(1599), "intermediate");
  assert.equal(mprCategory(1600), "advanced");
  assert.equal(mprCategory(1999), "advanced");
  assert.equal(mprCategory(2000), "expert");
  assert.equal(mprCategory(2600), "expert");
});

test("semua pemain baru mulai dari rating 1000", () => {
  assert.equal(MPR_STARTING_RATING, 1000);
  for (const level of ["beginner", "intermediate", "advanced", "expert", null, undefined, ""]) {
    assert.equal(mprStartingRating(level), 1000, String(level));
  }
  // Rating 1000 berada di kategori Beginner (0–1099).
  assert.equal(mprCategory(mprStartingRating("intermediate")), "beginner");
});

test("kalibrasi berlangsung 2 pertandingan sebelum ranking resmi", () => {
  assert.equal(MPR_CALIBRATION_MATCHES, 2);
  assert.equal(mprIsCalibrating(0), true);
  assert.equal(mprIsCalibrating(1), true);
  assert.equal(mprIsCalibrating(2), false);
  assert.equal(mprIsCalibrating(17), false);
  // Nilai kosong/rusak tidak dianggap sudah resmi.
  assert.equal(mprIsCalibrating(null), true);
  assert.equal(mprIsCalibrating(Number.NaN), true);

  assert.equal(mprCalibrationRemaining(0), 2);
  assert.equal(mprCalibrationRemaining(1), 1);
  assert.equal(mprCalibrationRemaining(2), 0);
  assert.equal(mprCalibrationRemaining(9), 0);

  assert.equal(mprRatingStatus(1), "kalibrasi");
  assert.equal(mprRatingStatus(2), "resmi");
});

test("menang lawan lebih tinggi dapat poin besar, menang lawan lebih rendah dapat sedikit", () => {
  const upset = calculateMprSingles(player("low", 1000), player("high", 1400), "A");
  const expectedWin = calculateMprSingles(player("high", 1400), player("low", 1000), "A");

  assert.ok(upset.playerA.delta > MPR_POINT_SWING, "upset harus di atas +40");
  assert.ok(expectedWin.playerA.delta < MPR_POINT_SWING, "favorit menang harus di bawah +40");
  assert.ok(upset.playerA.delta > expectedWin.playerA.delta);
});

test("kalah dari lawan lebih rendah minus besar, kalah dari lawan lebih tinggi minus kecil", () => {
  const badLoss = calculateMprSingles(player("high", 1400), player("low", 1000), "B");
  const expectedLoss = calculateMprSingles(player("low", 1000), player("high", 1400), "B");

  assert.ok(badLoss.playerA.delta < -MPR_POINT_SWING, "kalah dari yang lemah harus di bawah -40");
  assert.ok(expectedLoss.playerA.delta > -MPR_POINT_SWING, "kalah dari yang kuat minusnya kecil");
  assert.ok(Math.abs(badLoss.playerA.delta) > Math.abs(expectedLoss.playerA.delta));
});

test("perubahan poin selalu nol-sum: poin yang didapat lawan sama dengan yang hilang", () => {
  for (const [a, b] of [
    [1000, 1000],
    [1000, 1400],
    [1400, 1000],
    [1000, 1900],
    [1900, 1000],
  ]) {
    for (const winner of ["A", "B"]) {
      const result = calculateMprSingles(player("a", a), player("b", b), winner);
      // Pakai penjumlahan agar aman dari perbedaan 0 dan -0 pada selisih kecil.
      assert.equal(result.playerA.delta + result.playerB.delta, 0, `${a} vs ${b} winner ${winner}`);
    }
  }
});

test("rating boleh turun di bawah 1000 dan tidak pernah di bawah batas aman", () => {
  let rating = MPR_STARTING_RATING;
  for (let match = 0; match < 5; match += 1) {
    const result = calculateMprSingles(player("a", rating), player("b", MPR_STARTING_RATING), "B");
    assert.ok(result.playerA.newRating < rating);
    rating = result.playerA.newRating;
  }
  assert.ok(rating < MPR_STARTING_RATING);

  // Rating di bawah 1000 tetap dibaca apa adanya, bukan dipaksa kembali ke 1000.
  const next = calculateMprSingles(player("a", rating), player("b", rating), "A");
  assert.equal(next.playerA.oldRating, rating);
  assert.equal(next.playerB.oldRating, rating);

  const floor = calculateMprSingles(player("a", 16), player("b", 5000), "B");
  assert.equal(floor.playerA.oldRating, 16);
  assert.ok(floor.playerA.newRating >= MPR_ABSOLUTE_MIN_RATING);
});

test("rating kosong atau rusak jatuh ke 1000", () => {
  const result = calculateMprSingles(player("a", null), player("b", undefined), "A");
  assert.equal(result.playerA.oldRating, MPR_STARTING_RATING);
  assert.equal(result.playerB.oldRating, MPR_STARTING_RATING);
});

test("doubles memakai rata-rata tim dan memberi perubahan sama ke kedua rekan", () => {
  const result = calculateMprDoubles(
    [player("a1", 1400), player("a2", 1000)],
    [player("b1", 1200), player("b2", 1200)],
    1
  );

  assert.equal(result.team1Avg, 1200);
  assert.equal(result.team2Avg, 1200);
  assert.equal(result.matchK, 80);
  assert.equal(result.team1Results[0].delta, 40);
  assert.equal(result.team1Results[1].delta, 40);
  assert.equal(result.team2Results[0].delta, -40);
  assert.equal(result.team2Results[1].delta, -40);
});
