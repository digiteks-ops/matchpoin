/**
 * Merapikan URL Supabase Storage agar bisa dipakai `<Image>` Next.js.
 *
 * Versi Supabase JS tertentu mengembalikan `getPublicUrl()` dengan garis miring
 * ganda (`https://proyek.supabase.co//storage/v1/...`). Browser masih bisa
 * memuatnya, tetapi mesin optimasi gambar Next.js menolaknya dengan
 * `400 INVALID_IMAGE_OPTIMIZE_REQUEST`, sehingga pratinjau foto bukti tampil
 * kosong. Semua garis miring berlebih setelah host dirapikan di sini.
 *
 * Modul murni (bukan TypeScript) supaya bisa diuji lewat `node --test`.
 */
export function normalizeImageUrl(url) {
  if (typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  // Hanya URL absolut yang perlu dirapikan; data: dan blob: dibiarkan apa adanya.
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;
  const match = /^(https?:\/\/[^/]+)(\/.*)?$/i.exec(trimmed);
  if (!match) return trimmed;
  const origin = match[1];
  const path = (match[2] ?? "").replace(/\/{2,}/g, "/");
  return `${origin}${path}`;
}