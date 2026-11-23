// Helper "terakhir login" untuk direktori pemain (/players).
//
// Waktu login dicatat di `player_profiles.last_seen_at` lewat RPC
// `record_last_seen()` (migration 00035) — lihat catatan di migrasi tersebut
// kenapa `auth.users.last_sign_in_at` tidak bisa dipakai langsung.
//
// Modul ini dipakai halaman (/players) maupun kartu pemain supaya urutan dan
// labelnya selalu sama.

/** Label untuk pemain yang belum pernah tercatat login. */
export const LAST_SEEN_NEVER_LABEL = "Belum pernah login";

/** Batas atas label relatif; setelah itu tanggal lengkap yang ditampilkan. */
const RELATIVE_LIMIT_DAYS = 7;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Ubah nilai apa pun menjadi timestamp (ms), atau null bila tidak valid. */
export function lastSeenTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isFinite(time) ? time : null;
}

/**
 * Nilai pembanding untuk pengurutan naik: yang paling lama login di depan.
 * Nilai kosong/rusak dianggap paling lama (0), jadi pemain tanpa catatan login
 * selalu berada di bawah pemain yang pernah login.
 */
export function lastSeenSortValue(value) {
  return lastSeenTimestamp(value) ?? 0;
}

/**
 * Pembanding siap pakai: login terbaru di paling atas (desc), tanpa login di
 * paling bawah. `nameOf` dipakai sebagai penentu terakhir supaya urutan stabil.
 */
export function compareByLastSeenDesc(a, b, nameOf = () => "") {
  const diff = lastSeenSortValue(b?.lastSeenAt) - lastSeenSortValue(a?.lastSeenAt);
  if (diff !== 0) return diff;
  return String(nameOf(a) ?? "").localeCompare(String(nameOf(b) ?? ""));
}

/**
 * Label singkat bahasa Indonesia: "Baru saja", "12 menit lalu", "3 jam lalu",
 * "2 hari lalu", lalu tanggal lengkap untuk yang lebih lama.
 *
 * `now` bisa diisi untuk pengujian. Mengembalikan `LAST_SEEN_NEVER_LABEL` bila
 * tidak ada catatan login atau nilainya rusak.
 */
export function formatLastSeen(value, now = new Date()) {
  const time = lastSeenTimestamp(value);
  if (time === null) return LAST_SEEN_NEVER_LABEL;

  const nowTime = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowTime)) return LAST_SEEN_NEVER_LABEL;

  const elapsed = nowTime - time;
  if (elapsed < MINUTE) return "Baru saja";
  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return `${minutes} menit lalu`;
  }
  if (elapsed < DAY) {
    const hours = Math.floor(elapsed / HOUR);
    return `${hours} jam lalu`;
  }
  if (elapsed < RELATIVE_LIMIT_DAYS * DAY) {
    const days = Math.floor(elapsed / DAY);
    return `${days} hari lalu`;
  }

  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(time));
}

/**
 * Label lengkap untuk tooltip/judul: tanggal dan jam (zona Asia/Makassar).
 * Mengembalikan string kosong bila belum pernah login.
 */
export function formatLastSeenExact(value) {
  const time = lastSeenTimestamp(value);
  if (time === null) return "";
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Makassar",
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(time));
}