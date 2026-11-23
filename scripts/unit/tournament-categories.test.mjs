import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IKA17_CATEGORIES,
  IKA17_ELIGIBILITY_STATEMENT,
  TOURNAMENT_LEVELS,
  TOURNAMENT_LEVEL_LABELS,
  ika17AllowedLevels,
  ika17Category,
  ika17CategoryAllowsLevel,
  ika17EligibilityStatement,
  ika17RequiresBeginner,
  ika17RequiresPordaParticipation,
} from "../../src/lib/tournaments/ika17-core.mjs";
import {
  evaluateLeagueRegistration,
  inferCategory,
  isBeginnerOnlyCategory,
} from "../../src/lib/mysql/competition-registration-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const migration = await read("supabase/migrations/00034_ika17_tournament_categories.sql");
const registerRoute = await read("src/app/api/tournaments/register/route.ts");
const tournamentsPage = await read("src/app/tournaments/page.tsx");

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

test("the five tournament categories are exactly the requested list", () => {
  assert.deepEqual(
    IKA17_CATEGORIES.map((entry) => entry.label),
    [
      "Single Man Beginner",
      "Double Man Beginner–Intermediate",
      "Double Woman Beginner",
      "Double Woman Beginner–Intermediate",
      "Double Mix Beginner",
    ]
  );

  assert.ok(ika17Category("mixed_doubles"));
  assert.ok(ika17Category("womens_doubles_intermediate"));
  // Single Woman was removed from the list.
  assert.equal(IKA17_CATEGORIES.some((entry) => entry.id === "womens_singles"), false);
  assert.equal(ika17Category("womens_singles"), null);
});

test("beginner-only categories reject intermediate registration", () => {
  assert.equal(isBeginnerOnlyCategory("mens_singles"), true);
  assert.equal(isBeginnerOnlyCategory("womens_doubles"), true);
  assert.equal(isBeginnerOnlyCategory("mens_doubles"), false);
  assert.equal(isBeginnerOnlyCategory("womens_doubles_intermediate"), false);

  assert.equal(ika17RequiresBeginner("mens_singles"), true);
  assert.equal(ika17RequiresBeginner("womens_doubles"), true);
  assert.equal(ika17RequiresBeginner("mens_doubles"), false);
  assert.deepEqual(ika17AllowedLevels("mens_doubles"), ["beginner", "intermediate"]);
});

test("level mapping is beginner = max 2 years, intermediate = above 2 years", () => {
  for (const category of ["mens_singles", "womens_doubles"]) {
    assert.equal(ika17CategoryAllowsLevel(category, "beginner"), true, category);
    assert.equal(ika17CategoryAllowsLevel(category, "intermediate"), false, category);
    assert.deepEqual(
      evaluate(category, { playingExperience: "intermediate" }),
      { ok: false, message: "Kategori ini khusus beginner: maksimal 2 tahun bermain." }
    );
    assert.equal(evaluate(category, { playingExperience: "beginner" }).ok, true, category);
  }

  for (const category of ["mens_doubles", "womens_doubles_intermediate"]) {
    assert.equal(evaluate(category, { playingExperience: "beginner" }).ok, true, category);
    assert.equal(evaluate(category, { playingExperience: "intermediate" }).ok, true, category);
  }
});

test("every category requires the PORDA/PORPROV/PON statement", () => {
  assert.match(IKA17_ELIGIBILITY_STATEMENT, /PORDA, PORPROV, atau PON/);
  assert.deepEqual(evaluate("mens_singles", { eligibilityConfirmed: false }), {
    ok: false,
    message: "Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.",
  });
});

test("category inference covers the new women's intermediate doubles", () => {
  assert.equal(inferCategory("Double Woman Beginner–Intermediate"), "womens_doubles_intermediate");
  assert.equal(inferCategory("Double Man Beginner–Intermediate"), "mens_doubles");
  assert.equal(inferCategory("Single Man Beginner"), "mens_singles");
});

test("migration seeds all five leagues and enforces level + eligibility", () => {
  for (const slug of [
    "league-q1-2027-mens-singles",
    "league-q1-2027-mens-doubles",
    "league-q1-2027-womens-doubles",
    "league-q1-2027-womens-doubles-intermediate",
  ]) {
    assert.match(migration, new RegExp(slug), slug);
  }

  assert.match(migration, /womens_doubles_intermediate/);
  assert.match(migration, /p_playing_experience TEXT/);
  assert.match(migration, /p_eligibility_confirmed BOOLEAN/);
  assert.match(migration, /Kategori ini khusus beginner: maksimal 2 tahun bermain\./);
  assert.match(migration, /DROP FUNCTION IF EXISTS public\.register_for_competition\(UUID, UUID, UUID\)/);
});

test("level wording is beginner / intermediate / advanced, not pemula / menengah", () => {
  assert.deepEqual(TOURNAMENT_LEVELS, ["beginner", "intermediate", "advanced"]);
  assert.equal(
    TOURNAMENT_LEVEL_LABELS.beginner,
    "Beginner: maksimal 2 tahun bermain"
  );
  assert.equal(
    TOURNAMENT_LEVEL_LABELS.intermediate,
    "Intermediate: lebih dari 2 tahun bermain"
  );
  assert.equal(
    TOURNAMENT_LEVEL_LABELS.advanced,
    "Advanced: pernah mengikuti PORDA, PORPROV, PON"
  );

  // advanced adalah kebalikan syarat: justru yang PERNAH ikut PORDA/PORPROV/PON.
  assert.equal(ika17RequiresPordaParticipation("advanced"), true);
  assert.equal(ika17RequiresPordaParticipation("beginner"), false);
  assert.equal(ika17RequiresPordaParticipation("intermediate"), false);
  assert.match(ika17EligibilityStatement("advanced"), /Pernah mengikuti PORDA/);
  assert.match(ika17EligibilityStatement("beginner"), /Belum pernah mengikuti PORDA/);
});

test("no user-facing copy still says pemula or menengah", async () => {
  const files = [
    "src/lib/tournaments/ika17-core.mjs",
    "src/lib/mysql/competition-registration-core.mjs",
    "src/lib/rating/rating-engine.ts",
    "src/lib/matches/constants.ts",
    "src/lib/services/match-history-service.ts",
    "src/lib/mysql/player-history-service.ts",
    "src/app/tournaments/page.tsx",
    "src/app/league/page.tsx",
    "src/app/players/page.tsx",
    "src/app/(protected)/profile/edit/page.tsx",
    "src/components/players/player-card.tsx",
    "src/components/matches/create-match-form.tsx",
    "supabase/migrations/00034_ika17_tournament_categories.sql",
  ];
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /\b[Pp]emula\b/, `${file} masih memakai "pemula"`);
    assert.doesNotMatch(source, /\b[Mm]enengah\b/, `${file} masih memakai "menengah"`);
  }
});

test("the register route forwards level and eligibility to the RPC", () => {
  assert.match(registerRoute, /p_playing_experience: playingExperience/);
  assert.match(registerRoute, /p_eligibility_confirmed: eligibilityConfirmed/);
});

test("the registration form collects the playing experience", () => {
  assert.match(tournamentsPage, /Pengalaman Bermain/);
  assert.match(tournamentsPage, /playingExperience,/);
  assert.match(tournamentsPage, /ika17AllowedLevels\(selected\.category\)/);
});