// Kategori Liga Tennis IKA17 — sumber tunggal (dipakai UI, API, dan test).
// Daftar final:
//   1. Single Man Beginner
//   2. Double Man Beginner–Intermediate
//   3. Double Woman Beginner
//   4. Double Woman Beginner–Intermediate
//   5. Double Mix Beginner
//
// Syarat level:
//   beginner     : maksimal 2 tahun bermain
//   intermediate : lebih dari 2 tahun bermain
//   advanced     : pernah mengikuti PORDA, PORPROV, PON
// Semua kategori mensyaratkan BELUM pernah ikut PORDA/PORPROV/PON, jadi
// `advanced` tidak pernah masuk `allowedLevels`.

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
export const IKA17_QUOTA = 24;
export const IKA17_MIN_MATCHES = 17;
/** Jumlah peserta tiap kategori yang lolos ke Main Event. */
export const IKA17_MAIN_EVENT_SLOTS = 8;

// Tiga tingkat pengalaman:
//   beginner     : maksimal 2 tahun bermain
//   intermediate : lebih dari 2 tahun bermain
//   advanced     : pernah mengikuti PORDA, PORPROV, atau PON
//
// `advanced` adalah kebalikan dari dua tingkat lain: justru pemain yang PERNAH
// tampil di PORDA/PORPROV/PON. Karena liga IKA17 mensyaratkan belum pernah
// ikut ajang tersebut, tingkat ini TIDAK pernah masuk `allowedLevels`.
export const TOURNAMENT_LEVELS = ["beginner", "intermediate", "advanced"];

export const TOURNAMENT_LEVEL_LABELS = {
  beginner: "Beginner: maksimal 2 tahun bermain",
  intermediate: "Intermediate: lebih dari 2 tahun bermain",
  advanced: "Advanced: pernah mengikuti PORDA, PORPROV, PON",
};

export const TOURNAMENT_LEVEL_REQUIREMENTS = {
  beginner: "Maksimal 2 tahun bermain tenis.",
  intermediate: "Lebih dari 2 tahun bermain tenis.",
  advanced: "Pernah mengikuti PORDA, PORPROV, atau PON.",
};

/**
 * Syarat keikutsertaan liga IKA17 untuk beginner & intermediate: BELUM pernah
 * tampil di PORDA/PORPROV/PON.
 */
export const IKA17_ELIGIBILITY_STATEMENT = "Belum pernah mengikuti PORDA, PORPROV, atau PON.";

/** Kebalikannya, untuk tingkat advanced. */
export const IKA17_ADVANCED_ELIGIBILITY_STATEMENT =
  "Pernah mengikuti PORDA, PORPROV, atau PON.";

/** True untuk tingkat yang justru mensyaratkan sudah tampil di PORDA/PORPROV/PON. */
export function ika17RequiresPordaParticipation(level) {
  return level === "advanced";
}

/** Pernyataan yang harus disetujui pemain untuk tingkat yang dipilihnya. */
export function ika17EligibilityStatement(level) {
  return ika17RequiresPordaParticipation(level)
    ? IKA17_ADVANCED_ELIGIBILITY_STATEMENT
    : IKA17_ELIGIBILITY_STATEMENT;
}

export const IKA17_CATEGORIES = [
  {
    id: "mens_singles",
    label: "Single Man Beginner",
    shortLabel: "Tunggal Putra Beginner",
    doubles: false,
    genderRule: "male",
    slug: "league-q1-2027-mens-singles",
    allowedLevels: ["beginner"],
    eligibilityLabel: "Khusus beginner: maksimal 2 tahun bermain.",
  },
  {
    id: "mens_doubles",
    label: "Double Man Beginner–Intermediate",
    shortLabel: "Ganda Putra Beginner–Intermediate",
    doubles: true,
    genderRule: "male",
    slug: "league-q1-2027-mens-doubles",
    allowedLevels: ["beginner", "intermediate"],
    eligibilityLabel: "Beginner (maksimal 2 tahun) atau intermediate (lebih dari 2 tahun).",
  },
  {
    id: "womens_doubles",
    label: "Double Woman Beginner",
    shortLabel: "Ganda Putri Beginner",
    doubles: true,
    genderRule: "female",
    slug: "league-q1-2027-womens-doubles",
    allowedLevels: ["beginner"],
    eligibilityLabel: "Khusus beginner: maksimal 2 tahun bermain.",
  },
  {
    id: "womens_doubles_intermediate",
    label: "Double Woman Beginner–Intermediate",
    shortLabel: "Ganda Putri Beginner–Intermediate",
    doubles: true,
    genderRule: "female",
    slug: "league-q1-2027-womens-doubles-intermediate",
    allowedLevels: ["beginner", "intermediate"],
    eligibilityLabel: "Beginner (maksimal 2 tahun) atau intermediate (lebih dari 2 tahun).",
  },
  {
    id: "mixed_doubles",
    label: "Double Mix Beginner",
    shortLabel: "Ganda Campuran Beginner",
    doubles: true,
    genderRule: "mixed",
    slug: "league-q1-2027-mixed-doubles",
    allowedLevels: ["beginner"],
    eligibilityLabel: "Khusus beginner: maksimal 2 tahun bermain.",
  },
];

export function ika17Category(category) {
  return IKA17_CATEGORIES.find((entry) => entry.id === category) ?? null;
}

export function ika17CategoryLabel(category) {
  return ika17Category(category)?.label ?? category ?? "Kategori";
}

export function ika17AllowedLevels(category) {
  return ika17Category(category)?.allowedLevels ?? ["beginner", "intermediate"];
}

export function ika17CategoryAllowsLevel(category, level) {
  return ika17AllowedLevels(category).includes(level);
}

/** True when the category only accepts beginner (single man / putri / mix). */
export function ika17RequiresBeginner(category) {
  const levels = ika17AllowedLevels(category);
  return levels.length === 1 && levels[0] === "beginner";
}