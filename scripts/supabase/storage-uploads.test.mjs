import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const image = await readFile(new URL("../../src/lib/utils/image.ts", import.meta.url), "utf8");
const playerService = await readFile(
  new URL("../../src/lib/services/player-service.ts", import.meta.url),
  "utf8"
);
const photoUpload = await readFile(
  new URL("../../src/components/matches/photo-upload.tsx", import.meta.url),
  "utf8"
);
const migration = await readFile(
  new URL("../../supabase/migrations/00019_storage_buckets_and_policies.sql", import.meta.url),
  "utf8"
);

test("images validate jpg/png/webp and a 10 MB original limit", () => {
  assert.match(image, /ALLOWED_IMAGE_TYPES = \["image\/jpeg", "image\/png", "image\/webp"\]/);
  assert.match(image, /MAX_ORIGINAL_IMAGE_BYTES = 10 \* 1024 \* 1024/);
  assert.match(image, /Format foto harus JPG, PNG, atau WEBP/);
  assert.match(image, /Ukuran foto asli maksimal 10 MB/);
});

test("compression targets 300 KB, quality 0.8 and WebP by default", () => {
  assert.match(image, /options\.maxBytes \?\? 300 \* 1024/);
  assert.match(image, /options\.maxDimension \?\? 1280/);
  assert.match(image, /options\.quality \?\? 0\.8/);
  assert.match(image, /options\.mimeType \?\? "image\/webp"/);
});

test("avatars compress to 512 px and delete the previous file", () => {
  assert.match(playerService, /maxDimension: 512/);
  assert.match(playerService, /maxBytes: 300 \* 1024/);
  assert.match(playerService, /const filePath = `\$\{userId\}\/avatar-/);
  assert.match(playerService, /\.remove\(\[previousKey\]\)/);
  assert.match(playerService, /avatarKeyFromUrl/);
});

test("match results upload to the match-results bucket with a participant path", () => {
  assert.match(photoUpload, /NEXT_PUBLIC_SUPABASE_STORAGE_RESULTS_BUCKET \|\| "match-results"/);
  assert.match(photoUpload, /matches\/\$\{matchId\}\/\$\{userId\}/);
  assert.match(photoUpload, /maxDimension: 1280/);
  assert.match(photoUpload, /maxBytes: 300 \* 1024/);
  assert.match(photoUpload, /Mengompres foto/);
  assert.match(photoUpload, /Mengunggah foto/);
});

test("storage migration creates buckets and owner/participant policies", () => {
  assert.match(migration, /\('avatars', 'avatars', TRUE/);
  assert.match(migration, /\('match-results', 'match-results', TRUE/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_match_participant/);
  assert.match(migration, /SECURITY DEFINER[\s\S]*?SET search_path = public/);
  assert.match(migration, /"avatars owner insert"[\s\S]*?split_part\(name, '\/', 1\) = auth\.uid\(\)::text/);
  assert.match(
    migration,
    /"match results participant insert"[\s\S]*?public\.is_match_participant\(split_part\(name, '\/', 2\)::uuid, auth\.uid\(\)\)/
  );
});
