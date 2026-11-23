import { createClient } from "@/lib/supabase/client";

/**
 * Mencatat waktu login terakhir pemain.
 *
 * Menu /players menampilkan "terakhir login", dan nilainya diambil dari
 * `player_profiles.last_seen_at` yang diisi lewat RPC `record_last_seen()`
 * (migration 00035). `auth.users.last_sign_in_at` tidak bisa dipakai karena
 * kolom itu tidak terbaca melalui REST API untuk pengguna lain.
 *
 * Pencatatan dari browser di-throttle supaya satu sesi tidak menulis ke
 * database di setiap navigasi. Login dan callback OAuth memakai `force` agar
 * waktunya selalu segar.
 */

/** Jeda minimum antar penulisan untuk pemain yang sama (30 menit). */
export const LAST_SEEN_THROTTLE_MS = 30 * 60 * 1000;

const STORAGE_PREFIX = "matchpoin:last-seen:";

function readThrottleMark(userId: string): number {
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + userId);
    const value = Number(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    // Mode privat / storage diblokir: jangan sampai menghalangi pencatatan.
    return 0;
  }
}

function writeThrottleMark(userId: string, time: number) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + userId, String(time));
  } catch {
    // Diabaikan: throttle hanya optimisasi.
  }
}

/**
 * Catat login sekarang (best effort).
 *
 * Kegagalan tidak pernah dilempar ke pemanggil: pencatatan aktivitas tidak
 * boleh menggagalkan proses login. RPC juga bisa belum ada bila migration 00035
 * belum dijalankan, dan itu bukan alasan untuk memblokir pemain.
 */
export async function recordLastSeen(
  userId: string,
  options?: { force?: boolean }
): Promise<void> {
  if (typeof window === "undefined" || !userId) return;

  const now = Date.now();
  if (!options?.force) {
    const last = readThrottleMark(userId);
    if (last > 0 && now - last < LAST_SEEN_THROTTLE_MS) return;
  }

  // Tandai lebih dulu agar pemanggilan ganda (StrictMode, dua tab) tidak
  // menembak RPC berkali-kali di saat yang sama.
  writeThrottleMark(userId, now);

  try {
    const supabase = createClient();
    const { error } = await supabase.rpc("record_last_seen");
    if (error) {
      console.warn("Gagal mencatat waktu login:", error.message);
    }
  } catch (err) {
    console.warn("Gagal mencatat waktu login:", err);
  }
}