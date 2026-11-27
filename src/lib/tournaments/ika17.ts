// Kategori Liga Tennis IKA17 untuk kode aplikasi. Data dan aturannya ada di
// `ika17-core.mjs` supaya UI, API, dan test membaca satu sumber yang sama.
export {
  IKA17_CATEGORIES,
  IKA17_CLASSES,
  IKA17_CLASS_LABELS,
  IKA17_ELIGIBILITY_STATEMENT,
  IKA17_END_DATE,
  IKA17_INTERMEDIATE_MIN_RATING,
  IKA17_LEAGUE_KEY,
  IKA17_LEAGUE_NAME,
  IKA17_MAIN_EVENT_END,
  IKA17_MAIN_EVENT_START,
  IKA17_MIN_MATCHES,
  IKA17_MAIN_EVENT_SLOTS,
  IKA17_QUOTA,
  IKA17_REGISTRATION_OPEN,
  IKA17_REGISTRATION_DEADLINE,
  IKA17_SEASON,
  IKA17_START_DATE,
  ika17Category,
  ika17CategoryLabel,
  ika17ClassLabel,
  ika17ClassOfRating,
  ika17EligibilityStatement,
  ika17TeamRating,
} from "./ika17-core.mjs";

export type TournamentCategory = "mens_singles" | "mens_doubles" | "womens_doubles";

/** Kelas liga yang dibentuk otomatis dari hasil pertandingan (MPR). */
export type TournamentClass = "beginner" | "intermediate";

export type { Ika17Category } from "./ika17-core.mjs";
