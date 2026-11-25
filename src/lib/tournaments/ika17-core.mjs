// Kategori Liga Tennis IKA17 — sumber tunggal (dipakai UI, API, dan test).
//
// Empat kategori final:
//   1. Single Man
//   2. Double Man
//   3. Double Woman
//   4. Double Mix
//
// Pemain TIDAK memilih level (beginner/intermediate) saat mendaftar. Klasifikasi
// ditentukan otomatis dari hasil pertandingan liga:
//   beginner     : MPR < 1100
//   intermediate : MPR >= 1100
// Untuk kategori ganda, MPR tim adalah rata-rata MPR kedua pemain. Delapan besar
// beginner dan delapan besar intermediate setiap kategori lolos ke Main Event.
//
// Semua kategori mensyaratkan BELUM pernah ikut PORDA/PORPROV/PON.

import { MPR_CATEGORIES } from "../rating/mpr-core.mjs";

export const IKA17_LEAGUE_KEY = "ika17-2027";
export const IKA17_LEAGUE_NAME = "Liga Tennis IKA17";
export const IKA17_SEASON = "Musim 1 2027";
export const IKA17_START_DATE = "2027-01-01";
export const IKA17_END_DATE = "2027-03-31";
export const IKA17_MAIN_EVENT_START = "2027-04-03";
export const IKA17_MAIN_EVENT_END = "2027-04-04";
/** Periode pendaftaran liga: 1 - 31 Desember 2026. */
export const IKA17_REGISTRATION_OPEN = "2026-12-01";
export const IKA17_REGISTRATION_DEADLINE = "2026-12-31";
/** Kuota setiap kategori: 24 peserta (single) atau 24 tim (ganda). */
export const IKA17_QUOTA = 24;
/** Syarat lolos Main Event: minimal 17 pertandingan tercatat. */
export const IKA17_MIN_MATCHES = 17;
/** Jumlah peserta tiap kelas (beginner / intermediate) yang lolos ke Main Event. */
export const IKA17_MAIN_EVENT_SLOTS = 8;

/**
 * Dua kelas liga yang dibentuk otomatis dari hasil pertandingan. Pemain tidak
 * memilih kelas ini saat mendaftar.
 */
export const IKA17_CLASSES = ["beginner", "intermediate"];

export const IKA17_CLASS_LABELS = {
  beginner: "Beginner",
  intermediate: "Intermediate",
};

/** Batas MPR kelas intermediate; di bawahnya beginner.
 *  Diambil dari batas tier Intermediate MPR supaya kelas liga dan tier MPR
 *  tidak pernah berbeda angka. */
export const IKA17_INTERMEDIATE_MIN_RATING = MPR_CATEGORIES.find(
  (category) => category.key === "intermediate"
).minRating;

/** Syarat keikutsertaan liga IKA17: BELUM pernah tampil di PORDA/PORPROV/PON. */
export const IKA17_ELIGIBILITY_STATEMENT = "Belum pernah mengikuti PORDA, PORPROV, atau PON.";

/**
 * Kelas liga dari MPR. Nilai tidak valid dianggap beginner agar pemain tanpa
 * rating tetap tampil di klasemen.
 */
export function ika17ClassOfRating(rating) {
  const value = Number(rating);
  if (!Number.isFinite(value)) return "beginner";
  return value >= IKA17_INTERMEDIATE_MIN_RATING ? "intermediate" : "beginner";
}

export function ika17ClassLabel(rating) {
  return IKA17_CLASS_LABELS[ika17ClassOfRating(rating)] ?? "Beginner";
}

/**
 * MPR tim untuk klasemen: single memakai MPR pemain, ganda memakai rata-rata
 * MPR kedua pemain. Pemain tanpa rating diabaikan; bila tidak ada rating sama
 * sekali hasilnya null.
 */
export function ika17TeamRating(ratings) {
  const values = (Array.isArray(ratings) ? ratings : [])
    // Buang nilai kosong SEBELUM Number(): Number(null) adalah 0, yang akan
    // menyeret rata-rata tim ke bawah seolah pemainnya berating 0.
    .filter((value) => value !== null && value !== undefined && value !== "")
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (values.length === 0) return null;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Pernyataan yang harus disetujui pemain sebelum mendaftar. */
export function ika17EligibilityStatement() {
  return IKA17_ELIGIBILITY_STATEMENT;
}

export const IKA17_CATEGORIES = [
  {
    id: "mens_singles",
    label: "Single Man",
    shortLabel: "Tunggal Putra",
    doubles: false,
    genderRule: "male",
    slug: "league-q1-2027-mens-singles",
    eligibilityLabel: "Khusus pemain putra.",
  },
  {
    id: "mens_doubles",
    label: "Double Man",
    shortLabel: "Ganda Putra",
    doubles: true,
    genderRule: "male",
    slug: "league-q1-2027-mens-doubles",
    eligibilityLabel: "Khusus pemain putra, satu tim 2 pemain.",
  },
  {
    id: "womens_doubles",
    label: "Double Woman",
    shortLabel: "Ganda Putri",
    doubles: true,
    genderRule: "female",
    slug: "league-q1-2027-womens-doubles",
    eligibilityLabel: "Khusus pemain putri, satu tim 2 pemain.",
  },
  {
    id: "mixed_doubles",
    label: "Double Mix",
    shortLabel: "Ganda Campuran",
    doubles: true,
    genderRule: "mixed",
    slug: "league-q1-2027-mixed-doubles",
    eligibilityLabel: "Satu tim terdiri dari 1 pemain putra dan 1 pemain putri.",
  },
];

export function ika17Category(category) {
  return IKA17_CATEGORIES.find((entry) => entry.id === category) ?? null;
}

export function ika17CategoryLabel(category) {
  return ika17Category(category)?.label ?? category ?? "Kategori";
}
