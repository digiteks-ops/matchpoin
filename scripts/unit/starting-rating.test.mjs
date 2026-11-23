import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { dtrStartingRating } from "../../src/lib/rating/dtr-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const migration = await read("supabase/migrations/00032_dtr_starting_rating_once.sql");
const registerPage = await read("src/app/(auth)/register/page.tsx");
const playerService = await read("src/lib/services/player-service.ts");
const playerSync = await read("src/lib/services/player-sync.ts");
const profileService = await read("src/lib/supabase/profile-service.ts");
const startingLevelRoute = await read("src/app/api/profile/starting-level/route.ts");

test("category choice maps to the DTR starting scale", () => {
  assert.equal(dtrStartingRating("beginner"), 1000);
  assert.equal(dtrStartingRating("intermediate"), 1500);
  assert.equal(dtrStartingRating("advanced"), 2000);
  assert.equal(dtrStartingRating("expert"), 2500);
});

test("migration adds the one-time marker and backfills existing players as locked", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS starting_rating_set_at TIMESTAMPTZ/);
  assert.match(
    migration,
    /UPDATE public\.player_ratings\s+SET starting_rating_set_at = COALESCE\(created_at, now\(\)\)\s+WHERE starting_rating_set_at IS NULL/
  );
});

test("starting rating trigger only fires while the marker is empty", () => {
  const fn = migration.match(
    /CREATE OR REPLACE FUNCTION public\.apply_dtr_starting_rating\(\)[\s\S]*?\n\$\$;/
  )?.[0];
  assert.ok(fn, "trigger function not found");
  assert.match(fn, /AND matches_played = 0/);
  assert.match(fn, /AND starting_rating_set_at IS NULL/);
  assert.match(fn, /starting_rating_set_at = now\(\)/);
});

test("signup trigger reads the chosen category from user metadata", () => {
  assert.match(migration, /NEW\.raw_user_meta_data->>'starting_level'/);
  assert.match(migration, /WHEN 'expert' THEN 2500/);
  assert.match(migration, /WHEN 'intermediate' THEN 1500/);
  assert.match(migration, /WHEN 'advanced' THEN 2000/);
  assert.match(migration, /WHEN 'beginner' THEN 1000/);
});

test("registration form submits the category and sends it to signUp metadata", () => {
  assert.match(registerPage, /starting_level: startingLevel/);
  assert.match(registerPage, /setStartingLevel/);
  assert.match(registerPage, /Self Rating/);
  assert.match(registerPage, /dtrStartingRating\(startingLevel\)/);
});

test("self rating at registration offers exactly beginner and intermediate", async () => {
  for (const relative of ["src/app/(auth)/register/page.tsx", "src/app/(auth)/pilih-kategori/page.tsx"]) {
    const source = await readFile(new URL(`../../${relative}`, import.meta.url), "utf8");
    const options = source.match(/value: "(beginner|intermediate|advanced|expert)"/g) ?? [];
    assert.deepEqual(
      options.map((entry) => entry.slice(8, -1)),
      ["beginner", "intermediate"],
      relative
    );
    // Wajib dipilih: tidak ada nilai awal, dan submit menolak pilihan kosong.
    assert.match(source, /useState<SkillLevel \| null>\(null\)/, relative);
    assert.match(source, /Pilih self rating Anda: Beginner atau Intermediate\./, relative);
  }
  // Rating awal tiap pilihan.
  assert.equal(dtrStartingRating("beginner"), 1000);
  assert.equal(dtrStartingRating("intermediate"), 1500);
});

test("both player-sync paths accept a starting level and lock the rating", () => {
  for (const source of [playerService, playerSync]) {
    assert.match(source, /startingLevel\?: SkillLevel/);
    assert.match(source, /dtrStartingRating\(startingLevel\)/);
    assert.match(source, /starting_rating_set_at/);
    // Never re-apply once the marker exists.
    assert.match(source, /\.is\("starting_rating_set_at", null\)/);
  }
});

test("profile saves keep the locked level instead of re-rating the player", () => {
  assert.match(profileService, /startingLevelLocked/);
  assert.match(profileService, /starting_rating_set_at/);
  assert.match(
    profileService,
    /const selfAssessedLevel = startingLevelLocked[\s\S]*?: input\.selfAssessedLevel;/
  );
});

test("one-time picker route refuses a second choice", () => {
  assert.match(startingLevelRoute, /starting_rating_set_at/);
  assert.match(startingLevelRoute, /409/);
  assert.match(startingLevelRoute, /Kategori awal sudah pernah ditetapkan/);
});

test("migration allows the chosen category rating under the insert RLS policy", () => {
  assert.match(
    migration,
    /current_rating IN \(1000\.00, 1500\.00, 2000\.00, 2500\.00\)/
  );
});