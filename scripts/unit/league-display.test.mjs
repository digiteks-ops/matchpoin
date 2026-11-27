import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const leaguePage = await read("src/app/league/page.tsx");
const profileEdit = await read("src/app/(protected)/profile/edit/page.tsx");

test("liga membaca peserta lewat API server, bukan query yang diblokir RLS", () => {
  // RLS `tournament_participants` hanya membuka baris milik sendiri, sehingga
  // query langsung dari browser membuat halaman publik tampil kosong.
  assert.match(leaguePage, /\/api\/leagues\/\$\{encodeURIComponent\(category\)\}/);
  assert.doesNotMatch(
    leaguePage,
    /\.from\("tournament_participants"\)[\s\S]{0,120}\.eq\("tournament_id", lg\.id\)/,
    "peserta tidak boleh dibaca langsung dari tabel di halaman publik"
  );
});

test("status liga ditampilkan dalam Bahasa Indonesia, bukan snake_case", () => {
  assert.match(leaguePage, /function leagueStatusLabel/);
  assert.match(leaguePage, /case "registration_open":\s*\n\s*return "Pendaftaran dibuka";/);
  assert.match(leaguePage, /leagueStatusLabel\(league\?\.status\)/);
  // Jangan lagi mencetak nilai mentah dengan capitalize.
  assert.doesNotMatch(leaguePage, /capitalize">\{league\?\.status/);
});

test("periode liga dan pendaftaran diformat, bukan tanggal ISO mentah", () => {
  assert.match(leaguePage, /function formatLeagueDate/);
  assert.match(leaguePage, /formatLeagueDate\(league\?\.start_date\)/);
  assert.match(leaguePage, /formatLeagueDate\(REG_OPEN\)/);
  assert.match(leaguePage, /formatLeagueDate\(REG_CLOSE\)/);
  // Teks lama yang salah (15 Nov) tidak boleh kembali.
  assert.doesNotMatch(leaguePage, /15 Nov 2026/);
});

test("tombol daftar liga nonaktif saat periode pendaftaran belum dibuka", () => {
  assert.match(leaguePage, /disabled=\{!regPeriodOpen\}/);
  assert.match(leaguePage, /Pendaftaran dibuka \$\{formatLeagueDate\(REG_OPEN\)\}/);
});

test("tidak ada karakter mojibake pada teks bantuan unggah foto", () => {
  assert.doesNotMatch(profileEdit, /â‰¤|â€“|Â·/);
  assert.match(profileEdit, /512 px, ≤300 KB/);
});
