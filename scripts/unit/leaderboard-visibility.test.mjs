import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  LEADERBOARD_MIN_MATCHES_NON_BEGINNER,
  isLeaderboardEligible,
  leaderboardMatchesRemaining,
  leaderboardMinMatches,
  leaderboardRequiresMatches,
} from "../../src/lib/rating/leaderboard-visibility-core.mjs";

test("beginner appears on the leaderboard immediately", () => {
  assert.equal(leaderboardRequiresMatches("beginner"), false);
  assert.equal(leaderboardMinMatches("beginner"), 0);
  assert.equal(isLeaderboardEligible("beginner", 0), true);
  assert.equal(isLeaderboardEligible("beginner", 5), true);
  assert.equal(leaderboardMatchesRemaining("beginner", 0), 0);
});

test("intermediate, advanced and expert need 3 verified matches", () => {
  assert.equal(LEADERBOARD_MIN_MATCHES_NON_BEGINNER, 3);
  for (const level of ["intermediate", "advanced", "expert"]) {
    assert.equal(leaderboardRequiresMatches(level), true, level);
    assert.equal(leaderboardMinMatches(level), 3, level);

    // Belum bertanding / belum cukup.
    assert.equal(isLeaderboardEligible(level, 0), false, `${level} 0`);
    assert.equal(isLeaderboardEligible(level, 1), false, `${level} 1`);
    assert.equal(isLeaderboardEligible(level, 2), false, `${level} 2`);

    // Tepat di batas dan sesudahnya.
    assert.equal(isLeaderboardEligible(level, 3), true, `${level} 3`);
    assert.equal(isLeaderboardEligible(level, 4), true, `${level} 4`);
  }
});

test("remaining matches count down to zero", () => {
  assert.equal(leaderboardMatchesRemaining("intermediate", 0), 3);
  assert.equal(leaderboardMatchesRemaining("intermediate", 1), 2);
  assert.equal(leaderboardMatchesRemaining("intermediate", 2), 1);
  assert.equal(leaderboardMatchesRemaining("intermediate", 3), 0);
  assert.equal(leaderboardMatchesRemaining("advanced", 10), 0);
});

test("a missing level is treated as beginner, matching the system default", () => {
  // Pendaftaran tanpa pilihan level menyimpan 'beginner'; profil lama yang
  // belum lengkap tidak boleh hilang dari leaderboard.
  assert.equal(leaderboardRequiresMatches(null), false);
  assert.equal(leaderboardRequiresMatches(undefined), false);
  assert.equal(leaderboardRequiresMatches(""), false);
  assert.equal(isLeaderboardEligible(null, 0), true);
});

test("level matching is case-insensitive and tolerant of whitespace", () => {
  assert.equal(leaderboardRequiresMatches("BEGINNER"), false);
  assert.equal(leaderboardRequiresMatches("  Beginner  "), false);
  assert.equal(leaderboardRequiresMatches("Intermediate"), true);
});

test("the leaderboard page filters rows with the shared rule", async () => {
  const page = await readFile(
    new URL("../../src/app/leaderboard/page.tsx", import.meta.url),
    "utf8"
  );
  // Kedua jalur load (MySQL legacy + Supabase) harus memakai aturan yang sama.
  const filters = page.match(
    /\.filter\(\(row\) => isLeaderboardEligible\(row\.selfAssessedLevel, row\.matchesPlayed\)\)/g
  );
  assert.equal(filters?.length, 2, "setiap jalur load harus memfilter dengan isLeaderboardEligible");
  assert.match(page, /self_assessed_level/);
  assert.match(page, /LEADERBOARD_MIN_MATCHES_NON_BEGINNER/);
});

test("a corrupt matches_played value never grants eligibility", () => {
  assert.equal(isLeaderboardEligible("intermediate", null), false);
  assert.equal(isLeaderboardEligible("intermediate", undefined), false);
  assert.equal(isLeaderboardEligible("intermediate", Number.NaN), false);
  assert.equal(isLeaderboardEligible("intermediate", -5), false);
  // Tapi string angka dari Postgres tetap dihitung.
  assert.equal(isLeaderboardEligible("intermediate", "3"), true);
  assert.equal(isLeaderboardEligible("intermediate", "2"), false);
});
