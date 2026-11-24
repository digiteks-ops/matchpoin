// Kategori Liga Tennis IKA17 untuk kode aplikasi. Data dan aturannya ada di
// `ika17-core.mjs` supaya UI, API, dan test membaca satu sumber yang sama.
export {
  IKA17_CATEGORIES,
  IKA17_ADVANCED_ELIGIBILITY_STATEMENT,
  IKA17_ELIGIBILITY_STATEMENT,
  IKA17_END_DATE,
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
  TOURNAMENT_LEVELS,
  TOURNAMENT_LEVEL_LABELS,
  TOURNAMENT_LEVEL_REQUIREMENTS,
  ika17AllowedLevels,
  ika17Category,
  ika17CategoryAllowsLevel,
  ika17CategoryLabel,
  ika17EligibilityStatement,
  ika17RequiresBeginner,
  ika17RequiresPordaParticipation,
} from "./ika17-core.mjs";

export type TournamentCategory =
  | "mens_singles"
  | "mens_doubles"
  | "womens_doubles"
  | "womens_doubles_intermediate"
  | "mixed_doubles";

/** Level yang bisa dipakai saat mendaftar liga. */
export type TournamentLevel = "beginner" | "intermediate";

/**
 * Tingkat pengalaman yang dikenal aplikasi. `advanced` hanya untuk keterangan:
 * pesertanya justru yang PERNAH ikut PORDA/PORPROV/PON, sehingga tidak pernah
 * lolos syarat pendaftaran liga IKA17.
 */
export type TournamentExperienceLevel = TournamentLevel | "advanced";

export type { Ika17Category } from "./ika17-core.mjs";