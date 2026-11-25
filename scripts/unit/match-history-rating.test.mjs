import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const history = await read("src/lib/services/match-history-service.ts");
const profilePage = await read("src/app/(protected)/profile/page.tsx");
const historyPage = await read("src/app/(protected)/profile/history/page.tsx");
const migration = await read("supabase/migrations/00040_pending_does_not_block.sql");
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

test("profile shows the last 5 matches and the full history page exists", () => {
  assert.match(history, /recentMatches: withRating\.slice\(0, Math\.max\(0, recentLimit\)\)/);
  assert.match(profilePage, /stats\.recentMatches\.slice\(0, 5\)/);
  assert.match(profilePage, /perubahan rating MPR/);
  assert.match(profilePage, /href="\/profile\/history"/);
  assert.match(historyPage, /getPlayerStats\(user\.id, 100\)/);
  // Naik hijau, turun merah.
  assert.match(profilePage, /MPR \{entry\.ratingChange > 0 \? "\+" : ""\}/);
});

test("pending requests do not reserve a slot while it is not confirmed", () => {
  // Capacity counts only confirmed/invited rows, never pending rows.
  assert.match(migration, /IN \('confirmed', 'invited'\)/);
  assert.doesNotMatch(migration, /v_a1/);
  assert.doesNotMatch(migration, /v_a2/);
  assert.doesNotMatch(migration, /sedang menunggu persetujuan host/);
  // Headroom must exceed the logical capacity, otherwise the active-row guard
  // would still let one pending request block everyone else.
  assert.match(migration, /v_max_rows := v_max \+ 2/);
  // The confirmed opponent slot still blocks once it is filled.
  assert.match(migration, /Slot lawan sudah terisi\./);
  assert.match(migration, /Tim host sudah penuh\./);
  assert.match(migration, /Tim lawan sudah penuh\./);
});

test("simulation seed gives each existing player 4-8 real matches", () => {
  assert.match(seed, /return 4 \+ Math\.floor\(Math\.random\(\) \* 5\)/);
  assert.match(seed, /from\("public_players"\)/);
  // Memakai rumus MPR produksi, bukan rumus terpisah.
  assert.match(seed, /calculateMprSingles/);
  // Menulis riwayat rating per pemain.
  assert.match(seed, /from\("rating_history"\)/);
  // Bisa dibersihkan tanpa menyentuh data asli.
  assert.match(seed, /const SIM_TAG = "simulation"/);
  assert.match(seed, /--reset/);
});
