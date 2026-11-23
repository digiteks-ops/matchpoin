import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  IKA17_MAIN_EVENT_SLOTS,
  IKA17_MIN_MATCHES,
} from "../../src/lib/tournaments/ika17-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const leaderboard = await read("src/components/tournaments/tournament-leaderboard.tsx");
const tournamentsPage = await read("src/app/tournaments/page.tsx");
const matchService = await read("src/lib/services/match-service.ts");
const migration = await read("supabase/migrations/00036_fix_league_registration.sql");

test("main event takes the top 8 of each category, not per-level winners", () => {
  assert.equal(IKA17_MAIN_EVENT_SLOTS, 8);
  assert.match(leaderboard, /IKA17_MAIN_EVENT_SLOTS/);
  assert.match(leaderboard, /\.slice\(0, IKA17_MAIN_EVENT_SLOTS\)/);
  // Juara 1 & 2 per level sudah tidak dipakai lagi.
  assert.doesNotMatch(leaderboard, /Juara \$\{index \+ 1\}/);
  // Syarat pertandingan tetap berlaku.
  assert.match(leaderboard, /row\.matchesPlayed >= IKA17_MIN_MATCHES/);
  assert.equal(IKA17_MIN_MATCHES, 17);
});

test("the league rules text is the corrected one", () => {
  assert.match(tournamentsPage, /8 besar/);
  // Kalimat yang diminta dihapus tidak boleh muncul lagi.
  assert.doesNotMatch(tournamentsPage, /Kuota dihitung dari pendaftar berstatus diterima/);
  assert.doesNotMatch(tournamentsPage, /Pendaftaran masuk sebagai pending dan harus disetujui admin/);
  assert.doesNotMatch(tournamentsPage, /Ganda campuran wajib 1 pemain putra \+ 1 pemain putri/);
});

test("match capacity counts confirmed players only, never pending requests", () => {
  // `participants` memuat baris pending/invited; jumlah pemain harus dari roster
  // terkonfirmasi supaya tombol "Ajukan Slot" tidak salah bilang penuh.
  assert.match(matchService, /const confirmedCount = participants\.length > 0/);
  assert.match(matchService, /status === "confirmed"/);
  assert.match(matchService, /const currentPlayers = confirmedCount/);
  assert.doesNotMatch(matchService, /currentPlayers = participants\.length > 0 \? confirmed\.length/);
});

test("migration 00036 removes every stale registration overload first", () => {
  assert.match(migration, /p\.proname = 'register_for_competition'/);
  assert.match(migration, /DROP FUNCTION IF EXISTS %s/);
  // Satu definisi final dengan lima parameter.
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.register_for_competition\(\s*p_user_id UUID,\s*p_tournament_id UUID,\s*p_partner_user_id UUID DEFAULT NULL,\s*p_playing_experience TEXT DEFAULT NULL,\s*p_eligibility_confirmed BOOLEAN DEFAULT false/s
  );
  // Kuota hanya dari pendaftar diterima, satu tim ganda = satu slot.
  assert.match(migration, /COUNT\(DISTINCT COALESCE\(tp\.entry_id::text, tp\.id::text\)\)/);
  assert.match(migration, /tp\.status IN \('accepted', 'confirmed'\)/);
  // Level wajib salah satu dari dua pilihan.
  assert.match(migration, /v_experience NOT IN \('beginner', 'intermediate'\)/);
});
test("registration still works when the RPC is missing or has another signature", async () => {
  const route = await read("src/app/api/tournaments/register/route.ts");
  // Fallback memakai aturan yang sama dengan versi MySQL, bukan aturan baru.
  assert.match(route, /evaluateLeagueRegistration\(\{/);
  assert.match(route, /if \(error\) \{[\s\S]*?registerWithoutRpc\(/);
  // Pendaftaran tetap tersimpan sebagai pending dan partner ikut didaftarkan.
  assert.match(route, /status: "pending"/);
  assert.match(route, /entry_role: "partner"/);
  // Error RPC asli tetap dilaporkan bila fallback tidak bisa menangani.
  assert.match(route, /throw new Error\(error\.message\)/);
});
