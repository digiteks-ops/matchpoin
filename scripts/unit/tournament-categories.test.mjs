import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IKA17_CATEGORIES,
  IKA17_CLASSES,
  IKA17_ELIGIBILITY_STATEMENT,
  IKA17_INTERMEDIATE_MIN_RATING,
  IKA17_MAIN_EVENT_SLOTS,
  IKA17_MIN_MATCHES,
  IKA17_QUOTA,
  ika17Category,
  ika17ClassLabel,
  ika17ClassOfRating,
  ika17EligibilityStatement,
  ika17TeamRating,
} from "../../src/lib/tournaments/ika17-core.mjs";
import {
  evaluateLeagueRegistration,
  inferCategory,
} from "../../src/lib/mysql/competition-registration-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const migration = await read("supabase/migrations/00045_remove_mixed_doubles_league.sql");
const registerRoute = await read("src/app/api/tournaments/register/route.ts");
const tournamentsPage = await read("src/app/tournaments/page.tsx");
const leaguePage = await read("src/app/league/page.tsx");
const leaderboard = await read("src/components/tournaments/tournament-leaderboard.tsx");
const standingsService = await read("src/lib/supabase/competition-service.ts");

const USER = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";

const league = (category) => ({
  name: "Liga Tennis IKA17",
  category,
  status: "registration_open",
  max_participants: 24,
  registration_deadline: "2026-12-31",
});

const evaluate = (category, overrides = {}) =>
  evaluateLeagueRegistration({
    tournament: league(category),
    userId: USER,
    partnerUserId: category.includes("_doubles") ? PARTNER : null,
    registeredUserIds: [],
    entryCount: 0,
    userGender: "male",
    partnerGender: "female",
    today: "2026-11-19",
    ...overrides,
  });

test("kategori turnamen tepat tiga: Single Man, Double Man, Double Woman", () => {
  assert.deepEqual(
    IKA17_CATEGORIES.map((entry) => entry.label),
    ["Single Man", "Double Man", "Double Woman"]
  );
  assert.deepEqual(
    IKA17_CATEGORIES.map((entry) => entry.id),
    ["mens_singles", "mens_doubles", "womens_doubles"]
  );

  // Kategori lama (level, tunggal putri, dan Double Mix) sudah tidak ada.
  assert.equal(ika17Category("womens_doubles_intermediate"), null);
  assert.equal(IKA17_CATEGORIES.some((entry) => entry.id === "womens_singles"), false);
  assert.equal(ika17Category("womens_singles"), null);
  assert.equal(ika17Category("mixed_doubles"), null);
});

test("setiap kategori punya aturan gender dan status ganda yang jelas", () => {
  const byId = new Map(IKA17_CATEGORIES.map((entry) => [entry.id, entry]));
  assert.equal(byId.get("mens_singles").doubles, false);
  assert.equal(byId.get("mens_singles").genderRule, "male");
  assert.equal(byId.get("mens_doubles").doubles, true);
  assert.equal(byId.get("womens_doubles").genderRule, "female");
  assert.equal(byId.has("mixed_doubles"), false);
});

test("tanpa batas kuota; minimal 17 pertandingan untuk semua kategori", () => {
  // Kuota peserta dihapus: null menandakan "tanpa batas".
  assert.equal(IKA17_QUOTA, null);
  assert.equal(IKA17_MIN_MATCHES, 17);
  assert.equal(IKA17_MAIN_EVENT_SLOTS, 8);
});

test("pendaftaran tidak lagi membutuhkan pilihan level", () => {
  for (const category of IKA17_CATEGORIES.map((entry) => entry.id)) {
    assert.equal(evaluate(category).ok, true, category);
  }

  // Nilai playingExperience lama diabaikan, bukan ditolak.
  assert.equal(evaluate("mens_singles", { playingExperience: "intermediate" }).ok, true);
  assert.equal(evaluate("mens_doubles", { playingExperience: "beginner" }).ok, true);
});

test("kelas liga dibentuk dari MPR: beginner < 1100, intermediate >= 1100", () => {
  assert.deepEqual(IKA17_CLASSES, ["beginner", "intermediate"]);
  assert.equal(IKA17_INTERMEDIATE_MIN_RATING, 1100);

  assert.equal(ika17ClassOfRating(0), "beginner");
  assert.equal(ika17ClassOfRating(1000), "beginner");
  assert.equal(ika17ClassOfRating(1099), "beginner");
  assert.equal(ika17ClassOfRating(1100), "intermediate");
  assert.equal(ika17ClassOfRating(2500), "intermediate");
  assert.equal(ika17ClassLabel(1500), "Intermediate");
  // Nilai kosong/rusak tidak menyembunyikan peserta.
  assert.equal(ika17ClassOfRating(null), "beginner");
  assert.equal(ika17ClassOfRating(Number.NaN), "beginner");
});

