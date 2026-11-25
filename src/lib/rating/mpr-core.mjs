// MPR — MatchPoin Rating (Modified Elo, integer scale, starting rating 1000).
// Shared by the Supabase rating engine, the admin simulation, and CLI scripts.
//
// Sistem poin ("sistem +40"):
//   - Menang lawan seimbang            → +40
//   - Kalah lawan seimbang             → -40
//   - Menang lawan rating lebih tinggi → tambah poin banyak (mendekati +80)
//   - Kalah lawan rating lebih tinggi  → minus poin sedikit (mendekati -0)
//   - Menang lawan rating lebih rendah → tambah poin sedikit (mendekati +0)
//   - Kalah lawan rating lebih rendah  → minus poin banyak (mendekati -80)
//
// Semua pemain baru mendaftar dengan rating awal 1000, lalu menjalani
// KALIBRASI selama 2 pertandingan. Selama kalibrasi rating tetap bergerak
// tetapi belum dianggap peringkat resmi (lihat MPR_CALIBRATION_MATCHES).

// Rating awal setiap pemain baru. Ini BUKAN lantai: pemain yang terus kalah
// boleh turun di bawah 1000, dengan MPR_ABSOLUTE_MIN_RATING sebagai pengaman.
export const MPR_STARTING_RATING = 1000;
export const MPR_DEFAULT_RATING = MPR_STARTING_RATING;
// Guard against corrupt arithmetic only; kept in sync with the CHECK
// constraints in supabase/migrations/00031_dtr_no_rating_floor.sql.
export const MPR_ABSOLUTE_MIN_RATING = 1;
// Laga seimbang (expected 0.5) harus bergerak +40 / −40. Pada skala Elo
// delta = K × (skor − expected), jadi K = 2 × 40 = 80. Hasilnya:
//   menang  → 0 … +80   (makin besar lawannya, makin besar poinnya)
//   kalah   → 0 … −80   (makin kecil lawannya, makin besar minusnya)
export const MPR_POINT_SWING = 40;
export const MPR_K_FACTOR = MPR_POINT_SWING * 2;
export const MPR_LOGISTIC_DIVISOR = 400;

// Kalibrasi: dua pertandingan pertama hanya menyesuaikan rating awal, belum
// dianggap peringkat resmi. Sesudah itu rating menjadi ranking resmi.
export const MPR_CALIBRATION_MATCHES = 2;

// Kategori awal saat mendaftar tidak lagi mengubah rating: semua pemain baru
// mulai dari 1000. Pilihan beginner/intermediate tetap disimpan sebagai
// self-assessed level (dipakai untuk preferensi & tampilan profil).
export const MPR_STARTING_RATINGS = {
  beginner: MPR_STARTING_RATING,
  intermediate: MPR_STARTING_RATING,
  advanced: MPR_STARTING_RATING,
  expert: MPR_STARTING_RATING,
};

// Satu sumber kebenaran untuk batas kategori MPR:
//   Beginner      0    – 1099
//   Intermediate  1100 – 1599
//   Advanced      1600 – 1999
//   Expert        2000+
// Diakses juga oleh rating-tier-core.mjs.
export const MPR_CATEGORIES = [
  { key: "beginner", label: "Beginner", minRating: 0, maxRating: 1099 },
  { key: "intermediate", label: "Intermediate", minRating: 1100, maxRating: 1599 },
  { key: "advanced", label: "Advanced", minRating: 1600, maxRating: 1999 },
  { key: "expert", label: "Expert", minRating: 2000, maxRating: null },
];

// MPR memakai satu K factor tetap untuk setiap pertandingan.
export function mprKFactor(_matchesPlayed) {
  return MPR_K_FACTOR;
}

export function mprExpectedScore(playerRating, opponentRating) {
  return 1 / (1 + Math.pow(10, (opponentRating - playerRating) / MPR_LOGISTIC_DIVISOR));
}

export function mprCategory(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value)) return "beginner";
  if (value >= 2000) return "expert";
  if (value >= 1600) return "advanced";
  if (value >= 1100) return "intermediate";
  return "beginner";
}

export function mprCategoryLabel(rating) {
  const key = mprCategory(rating);
  return MPR_CATEGORIES.find((category) => category.key === key)?.label ?? "Beginner";
}

