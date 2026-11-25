// Tingkatan rating MPR (MatchPoin Rating) yang dipakai di seluruh aplikasi.
//
//   Beginner      0    – 1099
//   Intermediate  1100 – 1599   ← rating awal semua pemain baru (1000)
//   Advanced      1600 – 1999
//   Expert        2000+
//
// Batas aslinya ada di satu tempat: MPR_CATEGORIES (src/lib/rating/mpr-core.mjs).
// File ini hanya menyusun ulang bentuknya untuk UI, supaya batas kategori tidak
// pernah berbeda antara mesin rating, direktori pemain, dan leaderboard.

import { MPR_CATEGORIES } from "./mpr-core.mjs";

export const RATING_TIERS = MPR_CATEGORIES.map((category) => ({
  level: category.key,
  label: category.label,
  min: category.minRating,
  max: category.maxRating,
}));

function formatRange(min, max) {
  return max === null ? `${min}+` : `${min} – ${max}`;
}

/** Rentang yang ditampilkan di UI, mis. "0 – 1099" atau "2000+". */
export const RATING_TIER_RANGES = Object.fromEntries(
  RATING_TIERS.map((tier) => [tier.level, formatRange(tier.min, tier.max)])
);

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
  return RATING_TIERS[RATING_TIERS.length - 1].level;
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
