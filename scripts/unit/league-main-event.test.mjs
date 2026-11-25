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
const migration = await read("supabase/migrations/00042_league_classes_from_rating.sql");

test("main event takes the top 8 of each class in every category", () => {
  assert.equal(IKA17_MAIN_EVENT_SLOTS, 8);
  assert.match(leaderboard, /IKA17_MAIN_EVENT_SLOTS/);
  assert.match(leaderboard, /\.slice\(0, IKA17_MAIN_EVENT_SLOTS\)/);
  // Delapan besar dihitung per kelas (beginner & intermediate), bukan gabungan.
  assert.match(leaderboard, /for \(const klass of IKA17_CLASSES\)/);
  // Juara 1 & 2 per level sudah tidak dipakai lagi.
  assert.doesNotMatch(leaderboard, /Juara \$\{index \+ 1\}/);
  // Syarat pertandingan tetap berlaku.
  assert.match(leaderboard, /row\.matchesPlayed >= IKA17_MIN_MATCHES/);
  assert.equal(IKA17_MIN_MATCHES, 17);
});

test("the league rules text is the corrected one", () => {
  assert.match(tournamentsPage, /IKA17_MAIN_EVENT_SLOTS/);
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

test("migration 00042 removes every stale registration overload first", () => {
  assert.match(migration, /p\.proname = 'register_for_competition'/);
  assert.match(migration, /DROP FUNCTION IF EXISTS %s/);
  // Satu definisi final dengan lima parameter (parameter level dipertahankan).
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.register_for_competition\(\s*p_user_id UUID,\s*p_tournament_id UUID,\s*p_partner_user_id UUID DEFAULT NULL,\s*p_playing_experience TEXT DEFAULT NULL,\s*p_eligibility_confirmed BOOLEAN DEFAULT false/s
  );
  // Tanpa batas kuota: pendaftaran hanya ditutup oleh periode & status liga.
  assert.doesNotMatch(migration, /max_participants, 24\)/);
  assert.doesNotMatch(migration, /Kuota kategori ini sudah penuh/);
  // Tidak ada lagi validasi level: kelas liga dibentuk dari MPR.
  assert.doesNotMatch(migration, /v_experience NOT IN/);
  assert.match(migration, /now\(\), NULL, TRUE\)/);
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

test("registration opens 1 December 2026 everywhere, not just on /league", async () => {
  const { evaluateLeagueRegistration, formatRegistrationOpen } = await import(
    "../../src/lib/mysql/competition-registration-core.mjs"
  );
  const base = {
    tournament: {
      category: "mens_singles",
      status: "registration_open",
      max_participants: 24,
      registration_deadline: "2026-12-31",
      registration_open_at: "2026-12-01",
    },
    userId: "u1",
    partnerUserId: null,
    registeredUserIds: [],
    entryCount: 0,
    eligibilityConfirmed: true,
  };
  // Sebelum tanggal buka: ditolak dengan pesan bertanggal.
  const early = evaluateLeagueRegistration({ ...base, today: "2026-11-24" });
  assert.equal(early.ok, false);
  assert.match(early.message, /1 Desember 2026/);
  // Di dalam periode: lolos.
  for (const today of ["2026-12-01", "2026-12-15", "2026-12-31"]) {
    assert.equal(evaluateLeagueRegistration({ ...base, today }).ok, true, today);
  }
  // Setelah tutup: ditolak.
  const late = evaluateLeagueRegistration({ ...base, today: "2027-01-01" });
  assert.equal(late.ok, false);
  assert.match(late.message, /ditutup/);

  assert.equal(formatRegistrationOpen("2026-12-01"), "1 Desember 2026");

  // Tanggal buka dibaca dari satu sumber di seluruh aplikasi.
  const { IKA17_REGISTRATION_OPEN } = await import("../../src/lib/tournaments/ika17-core.mjs");
  assert.equal(IKA17_REGISTRATION_OPEN, "2026-12-01");
  const leaguePage = await read("src/app/league/page.tsx");
  assert.match(leaguePage, /REG_OPEN = IKA17_REGISTRATION_OPEN/);
  // RPC juga memeriksa tanggal buka.
  assert.match(migration, /registration_open_at AT TIME ZONE 'Asia\/Makassar'/);
});
