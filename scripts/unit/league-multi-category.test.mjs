import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateLeagueRegistration,
  isDoubles,
} from "../../src/lib/mysql/competition-registration-core.mjs";
import { IKA17_CATEGORIES } from "../../src/lib/tournaments/ika17-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const leaguePage = await read("src/app/league/page.tsx");
const competitionService = await read("src/lib/supabase/competition-service.ts");
const mysqlService = await read("src/lib/mysql/competition-service.ts");
const tournamentsPage = await read("src/app/tournaments/page.tsx");
const categoriesMigration = await read(
  "supabase/migrations/00034_ika17_tournament_categories.sql"
);

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
    partnerUserId: isDoubles(category) ? PARTNER : null,
    registeredUserIds: [],
    entryCount: 0,
    userGender: "male",
    partnerGender: "female",
    eligibilityConfirmed: true,
    today: "2026-11-19",
    ...overrides,
  });

test("a player may register in a second category", () => {
  // Being registered in Single Man must not block Double Man: the duplicate
  // list is scoped to the category being registered, so it arrives empty here.
  assert.equal(evaluate("mens_singles").ok, true);
  assert.equal(evaluate("mens_doubles").ok, true);
  assert.equal(evaluate("mixed_doubles").ok, true);
});

test("a duplicate inside the same category is still rejected", () => {
  assert.deepEqual(evaluate("mens_singles", { registeredUserIds: [USER] }), {
    ok: false,
    message: "Anda sudah terdaftar pada kategori ini.",
  });
  assert.deepEqual(evaluate("mens_doubles", { registeredUserIds: [PARTNER] }), {
    ok: false,
    message: "Partner yang dipilih sudah terdaftar di kategori ini.",
  });
});

test("single and double registrations both pass with a complete payload", () => {
  assert.deepEqual(evaluate("mens_singles"), {
    ok: true,
    category: "mens_singles",
    doubles: false,
  });
  assert.deepEqual(evaluate("mens_doubles"), {
    ok: true,
    category: "mens_doubles",
    doubles: true,
  });
  // Singles must not carry a partner, doubles must.
  assert.equal(evaluate("mens_singles", { partnerUserId: PARTNER }).ok, false);
  assert.equal(evaluate("mens_doubles", { partnerUserId: null }).ok, false);
});

test("every UI category maps to a league slug the RPC can resolve", () => {
  for (const category of IKA17_CATEGORIES) {
    assert.ok(category.slug, category.id);
    assert.equal(evaluate(category.id).ok, true, category.id);
  }
});

test("the duplicate lookups are scoped to the registered category", () => {
  assert.match(
    competitionService,
    /if \(category\) takenQuery = takenQuery\.eq\("category", category\);/
  );
  assert.match(
    mysqlService,
    /WHERE tournament_id = \? AND category = \? AND user_id IN \(\?, \?\) AND status <> 'rejected'/
  );
});

test("the league page submits partner and eligibility without a level", () => {
  assert.match(leaguePage, /const CATEGORIES = IKA17_CATEGORIES;/);
  assert.match(leaguePage, /partnerUserId: definition\?\.doubles \? regPartnerId : null/);
  assert.doesNotMatch(leaguePage, /playingExperience: regLevel/);
  assert.match(leaguePage, /eligibilityConfirmed: regEligibility/);
  assert.doesNotMatch(leaguePage, /JSON\.stringify\(\{ tournamentId: regLeague\.id \}\)/);
});

test("the league page offers the partner/eligibility inputs and explains classes", () => {
  assert.match(leaguePage, /id="regPartner"/);
  assert.match(leaguePage, /Kelas liga otomatis/);
  assert.match(leaguePage, /IKA17_ELIGIBILITY_STATEMENT/);
  assert.doesNotMatch(leaguePage, /["']womens_singles["']/);
});

test("the RPC treats every doubles category as doubles", async () => {
  const migration = await read("supabase/migrations/00042_league_classes_from_rating.sql");
  const sql = migration.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(sql, /LIKE '%_doubles'/);
  assert.match(sql, /v_doubles := v_category LIKE '%doubles%';/);
  // Keep the SQL doubles rule in step with the JS helper for every category.
  for (const category of IKA17_CATEGORIES) {
    assert.equal(category.id.includes("doubles"), isDoubles(category.id), category.id);
  }
});

test("the seed cannot abort on the legacy womens_singles row", () => {
  // `ADD CONSTRAINT ... CHECK` validates existing rows, so a leftover
  // womens_singles league made the whole migration fail and the new category
  // never appeared ("Kategori belum tersedia").
  const migration = categoriesMigration.replace(/^\s*--.*$/gm, "");
  assert.match(migration, /WHERE category = 'womens_singles'/);
  assert.match(migration, /DELETE FROM public\.tournaments WHERE id = legacy\.id/);
  // Data must not be silently dropped: rows with registrations are moved.
  assert.match(migration, /SET category = 'womens_doubles_intermediate'/);
  assert.doesNotMatch(migration, /RAISE EXCEPTION/);
});

test("the seed does not rely on ON CONFLICT against tournaments.slug", () => {
  // `uq_tournaments_slug` is a PARTIAL unique index, so a bare
  // ON CONFLICT (slug) raises "no unique or exclusion constraint matching the
  // ON CONFLICT specification" and aborts the whole migration.
  const migration = categoriesMigration.replace(/^\s*--.*$/gm, "");
  assert.doesNotMatch(migration, /ON CONFLICT \(slug\)/);
  assert.match(migration, /UPDATE public\.tournaments[\s\S]*?WHERE slug = v_entry\.slug;/);
  assert.match(migration, /IF NOT FOUND THEN\s*INSERT INTO public\.tournaments/);
});

test("the tournaments page binds a category row by slug as a fallback", () => {
  assert.match(tournamentsPage, /entry\.slug === definition\.slug/);
  assert.match(tournamentsPage, /slug: string \| null;/);
});
