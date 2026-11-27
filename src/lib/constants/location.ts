// Lokasi bawaan MATCHPOIN: Sulawesi Selatan, Kota Makassar.
//
// Dipakai profil, filter pemain/leaderboard, dan form pembuatan pertandingan
// supaya pengguna di Makassar tidak perlu memilih ulang provinsi/kota setiap
// kali. Nilai ini hanya titik awal; pengguna tetap bisa memilih lokasi lain.
export const DEFAULT_PROVINCE = "Sulawesi Selatan";
export const DEFAULT_CITY_NAME = "Makassar";

function normalizeCityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(kota|kabupaten|kab\.)\s+/, "")
    .trim();
}

/**
 * Mencari kota bawaan (Makassar) pada daftar kota yang dimuat dari database.
 * Mengembalikan `undefined` bila tidak ada, sehingga pemanggil bisa jatuh ke
 * perilaku lama (mis. "Semua Kota") tanpa menampilkan pilihan yang salah.
 */
export function findDefaultCity<T extends { id: string; name: string; province?: string | null }>(
  cities: readonly T[] | null | undefined
): T | undefined {
  if (!cities) return undefined;
  const target = normalizeCityName(DEFAULT_CITY_NAME);
  return cities.find(
    (city) =>
      (!city.province || city.province === DEFAULT_PROVINCE) &&
      normalizeCityName(city.name) === target
  );
}
