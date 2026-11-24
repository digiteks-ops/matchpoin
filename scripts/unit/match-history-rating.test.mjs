import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const history = await read("src/lib/services/match-history-service.ts");
const profilePage = await read("src/app/(protected)/profile/page.tsx");
const migration = await read("supabase/migrations/00038_pending_request_reserves_slot.sql");
const seed = await read("scripts/supabase/seed-simulation.mjs");

test("history entries carry the rating change of each match", () => {
  assert.match(history, /ratingChange: number \| null/);
  assert.match(history, /ratingBefore: number \| null/);
  assert.match(history, /ratingAfter: number \| null/);
  assert.match(history, /from\("rating_history"\)/);
  assert.match(history, /\.eq\("user_id", userId\)/);
  // Perubahan dihitung dari old/new bila kolom rating_change kosong.
  assert.match(history, /Number\(row\.new_rating\) - Number\(row\.old_rating\)/);
});

test("only the last 5 matches are shown", () => {
  assert.match(history, /recentMatches: withRating\.slice\(0, 5\)/);
  assert.match(profilePage, /stats\.recentMatches\.slice\(0, 5\)/);
  assert.match(profilePage, /perubahan rating DTR/);
  // Naik hijau, turun merah.
  assert.match(profilePage, /DTR \{entry\.ratingChange > 0 \? "\+" : ""\}/);
});

test("a pending request reserves the slot for everyone else", () => {
  // Slot lawan tunggal: pending menempati slot.
  assert.match(migration, /Slot lawan sedang menunggu persetujuan host\./);
  assert.match(migration, /Slot lawan sudah terisi\./);
  // Tim ganda: pending dihitung lewat v_a1/v_a2 (termasuk pending).
  assert.match(migration, /v_a1 >= v_per_team/);
  assert.match(migration, /Tim host sedang menunggu persetujuan host\./);
  // Cek berbasis pending harus terjadi sebelum pemain dikembalikan ke antrean.
  assert.ok(
    migration.indexOf("Slot lawan sedang menunggu") < migration.indexOf("'Permohonan terkirim"),
    "pending check must run before the insert"
  );
});

test("simulation seed gives each existing player 4-8 real matches", () => {
  assert.match(seed, /return 4 \+ Math\.floor\(Math\.random\(\) \* 5\)/);
  assert.match(seed, /from\("public_players"\)/);
  // Memakai rumus DTR produksi, bukan rumus terpisah.
  assert.match(seed, /calculateDtrSingles/);
  // Menulis riwayat rating per pemain.
  assert.match(seed, /from\("rating_history"\)/);
  // Bisa dibersihkan tanpa menyentuh data asli.
  assert.match(seed, /const SIM_TAG = "simulation"/);
  assert.match(seed, /--reset/);
});
