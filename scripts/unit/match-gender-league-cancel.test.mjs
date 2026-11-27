import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const matchService = await read("src/lib/services/match-service.ts");
const createMatchForm = await read("src/components/matches/create-match-form.tsx");
const createRoute = await read("src/app/api/matches/create/route.ts");
const matchDetail = await read("src/components/matches/match-detail-client.tsx");
const cancelRequestRoute = await read("src/app/api/matches/[id]/cancel-request/route.ts");
const leagueNoRematchMigration = await read("supabase/migrations/00043_league_no_rematch.sql");

/** Body of createOpenMatch, from its signature to the next top-level export. */
function createOpenMatchBody(source) {
  const start = source.indexOf("export async function createOpenMatch");
  assert.ok(start > -1, "createOpenMatch tidak ditemukan");
  const nextExport = source.indexOf("\nexport ", start + 10);
  const nextAsync = source.indexOf("\nasync function ", start + 10);
  const candidates = [nextExport, nextAsync].filter((index) => index > -1);
  const end = candidates.length > 0 ? Math.min(...candidates) : source.length;
  return source.slice(start, end);
}

test("pertandingan umum bebas gender: validasi gender hanya saat ada turnamen", () => {
  const body = createOpenMatchBody(matchService);

  const genderLine = body
    .split("\n")
    .find((line) => line.includes("assertCategoryGender(input.category"));
  assert.ok(genderLine, "assertCategoryGender harus tetap ada untuk turnamen");

  // Sebelumnya pemanggilan berada di level fungsi (indentasi 2 spasi) sehingga
  // berlaku untuk semua pertandingan. Sekarang harus berada di dalam blok
  // `if (tournamentId)` (indentasi 4 spasi).
  const indent = genderLine.length - genderLine.trimStart().length;
  assert.equal(indent, 4, "assertCategoryGender harus di dalam if (tournamentId)");

  // Pemanggilan lama yang berlaku untuk semua pertandingan harus hilang.
  assert.doesNotMatch(body, /assertCategoryGender\([^;]*Boolean\(tournamentId\)/);
});

test("form buat pertandingan tidak lagi memfilter pemain berdasarkan gender", () => {
  assert.doesNotMatch(createMatchForm, /isGenderCompatible\(/);
  assert.match(createMatchForm, /tidak dibatasi gender/);
});

test("kategori tetap divalidasi di route pembuatan pertandingan", () => {
  assert.match(createRoute, /CATEGORIES\.includes\(payload\.category\)/);
});

test("liga menolak jadwal duplikat untuk pasangan lawan yang sama", () => {
  assert.match(matchService, /async function assertNewLeaguePairing/);
  assert.match(matchService, /\.eq\("tournament_id", tournamentId\)/);
  assert.match(matchService, /\.neq\("status", "cancelled"\)/);
  assert.match(matchService, /maksimal 1x/);
  // Dipanggil saat membuat match liga.
  assert.match(
    matchService,
    /await assertNewLeaguePairing\(supabase, tournamentId, roster\.participants\)/
  );
});

test("migrasi 00043 menjaga aturan 1x di database dan idempoten", () => {
  assert.match(leagueNoRematchMigration, /DROP TRIGGER IF EXISTS trg_assert_league_single_pairing/);
  assert.match(
    leagueNoRematchMigration,
    /CREATE OR REPLACE FUNCTION public\.assert_league_single_pairing/
  );
  // Hanya pertandingan liga/turnamen yang dibatasi.
  assert.match(leagueNoRematchMigration, /IF v_tournament IS NULL THEN/);
  // Jadwal yang dibatalkan boleh dijadwalkan ulang.
  assert.match(leagueNoRematchMigration, /m\.status <> 'cancelled'/);
  assert.match(leagueNoRematchMigration, /maksimal 1x/);
});

test("permohonan slot bisa dibatalkan oleh pemohon", () => {
  assert.match(matchService, /export async function cancelJoinRequest/);
  assert.match(matchService, /status !== "pending"/);
  assert.match(matchService, /status: "cancelled"/);
  assert.match(cancelRequestRoute, /cancelJoinRequest\(params\.id, user\.id\)/);
  assert.match(cancelRequestRoute, /status: 401/);
  assert.match(matchDetail, /handleCancelRequest/);
  assert.match(matchDetail, /\/cancel-request/);
});

test("alur approve/reject host tidak berubah", () => {
  // accept/reject tetap hanya memproses baris berstatus pending.
  assert.match(
    matchService,
    /\.status !== "pending"\) \{\s*throw new Error\("Permohonan ini sudah diproses\."\)/
  );
  // Permohonan yang dibatalkan tidak muncul lagi di daftar host: hanya status
  // confirmed/pending/invited yang dihitung sebagai peserta aktif.
  assert.match(
    matchService,
    /status === "confirmed" \|\| status === "pending" \|\| status === "invited"/
  );
  assert.doesNotMatch(matchService, /status === "cancelled"\s*\|\|/);
});
