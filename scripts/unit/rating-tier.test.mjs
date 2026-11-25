import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  RATING_TIER_OPTIONS,
  RATING_TIER_RANGES,
  matchesRatingTier,
  ratingTierLabel,
  ratingTierOf,
} from "../../src/lib/rating/rating-tier-core.mjs";
import { MPR_CATEGORIES, MPR_STARTING_RATING } from "../../src/lib/rating/mpr-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("batas tingkat MPR: 0-1099, 1100-1599, 1600-1999, 2000+", () => {
  const cases = [
    [0, "beginner"],
    [1000, "beginner"],
    [1099, "beginner"],
    [1100, "intermediate"],
    [1599, "intermediate"],
    [1600, "advanced"],
    [1999, "advanced"],
    [2000, "expert"],
    [3500, "expert"],
  ];
  for (const [rating, expected] of cases) {
    assert.equal(ratingTierOf(rating), expected, `${rating}`);
    assert.equal(matchesRatingTier(expected, rating), true, `${rating}`);
  }
});

test("batas tingkat diambil dari mesin MPR, bukan daftar terpisah", () => {
  // Satu sumber kebenaran: kalau batas di mpr-core berubah, UI ikut berubah.
  assert.deepEqual(
    MPR_CATEGORIES.map((category) => category.key),
    RATING_TIER_OPTIONS.slice(1).map((option) => option.value)
  );
  assert.equal(RATING_TIER_RANGES.beginner, "0 – 1099");
  assert.equal(RATING_TIER_RANGES.intermediate, "1100 – 1599");
  assert.equal(RATING_TIER_RANGES.advanced, "1600 – 1999");
  assert.equal(RATING_TIER_RANGES.expert, "2000+");
});

test("filter tingkat mengecualikan tingkat lain", () => {
  assert.equal(matchesRatingTier("beginner", 1099), true);
  assert.equal(matchesRatingTier("beginner", 1100), false);
  assert.equal(matchesRatingTier("intermediate", 1099), false);
  assert.equal(matchesRatingTier("intermediate", 1600), false);
  assert.equal(matchesRatingTier("advanced", 1599), false);
  assert.equal(matchesRatingTier("advanced", 2000), false);
  assert.equal(matchesRatingTier("expert", 1999), false);
  assert.equal(matchesRatingTier("expert", 2000), true);
  // "all" berarti tanpa filter.
  for (const rating of [0, 1099, 1100, 2000, 4000]) {
    assert.equal(matchesRatingTier("all", rating), true, String(rating));
    assert.equal(matchesRatingTier("", rating), true, String(rating));
  }
});

test("rating rusak dianggap beginner dan tidak menyembunyikan pemain", () => {
  assert.equal(ratingTierOf(null), "beginner");
  assert.equal(ratingTierOf(undefined), "beginner");
  assert.equal(ratingTierOf(Number.NaN), "beginner");
  assert.equal(ratingTierOf("1100"), "intermediate");
  assert.equal(ratingTierLabel(1600), "Advanced");
});

test("pemain baru (1000) mulai di Beginner", () => {
  assert.equal(ratingTierOf(MPR_STARTING_RATING), "beginner");
});

test("opsi filter menampilkan Semua Level plus empat tingkat", () => {
  assert.deepEqual(
    RATING_TIER_OPTIONS.map((option) => option.value),
    ["all", "beginner", "intermediate", "advanced", "expert"]
  );
  assert.equal(RATING_TIER_OPTIONS[0].label, "Semua Level");
});

test("setiap permukaan filter menawarkan keempat tingkat", async () => {
  // /players: filter memakai rating, bukan level pendaftaran.
  const players = await read("src/app/players/page.tsx");
  assert.match(players, /RATING_TIER_OPTIONS\.map/);
  assert.match(players, /matchesRatingTier\(selectedLevel, p\.currentRating\)/);

  // Form buat pertandingan.
  const createForm = await read("src/components/matches/create-match-form.tsx");
  assert.match(createForm, /RATING_TIER_OPTIONS\.map/);

  // Leaderboard utama.
  const leaderboard = await read("src/app/leaderboard/page.tsx");
  assert.match(leaderboard, /RATING_TIER_OPTIONS\.map/);
  assert.match(leaderboard, /matchesRatingTier\(selectedLevel, r\.rating\)/);

  // Leaderboard liga IKA17 memakai KELAS liga (beginner/intermediate dari MPR),
  // bukan empat tingkat MPR, jadi yang diuji di sini adalah sumber kelasnya.
  const tournament = await read("src/components/tournaments/tournament-leaderboard.tsx");
  assert.match(tournament, /ika17ClassOfRating\(standing\.rating\)/);
  for (const klass of ["beginner", "intermediate"]) {
    assert.match(tournament, new RegExp(`\\["${klass}", `), klass);
  }

  // Beranda memakai rentang yang sama.
  const home = await read("src/app/page.tsx");
  assert.match(home, /RATING_TIER_RANGES/);
});
