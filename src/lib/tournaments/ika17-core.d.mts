export interface Ika17Category {
  id: TournamentCategory;
  label: string;
  shortLabel: string;
  doubles: boolean;
  genderRule: "male" | "female" | "mixed";
  slug: string;
  allowedLevels: TournamentLevel[];
  eligibilityLabel: string;
}

export type TournamentCategory =
  | "mens_singles"
  | "mens_doubles"
  | "womens_doubles"
  | "womens_doubles_intermediate"
  | "mixed_doubles";

/** Level yang boleh dipakai saat mendaftar liga ini. */
export type TournamentLevel = "beginner" | "intermediate";

/**
 * Semua tingkat yang dikenal aplikasi. `advanced` hanya untuk keterangan dan
 * profil: pesertanya justru yang PERNAH mengikuti PORDA/PORPROV/PON, sehingga
 * tidak memenuhi syarat liga IKA17 dan tidak pernah masuk `allowedLevels`.
 */
export type TournamentExperienceLevel = TournamentLevel | "advanced";

export interface ExperienceLevelOption {
  value: TournamentExperienceLevel;
  label: string;
  hint: string;
}

export const IKA17_LEAGUE_KEY: string;
export const IKA17_LEAGUE_NAME: string;
export const IKA17_SEASON: string;
export const IKA17_START_DATE: string;
export const IKA17_END_DATE: string;
export const IKA17_MAIN_EVENT_START: string;
export const IKA17_MAIN_EVENT_END: string;
export const IKA17_REGISTRATION_DEADLINE: string;
export const IKA17_QUOTA: number;
export const IKA17_MIN_MATCHES: number;
/** Jumlah peserta tiap kategori yang lolos ke Main Event. */
export const IKA17_MAIN_EVENT_SLOTS: number;
export const IKA17_ELIGIBILITY_STATEMENT: string;
export const TOURNAMENT_LEVELS: TournamentExperienceLevel[];
export const TOURNAMENT_LEVEL_LABELS: Record<TournamentExperienceLevel, string>;
export const TOURNAMENT_LEVEL_REQUIREMENTS: Record<TournamentExperienceLevel, string>;
export const IKA17_ADVANCED_ELIGIBILITY_STATEMENT: string;

export function ika17RequiresPordaParticipation(
  level: string | null | undefined
): boolean;
export function ika17EligibilityStatement(level: string | null | undefined): string;

export const IKA17_CATEGORIES: Ika17Category[];

export function ika17Category(category: string | null | undefined): Ika17Category | null;
export function ika17CategoryLabel(category: string | null | undefined): string;
export function ika17CategoryAllowsLevel(
  category: string | null | undefined,
  level: TournamentLevel
): boolean;
export function ika17AllowedLevels(category: string | null | undefined): TournamentLevel[];
export function ika17RequiresBeginner(category: string | null | undefined): boolean;