import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { MPR_STARTING_RATING, mprStartingRating } from "../../src/lib/rating/mpr-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const migration = await read("supabase/migrations/00041_mpr_rating.sql");
const registerPage = await read("src/app/(auth)/register/page.tsx");
const playerService = await read("src/lib/services/player-service.ts");
const playerSync = await read("src/lib/services/player-sync.ts");
const profileService = await read("src/lib/supabase/profile-service.ts");
const startingLevelRoute = await read("src/app/api/profile/starting-level/route.ts");

test("rating awal semua pemain baru 1000, apa pun kategori awalnya", () => {
  assert.equal(MPR_STARTING_RATING, 1000);
  for (const level of ["beginner", "intermediate", "advanced", "expert", null]) {
    assert.equal(mprStartingRating(level), 1000, String(level));
  }
});

test("migrasi 00041 menetapkan default 1000 dan mengizinkannya di RLS", () => {
  assert.match(
    migration,
    /ALTER COLUMN current_rating SET DEFAULT 1000\.00/
  );
  assert.match(migration, /ALTER COLUMN peak_rating SET DEFAULT 1000\.00/);
  assert.match(migration, /current_rating = 1000\.00/);
  // Policy lama (1000/1500/2000/2500) harus hilang.
  assert.doesNotMatch(migration, /current_rating IN \(1000\.00, 1500\.00, 2000\.00, 2500\.00\)/);
});

test("trigger signup memberi rating 1000 untuk semua jalur pendaftaran", () => {
  assert.match(migration, /v_rating NUMERIC := 1000/);
  // Tidak ada lagi CASE per kategori.
  assert.doesNotMatch(migration, /WHEN 'expert' THEN 2500/);
  assert.doesNotMatch(migration, /WHEN 'beginner' THEN 1000/);
});

test("trigger kategori awal tidak lagi mengubah rating menurut kategori", () => {
  const fn = migration.match(
    /CREATE OR REPLACE FUNCTION public\.apply_dtr_starting_rating\(\)[\s\S]*?\n\$\$;/
  )?.[0];
  assert.ok(fn, "fungsi trigger tidak ditemukan");
  assert.match(fn, /SET current_rating = 1000\.00/);
  assert.match(fn, /AND matches_played = 0/);
  assert.match(fn, /AND starting_rating_set_at IS NULL/);
  assert.doesNotMatch(fn, /WHEN 'expert' THEN 2500/);
});

test("form pendaftaran tidak lagi meminta self rating", () => {
  // Fitur penilaian level sendiri dihapus: semua pemain baru mulai dari 1000.
  assert.match(registerPage, /Tidak ada lagi pilihan self rating/);
  assert.doesNotMatch(registerPage, /starting_level: startingLevel/);
  assert.doesNotMatch(registerPage, /setStartingLevel/);
  assert.doesNotMatch(registerPage, /Self Rating/);
  // Halaman tetap menjelaskan rating awal 1000.
  assert.match(registerPage, /MPR_STARTING_RATING/);
});

test("halaman kategori awal tidak lagi menawarkan pilihan level", async () => {
  for (const relative of [
    "src/app/(auth)/register/page.tsx",
    "src/app/(auth)/pilih-kategori/page.tsx",
  ]) {
    const source = await readFile(new URL(`../../${relative}`, import.meta.url), "utf8");
    const options = source.match(/value: "(beginner|intermediate|advanced|expert)"/g) ?? [];
    assert.deepEqual(options, [], relative);
    // Tidak ada lagi state wajib pilih kategori awal.
    assert.doesNotMatch(source, /useState<SkillLevel \| null>\(null\)/, relative);
    assert.doesNotMatch(
      source,
      /Pilih self rating Anda: Beginner atau Intermediate\./,
      relative
    );
  }
});

test("kedua jalur player-sync memakai rating awal 1000 dan mengunci pilihan sekali", () => {
  for (const source of [playerService, playerSync]) {
    assert.match(source, /const startingRating = MPR_STARTING_RATING/);
    assert.match(source, /starting_rating_set_at/);
    // Tidak ada lagi perhitungan rating dari level.
    assert.doesNotMatch(source, /mprStartingRating\(startingLevel\)/);
    // Never re-apply once the marker exists.
    assert.match(source, /\.is\("starting_rating_set_at", null\)/);
  }
});

test("profil menyimpan level terkunci tanpa menyetel ulang rating", () => {
  assert.match(profileService, /startingLevelLocked/);
  assert.match(profileService, /starting_rating_set_at/);
  assert.match(
    profileService,
    /const selfAssessedLevel = startingLevelLocked[\s\S]*?: input\.selfAssessedLevel \?\? storedLevel;/
  );
  // Form profil tidak lagi mengirim level: nilai tersimpan harus dipertahankan.
  assert.match(profileService, /const storedLevel = \(existingProfile\?\.self_assessed_level/);
});

test("route kategori awal menolak pilihan kedua", () => {
  assert.match(startingLevelRoute, /starting_rating_set_at/);
  assert.match(startingLevelRoute, /409/);
  assert.match(startingLevelRoute, /Kategori awal sudah pernah ditetapkan/);
});

test("rating setiap pemain terpublish: view publik tidak lagi menyensor", () => {
  // View tidak boleh membungkus kolom rating dengan CASE show_rating.
  assert.doesNotMatch(migration, /CASE WHEN p\.show_rating THEN/);
  assert.match(migration, /COALESCE\(r\.current_rating, 1000\.00\) AS current_rating/);
  assert.match(migration, /COALESCE\(r\.matches_played, 0\) AS matches_played/);
});
