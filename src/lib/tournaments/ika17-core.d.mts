export type TournamentCategory = "mens_singles" | "mens_doubles" | "womens_doubles";

/** Kelas liga yang dibentuk otomatis dari hasil pertandingan (MPR). */
export type TournamentClass = "beginner" | "intermediate";

export interface Ika17Category {
  id: TournamentCategory;
  label: string;
  shortLabel: string;
  doubles: boolean;
  genderRule: "male" | "female";
  slug: string;
  eligibilityLabel: string;
}

export const IKA17_LEAGUE_KEY: string;
export const IKA17_LEAGUE_NAME: string;
export const IKA17_SEASON: string;
export const IKA17_START_DATE: string;
export const IKA17_END_DATE: string;
export const IKA17_MAIN_EVENT_START: string;
export const IKA17_MAIN_EVENT_END: string;
/** Periode pendaftaran liga: 1 - 31 Desember 2026. */
export const IKA17_REGISTRATION_OPEN: string;
export const IKA17_REGISTRATION_DEADLINE: string;
/** Kuota setiap kategori: 24 peserta (single) atau 24 tim (ganda). */
/** null = tanpa batas kuota. */
export const IKA17_QUOTA: number | null;
/** Syarat lolos Main Event: minimal 17 pertandingan tercatat. */
export const IKA17_MIN_MATCHES: number;
/** Jumlah peserta tiap kelas yang lolos ke Main Event. */
export const IKA17_MAIN_EVENT_SLOTS: number;
export const IKA17_CLASSES: TournamentClass[];
export const IKA17_CLASS_LABELS: Record<TournamentClass, string>;
/** Batas MPR kelas intermediate; di bawahnya beginner. */
export const IKA17_INTERMEDIATE_MIN_RATING: number;
export const IKA17_ELIGIBILITY_STATEMENT: string;

export function ika17ClassOfRating(rating: number | string | null | undefined): TournamentClass;
export function ika17ClassLabel(rating: number | string | null | undefined): string;
export function ika17TeamRating(
  ratings: Array<number | string | null | undefined> | null | undefined
): number | null;
export function ika17EligibilityStatement(): string;

export const IKA17_CATEGORIES: Ika17Category[];

export function ika17Category(category: string | null | undefined): Ika17Category | null;
export function ika17CategoryLabel(category: string | null | undefined): string;
