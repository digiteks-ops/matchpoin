import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MPR_CALIBRATION_MATCHES,
  MPR_POINT_SWING,
  mprCalibrationRemaining,
  mprIsCalibrating,
} from "../../src/lib/rating/mpr-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const service = await read("src/lib/services/match-activity-service.ts");
const matchesPage = await read("src/app/matches/page.tsx");
const leaderboardPage = await read("src/app/leaderboard/page.tsx");
const playerCard = await read("src/components/players/player-card.tsx");

test("/matches menampilkan aktivitas pertandingan terbaru untuk semua pemain", () => {
  assert.match(matchesPage, /getRecentMatchActivity/);
  assert.match(matchesPage, /Aktivitas Pertandingan Terbaru/);
  assert.match(matchesPage, /Terbuka untuk\s+dilihat semua pemain/);
  // Pemain dan hasil ikut ditampilkan.
  assert.match(matchesPage, /ActivityTeamLine/);
  assert.match(matchesPage, /entry\.teams/);
});

test("aktivitas hanya memakai pertandingan selesai dan data publik", () => {
  // Hasil yang masih pending tidak boleh bocor ke halaman publik.
  assert.match(service, /\.eq\("status", "confirmed"\)/);
  assert.match(service, /match_results/);
  assert.match(service, /match_participants/);
  assert.match(service, /public_players/);
  assert.match(service, /export async function getRecentMatchActivity/);
  // Pending/invited/rejected bukan pemain yang bertanding.
  assert.match(service, /status !== "pending" && status !== "invited" && status !== "rejected"/);
});

test("hasil pertandingan menandai pemenang dan skor kedua tim", () => {
  assert.match(service, /isWinner: winnerTeam === 1/);
  assert.match(service, /isWinner: winnerTeam === 2/);
  assert.match(service, /score: result\?\.team1_score/);
  assert.match(service, /score: result\?\.team2_score/);
});

test("kalibrasi 2 pertandingan tampil di UI sebagai status, bukan ranking resmi", () => {
  assert.equal(MPR_CALIBRATION_MATCHES, 2);
  assert.equal(mprIsCalibrating(1), true);
  assert.equal(mprIsCalibrating(2), false);
  assert.equal(mprCalibrationRemaining(0), 2);
  assert.equal(mprCalibrationRemaining(1), 1);

  assert.match(leaderboardPage, /mprIsCalibrating/);
  assert.match(leaderboardPage, /Kalibrasi/);
  assert.match(leaderboardPage, /dua\s+pertandingan pertama adalah/i);
  assert.match(playerCard, /player\.isProvisional/);
});

test("sistem poin seimbang memakai +40 / -40", () => {
  assert.equal(MPR_POINT_SWING, 40);
});
