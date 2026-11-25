import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MPR_CALIBRATION_MATCHES,
  MPR_POINT_SWING,
  MPR_STARTING_RATING,
  mprCalibrationRemaining,
  mprIsCalibrating,
  mprRatingStatus,
} from "../../src/lib/rating/mpr-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("pengguna baru mulai dari MPR 1000", () => {
  assert.equal(MPR_STARTING_RATING, 1000);
});

test("lawan seimbang memberi +40 / -40", () => {
  assert.equal(MPR_POINT_SWING, 40);
});

test("kalibrasi selesai setelah 2 pertandingan", () => {
  assert.equal(MPR_CALIBRATION_MATCHES, 2);
  assert.equal(mprIsCalibrating(0), true);
  assert.equal(mprIsCalibrating(1), true);
  assert.equal(mprIsCalibrating(2), false);
  assert.equal(mprIsCalibrating(50), false);
  assert.equal(mprCalibrationRemaining(0), 2);
  assert.equal(mprCalibrationRemaining(1), 1);
  assert.equal(mprCalibrationRemaining(2), 0);
  assert.equal(mprRatingStatus(0), "kalibrasi");
  assert.equal(mprRatingStatus(2), "resmi");
  // Nilai rusak tidak boleh membuat pemain "resmi" tanpa bertanding.
  assert.equal(mprIsCalibrating(null), true);
  assert.equal(mprIsCalibrating(Number.NaN), true);
  assert.equal(mprCalibrationRemaining("1"), 1);
});

test("/matches menampilkan aktivitas pertandingan untuk semua pemain", async () => {
  const page = await read("src/app/matches/page.tsx");
  const service = await read("src/lib/services/match-activity-service.ts");

  // Halaman memuat feed aktivitas di samping daftar open match.
  assert.match(page, /getRecentMatchActivity\(/);
  assert.match(page, /MatchActivityEntry/);
  // Feed menampilkan pemain kedua tim beserta skor akhir.
  assert.match(service, /teams: \[MatchActivityTeam, MatchActivityTeam\]/);
  assert.match(service, /players: MatchActivityPlayer\[\]/);
  assert.match(service, /score: number \| null/);
  // Hanya pertandingan selesai yang tampil: skor pending tidak bocor.
  assert.match(service, /\.eq\("status", "completed"\)/);
});

test("kalibrasi memakai 2 pertandingan, bukan 10 seperti kode lama", async () => {
  const engine = await read("src/lib/rating/rating-engine.ts");
  assert.match(engine, /provisionalMatchThreshold: MPR_CALIBRATION_MATCHES/);
  assert.match(engine, /return mprIsCalibrating\(matchesPlayed\)/);
  assert.doesNotMatch(engine, /<= 10/);
});

test("kalkulator rating ada di menu simulasi admin", async () => {
  const client = await read("src/app/admin/simulasi/SimulationClient.tsx");
  const calculator = await read("src/app/admin/simulasi/rating-calculator.tsx");

  assert.match(client, /<RatingCalculator/);
  assert.match(client, /import \{ RatingCalculator \} from "\.\/rating-calculator"/);
  // Kalkulator memakai rumus produksi, bukan rumus terpisah.
  assert.match(calculator, /calculateMprSingles/);
  // Menampilkan kedua kemungkinan hasil.
  assert.match(calculator, /Jika A menang/);
  assert.match(calculator, /Jika B menang/);
});

test("batas 24 peserta turnamen dihapus", async () => {
  const migration = await read("supabase/migrations/00042_league_classes_from_rating.sql");
  const core = await read("src/lib/mysql/competition-registration-core.mjs");
  const ika17 = await read("src/lib/tournaments/ika17-core.mjs");

  // Tidak ada lagi penolakan karena kuota.
  assert.doesNotMatch(migration, /max_participants, 24\)/);
  assert.doesNotMatch(migration, /Kuota kategori ini sudah penuh/);
  assert.doesNotMatch(core, /Kuota kategori ini sudah penuh/);
  // Kuota tetap diekspor sebagai null agar impor lama tidak rusak.
  assert.match(ika17, /export const IKA17_QUOTA = null/);
});