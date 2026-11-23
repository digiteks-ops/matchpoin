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

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("tier boundaries are 0-1499, 1500-1999, 2000-2499, 2500+", () => {
  const cases = [
    [0, "beginner"],
    [1000, "beginner"],
    [1499, "beginner"],
    [1500, "intermediate"],
    [1999, "intermediate"],
    [2000, "advanced"],
    [2499, "advanced"],
    [2500, "expert"],
    [3500, "expert"],
  ];
  for (const [rating, expected] of cases) {
    assert.equal(ratingTierOf(rating), expected, `${rating}`);
    assert.equal(matchesRatingTier(expected, rating), true, `${rating}`);
  }
});

test("a tier filter excludes every other tier", () => {
  // Beginner hanya 0–1499.
  assert.equal(matchesRatingTier("beginner", 1000), true);
  assert.equal(matchesRatingTier("beginner", 1500), false);
  assert.equal(matchesRatingTier("beginner", 2500), false);
  // Intermediate hanya 1500–1999.
  assert.equal(matchesRatingTier("intermediate", 1499), false);
  assert.equal(matchesRatingTier("intermediate", 2000), false);
  // Advanced hanya 2000–2499.
  assert.equal(matchesRatingTier("advanced", 1999), false);
  assert.equal(matchesRatingTier("advanced", 2500), false);
  // Expert 2500 ke atas.
  assert.equal(matchesRatingTier("expert", 2499), false);
  assert.equal(matchesRatingTier("expert", 2500), true);
  // "all" berarti tanpa filter.
  for (const rating of [0, 1499, 1500, 2500, 4000]) {
    assert.equal(matchesRatingTier("all", rating), true, String(rating));
    assert.equal(matchesRatingTier("", rating), true, String(rating));
  }
});

test("corrupt ratings fall back to beginner instead of hiding the player", () => {
  assert.equal(ratingTierOf(null), "beginner");
  assert.equal(ratingTierOf(undefined), "beginner");
  assert.equal(ratingTierOf(Number.NaN), "beginner");
  assert.equal(ratingTierOf("1000"), "beginner");
  assert.equal(ratingTierLabel(1500), "Intermediate");
});

test("filter options list Semua Level plus the four tiers", () => {
  assert.deepEqual(
    RATING_TIER_OPTIONS.map((option) => option.value),
    ["all", "beginner", "intermediate", "advanced", "expert"]
  );
  assert.equal(RATING_TIER_OPTIONS[0].label, "Semua Level");
  assert.equal(RATING_TIER_RANGES.beginner, "0 – 1499");
  assert.equal(RATING_TIER_RANGES.expert, "2500+");
});

test("every level filter surface offers all four tiers", async () => {
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

  // Leaderboard liga/turnamen: tombol level harus lengkap.
  const tournament = await read("src/components/tournaments/tournament-leaderboard.tsx");
  for (const level of ["beginner", "intermediate", "advanced", "expert"]) {
    assert.match(tournament, new RegExp(`\\["${level}", "`), level);
  }

  // Beranda memakai rentang yang sama.
  const home = await read("src/app/page.tsx");
  assert.match(home, /RATING_TIER_RANGES/);
});