export function mprStartingRating(level) {
  const key = String(level ?? "").trim().toLowerCase();
  return MPR_STARTING_RATINGS[key] ?? MPR_DEFAULT_RATING;
}

function normalizeRating(value) {
  // Nilai kosong jatuh ke rating awal 1000. Rating di bawah 1000 tetap dipakai
  // apa adanya: 1000 adalah titik awal, bukan lantai.
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : MPR_DEFAULT_RATING;
}

function buildChange(player, expected, actual, delta, matchK) {
  const oldRating = normalizeRating(player.rating);
  const newRating = Math.max(MPR_ABSOLUTE_MIN_RATING, oldRating + Math.round(delta));
  return {
    userId: player.userId,
    oldRating,
    newRating,
    delta: newRating - oldRating,
    expected: Math.round(expected * 1000) / 1000,
    actual,
    kFactor: matchK,
  };
}

/**
 * Singles: one rating per player, Match K is the fixed MPR K factor.
 */
export function calculateMprSingles(playerA, playerB, winner) {
  const matchK = MPR_K_FACTOR;

  const ratingA = normalizeRating(playerA.rating);
  const ratingB = normalizeRating(playerB.rating);

  const expectedA = mprExpectedScore(ratingA, ratingB);
  const expectedB = 1 - expectedA;

  const scoreA = winner === "A" ? 1 : winner === "B" ? 0 : 0.5;
  const scoreB = winner === "B" ? 1 : winner === "A" ? 0 : 0.5;

  // Satu delta bertanda membuat kedua pemain konsisten dan zero-sum sebelum
  // pemotongan batas bawah.
  const deltaA = Math.round(matchK * (scoreA - expectedA));
  const deltaB = -deltaA;

  return {
    matchK,
    playerA: buildChange({ ...playerA, rating: ratingA }, expectedA, scoreA, deltaA, matchK),
    playerB: buildChange({ ...playerB, rating: ratingB }, expectedB, scoreB, deltaB, matchK),
  };
}

/**
 * Doubles: compare team averages and give both winners the same positive change
 * and both losers the same negative change.
 */
export function calculateMprDoubles(team1, team2, winnerTeam) {
  const matchK = MPR_K_FACTOR;

  const team1Avg = (normalizeRating(team1[0].rating) + normalizeRating(team1[1].rating)) / 2;
  const team2Avg = (normalizeRating(team2[0].rating) + normalizeRating(team2[1].rating)) / 2;

  const expectedTeam1 = mprExpectedScore(team1Avg, team2Avg);
  const expectedTeam2 = 1 - expectedTeam1;

  const scoreTeam1 = winnerTeam === 1 ? 1 : 0;
  const scoreTeam2 = winnerTeam === 2 ? 1 : 0;

  const team1Delta = Math.round(matchK * (scoreTeam1 - expectedTeam1));
  const team2Delta = -team1Delta;

  return {
    matchK,
    team1Avg: Math.round(team1Avg * 100) / 100,
    team2Avg: Math.round(team2Avg * 100) / 100,
    team1Results: team1.map((player) =>
      buildChange(player, expectedTeam1, scoreTeam1, team1Delta, matchK)
    ),
    team2Results: team2.map((player) =>
      buildChange(player, expectedTeam2, scoreTeam2, team2Delta, matchK)
    ),
  };
}

/**
 * True selama pemain masih menjalani kalibrasi (belum 2 pertandingan selesai).
 * Selama kalibrasi rating tetap tampil dan bergerak, tetapi belum dianggap
 * peringkat resmi.
 */
export function mprIsCalibrating(matchesPlayed) {
  const played = Number(matchesPlayed);
  const safePlayed = Number.isFinite(played) && played > 0 ? played : 0;
  return safePlayed < MPR_CALIBRATION_MATCHES;
}

/** Sisa pertandingan kalibrasi (0 = sudah resmi). */
export function mprCalibrationRemaining(matchesPlayed) {
  const played = Number(matchesPlayed);
  const safePlayed = Number.isFinite(played) && played > 0 ? played : 0;
  return Math.max(0, MPR_CALIBRATION_MATCHES - safePlayed);
}

/** Label status rating untuk UI: "Kalibrasi" atau "Resmi". */
export function mprRatingStatus(matchesPlayed) {
  return mprIsCalibrating(matchesPlayed) ? "kalibrasi" : "resmi";
}