test("MPR tim ganda memakai rata-rata kedua pemain", () => {
  assert.equal(ika17TeamRating([1000]), 1000);
  assert.equal(ika17TeamRating([1000, 1200]), 1100);
  assert.equal(ika17TeamRating([900, 1100, 1300]), 1100);
  assert.equal(ika17TeamRating([]), null);
  assert.equal(ika17TeamRating([null, undefined]), null);
  // Satu pemain tanpa rating tidak membuat tim kehilangan kelas.
  assert.equal(ika17TeamRating([1400, null]), 1400);
});

test("setiap kategori tetap mensyaratkan pernyataan PORDA/PORPROV/PON", () => {
  assert.match(IKA17_ELIGIBILITY_STATEMENT, /PORDA, PORPROV, atau PON/);
  assert.equal(ika17EligibilityStatement(), IKA17_ELIGIBILITY_STATEMENT);
  assert.deepEqual(evaluate("mens_singles", { eligibilityConfirmed: false }), {
    ok: false,
    message: "Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.",
  });
});

test("inferensi kategori tidak lagi menghasilkan kategori level", () => {
  assert.equal(inferCategory("Double Woman"), "womens_doubles");
  assert.equal(inferCategory("Double Woman Beginner–Intermediate"), "womens_doubles");
  assert.equal(inferCategory("Double Man"), "mens_doubles");
  assert.equal(inferCategory("Single Man"), "mens_singles");
  assert.equal(inferCategory("Double Mix"), "mixed_doubles");
});

test("migrasi 00045 memakai tiga kategori dan tidak memvalidasi level", () => {
  for (const category of ["mens_singles", "mens_doubles", "womens_doubles"]) {
    assert.match(migration, new RegExp(`''${category}''`), category);
  }
  // Double Mix dihapus dari liga, bukan dibiarkan aktif.
  assert.doesNotMatch(migration, /''mixed_doubles''/);
  assert.match(migration, /removed_category/);
  assert.match(migration, /is_league = false/);
  // Regresi 23514: baris lama dengan kategori terhapus harus dikosongkan
  // SEBELUM constraint tiga kategori dipasang.
  assert.match(migration, /category = NULL/);
  assert.match(migration, /ALTER COLUMN category DROP NOT NULL/);
  assert.ok(
    migration.indexOf("category = NULL") <
      migration.indexOf("ADD CONSTRAINT tournaments_category_check"),
    "category harus dikosongkan sebelum constraint dipasang"
  );
  // Regresi 22P02: `status` adalah enum, jadi jangan membandingkan dengan
  // literal yang belum tentu ada di enum (mis. 'active').
  assert.doesNotMatch(migration, /status IN \([^)]*'active'/);
  assert.match(migration, /status = 'cancelled'/);
  // Tidak ada lagi penolakan berdasarkan level.
  assert.doesNotMatch(migration, /Kategori ini khusus beginner/);
  assert.doesNotMatch(migration, /v_experience NOT IN/);
  // Parameter lama dipertahankan agar signature RPC tidak berubah.
  assert.match(migration, /p_playing_experience TEXT DEFAULT NULL/);
  assert.match(migration, /now\(\), NULL, TRUE\)/);
});

test("route pendaftaran tidak mengirim level dan mengirim pernyataan eligibility", () => {
  assert.doesNotMatch(registerRoute, /playingExperience,/);
  assert.match(registerRoute, /p_playing_experience: null/);
  assert.match(registerRoute, /p_eligibility_confirmed: eligibilityConfirmed/);
});

test("form pendaftaran tidak lagi menampilkan pilihan level", () => {
  for (const [name, source] of [
    ["/tournaments", tournamentsPage],
    ["/league", leaguePage],
  ]) {
    assert.doesNotMatch(source, /Pengalaman Bermain/, name);
    assert.doesNotMatch(source, /TOURNAMENT_LEVEL_LABELS/, name);
    assert.doesNotMatch(source, /ika17AllowedLevels/, name);
  }
});

test("leaderboard memakai kelas beginner/intermediate dan 8 besar per kelas", () => {
  assert.match(leaderboard, /ika17ClassOfRating/);
  assert.match(leaderboard, /IKA17_CLASSES/);
  assert.match(leaderboard, /IKA17_MAIN_EVENT_SLOTS/);
  assert.doesNotMatch(leaderboard, /"advanced"/);
  assert.doesNotMatch(leaderboard, /"expert"/);
});

test("klasemen menghitung MPR tim (rata-rata) dan kelas dari rating", () => {
  assert.match(standingsService, /ika17TeamRating/);
  assert.match(standingsService, /ika17ClassOfRating\(teamRating\)/);
});

test("tidak ada lagi salinan yang menyebut level liga beginner–intermediate", async () => {
  const files = [
    "src/lib/tournaments/ika17-core.mjs",
    "src/lib/mysql/competition-registration-core.mjs",
    "src/lib/matches/constants.ts",
    "src/lib/services/match-history-service.ts",
    "src/lib/mysql/player-history-service.ts",
    "src/app/tournaments/page.tsx",
    "src/app/league/page.tsx",
  ];
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /\b[Pp]emula\b/, `${file} masih memakai "pemula"`);
    assert.doesNotMatch(source, /\b[Mm]enengah\b/, `${file} masih memakai "menengah"`);
  }
});
