// Aturan siapa yang muncul di leaderboard.
//
//   beginner                      -> langsung tampil, walau belum pernah bertanding
//   intermediate / advanced / expert -> tampil setelah MINIMAL 3 pertandingan
//                                      yang hasilnya sudah terverifikasi
//
// "3x bertanding" dihitung dari `player_ratings.matches_played`, yang hanya
// bertambah ketika hasil pertandingan berstatus confirmed (lihat
// apply_match_rating_change di rating-service). Jadi pemain yang baru membuat
// atau mendaftar pertandingan belum dihitung.

/** Jumlah pertandingan terverifikasi sebelum level non-beginner boleh tampil. */
export const LEADERBOARD_MIN_MATCHES_NON_BEGINNER = 3;

/** Level yang boleh tampil di leaderboard tanpa menunggu pertandingan. */
export const LEADERBOARD_IMMEDIATE_LEVEL = "beginner";

function normalizeLevel(level) {
  return typeof level === "string" ? level.trim().toLowerCase() : "";
}

/**
 * True bila pemain harus mengumpulkan pertandingan dulu sebelum tampil.
 *
 * Hanya level yang SECARA EKSPLISIT bukan beginner yang menunggu. Level kosong
 * (`null`) dianggap beginner karena begitulah default sistem: pendaftaran tanpa
 * pilihan level menyimpan 'beginner' (lihat ensurePlayerRecords), dan pemain
 * lama yang profilnya belum lengkap tidak boleh tiba-tiba hilang dari
 * leaderboard. Level ditetapkan sekali saat mendaftar, jadi mengosongkannya
 * bukan celah yang bisa dipakai untuk melewati aturan ini.
 */
export function leaderboardRequiresMatches(level) {
  const normalized = normalizeLevel(level);
  if (normalized === "") return false;
  return normalized !== LEADERBOARD_IMMEDIATE_LEVEL;
}

/** Batas pertandingan yang berlaku untuk level tersebut. */
export function leaderboardMinMatches(level) {
  return leaderboardRequiresMatches(level) ? LEADERBOARD_MIN_MATCHES_NON_BEGINNER : 0;
}

/**
 * True bila pemain sudah boleh muncul di leaderboard.
 * Pemain tanpa pertandingan sama sekali dan level non-beginner belum tampil.
 */
export function isLeaderboardEligible(level, matchesPlayed) {
  const played = Number(matchesPlayed);
  const safePlayed = Number.isFinite(played) && played > 0 ? played : 0;
  return safePlayed >= leaderboardMinMatches(level);
}

/**
 * Ringkasan untuk UI: berapa pertandingan lagi yang dibutuhkan (0 = sudah lolos).
 */
export function leaderboardMatchesRemaining(level, matchesPlayed) {
  const played = Number(matchesPlayed);
  const safePlayed = Number.isFinite(played) && played > 0 ? played : 0;
  return Math.max(0, leaderboardMinMatches(level) - safePlayed);
}