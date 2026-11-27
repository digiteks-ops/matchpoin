import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMIN_WHATSAPP_NUMBER,
  adminWhatsappUrl,
} from "../../src/lib/notifications/whatsapp-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const location = await read("src/lib/constants/location.ts");
const profileRoute = await read("src/app/api/profile/route.ts");
const profileService = await read("src/lib/supabase/profile-service.ts");
const profileEditPage = await read("src/app/(protected)/profile/edit/page.tsx");
const playersPage = await read("src/app/players/page.tsx");
const leaderboardPage = await read("src/app/leaderboard/page.tsx");
const createMatchForm = await read("src/components/matches/create-match-form.tsx");

test("lokasi bawaan adalah Sulawesi Selatan, Kota Makassar", () => {
  assert.match(location, /export const DEFAULT_PROVINCE = "Sulawesi Selatan";/);
  assert.match(location, /export const DEFAULT_CITY_NAME = "Makassar";/);
  // Kota dicocokkan lewat nama karena id kota berbeda antar environment.
  assert.match(location, /export function findDefaultCity/);
  assert.match(location, /normalizeCityName/);
});

test("profil, filter, dan pembuatan pertandingan memakai lokasi bawaan", () => {
  for (const [name, source] of [
    ["profile edit", profileEditPage],
    ["players", playersPage],
    ["leaderboard", leaderboardPage],
    ["create match", createMatchForm],
  ]) {
    assert.match(source, /@\/lib\/constants\/location/, name);
    assert.match(source, /DEFAULT_PROVINCE/, name);
  }
  assert.match(profileEditPage, /findDefaultCity/);
  assert.match(createMatchForm, /DEFAULT_CITY_NAME/);
  assert.match(playersPage, /findDefaultCity/);
  assert.match(leaderboardPage, /findDefaultCity/);
});

test("form edit profil tetap bisa disimpan tanpa selfAssessedLevel", () => {
  // Bug: form tidak lagi mengirim level, tetapi route mewajibkannya sehingga
  // semua simpan ditolak dengan "Data profil tidak valid." Level kini opsional:
  // validasi hanya berjalan bila field benar-benar dikirim.
  assert.match(
    profileRoute,
    /body\.selfAssessedLevel !== null &&\s*body\.selfAssessedLevel !== undefined &&\s*\(typeof body\.selfAssessedLevel !== "string"/
  );
  assert.match(profileRoute, /\?\? null,/);
  // Level tersimpan dipertahankan, bukan direset ke beginner.
  assert.match(profileService, /const storedLevel = \(existingProfile\?\.self_assessed_level/);
  assert.match(profileService, /input\.selfAssessedLevel \?\? storedLevel/);
  // Upsert tidak menulis kolom level bila tidak ada nilai.
  assert.match(
    profileService,
    /\.\.\.\(selfAssessedLevel \? \{ self_assessed_level: selfAssessedLevel \} : \{\}\)/
  );
});

test("tombol chat admin memakai nomor WhatsApp yang diminta", () => {
  assert.equal(ADMIN_WHATSAPP_NUMBER, "6285128066022");
  assert.match(adminWhatsappUrl("Halo"), /^https:\/\/wa\.me\/6285128066022/);
});
