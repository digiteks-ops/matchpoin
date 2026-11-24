// Alur OAuth dan pemulihan kata sandi memakai satu callback yang sama:
// /auth/callback?next=<path>. Route itu menukar `code` menjadi sesi lalu
// meneruskan ke `next`.
//
// Untuk reset kata sandi, `next=/reset-password` sehingga setelah tautan email
// dibuka pemain langsung sampai di formulir ganti sandi DENGAN sesi aktif.
// Sebelumnya resetPasswordForEmail memakai redirectTo=/reset-password langsung,
// sehingga `code` tidak pernah ditukar dan halaman ganti sandi tidak muncul.

/** Path formulir ganti kata sandi. */
export const PASSWORD_RECOVERY_PATH = "/reset-password";

/**
 * Membangun URL callback yang aman: hanya menerima path internal.
 */
export function buildAuthCallbackUrl(origin, next = "/dashboard") {
  const safeNext =
    typeof next === "string" && next.startsWith("/") && !next.startsWith("//")
      ? next
      : "/dashboard";
  return `${String(origin).replace(/\/+$/, "")}/auth/callback?next=${encodeURIComponent(
    safeNext
  )}`;
}

/** Path tujuan setelah pemulihan kata sandi selesai. */
export function passwordRecoveryNext() {
  return PASSWORD_RECOVERY_PATH;
}