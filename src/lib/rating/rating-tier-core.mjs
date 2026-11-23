// Tingkatan rating DTR (0–1000+ skala DTR) yang dipakai di seluruh aplikasi.
//
//   Beginner      0    – 1499
//   Intermediate  1500 – 1999
//   Advanced      2000 – 2499
//   Expert        2500+
//
// Dipakai untuk filter di direktori pemain (/players), label tier di kartu
// pemain, dan ringkasan di beranda, supaya batasnya tidak pernah berbeda antar
// halaman.

export const RATING_TIERS = [
  { level: "beginner", label: "Beginner", min: 0, max: 1499 },
  { level: "intermediate", label: "Intermediate", min: 1500, max: 1999 },
  { level: "advanced", label: "Advanced", min: 2000, max: 2499 },
  { level: "expert", label: "Expert", min: 2500, max: null },
];

/** Rentang yang ditampilkan di UI, mis. "0 – 1499" atau "2500+". */
export const RATING_TIER_RANGES = {
  beginner: "0 – 1499",
  intermediate: "1500 – 1999",
  advanced: "2000 – 2499",
  expert: "2500+",
};

export const RATING_TIER_LEVELS = RATING_TIERS.map((tier) => tier.level);

function toRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) ? rating : 0;
}

/** Tingkat dari sebuah rating; nilai tidak valid dianggap beginner (0). */
export function ratingTierOf(rating) {
  const value = toRating(rating);
  for (const tier of RATING_TIERS) {
    if (tier.max === null || value <= tier.max) return tier.level;
  }
  return "expert";
}

/** Label tampilan, mis. "Advanced". */
export function ratingTierLabel(rating) {
  const level = ratingTierOf(rating);
  return RATING_TIERS.find((tier) => tier.level === level)?.label ?? "Beginner";
}

/**
 * True bila pemain masuk filter tingkat tertentu. `selected` bernilai "all"
 * atau kosong berarti tanpa filter. Pencocokan memakai RATING, bukan level
 * yang dipilih pemain saat mendaftar, sesuai aturan filter di /players.
 */
export function matchesRatingTier(selected, rating) {
  if (!selected || selected === "all") return true;
  return ratingTierOf(rating) === String(selected).trim().toLowerCase();
}

/** Opsi untuk <select>/tombol filter: Semua Level + 4 tingkat. */
export const RATING_TIER_OPTIONS = [
  { value: "all", label: "Semua Level" },
  ...RATING_TIERS.map((tier) => ({ value: tier.level, label: tier.label })),
];