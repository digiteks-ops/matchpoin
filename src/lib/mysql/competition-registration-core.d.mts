export interface LeagueRegistrationTournament {
  name?: string | null;
  category?: string | null;
  status?: string | null;
  max_participants?: number | null;
  registration_deadline?: string | null;
  registration_open_at?: string | null;
}

export type ParsedRegistrationPayload =
  | {
      ok: true;
      leagueId: string;
      partnerUserId: string | null;
      eligibilityConfirmed: true;
      /** Sudah dinormalkan ke `628xxxxxxxxx`. */
      whatsappNumber: string;
    }
  | { ok: false; message: string };

export type LeagueRegistrationEvaluation =
  | { ok: true; category: string; doubles: boolean }
  | { ok: false; message: string };

export interface LeagueRegistrationEvaluationInput {
  tournament: LeagueRegistrationTournament | null;
  userId: string;
  partnerUserId: string | null;
  registeredUserIds?: string[];
  entryCount?: number;
  userGender?: string | null;
  partnerGender?: string | null;
  userExists?: boolean;
  partnerExists?: boolean;
  playingExperience?: "beginner" | "intermediate" | null;
  eligibilityConfirmed?: boolean;
  today?: string;
}

export const BEGINNER_ONLY_CATEGORIES: string[];

export function normalizeId(value: unknown): string;
/** `0812-3456-7890` -> `6281234567890`; kosong bila tidak sah. */
export function normalizeWhatsapp(input: unknown): string;
export function isValidWhatsapp(input: unknown): boolean;
export function isValidId(value: unknown): boolean;
export function inferCategory(name: string): string;
export function isDoubles(category: string): boolean;
export function isBeginnerOnlyCategory(category: string): boolean;
/** "2026-12-01" -> "1 Desember 2026". */
export function formatRegistrationOpen(isoDate: string | null | undefined): string;
export function parseRegistrationPayload(payload: unknown): ParsedRegistrationPayload;
export function evaluateLeagueRegistration(
  input: LeagueRegistrationEvaluationInput
): LeagueRegistrationEvaluation;

/** True bila evaluation gagal; menyempitkan tipe untuk pemakaian di route. */
export function isLeagueRegistrationError(
  evaluation: LeagueRegistrationEvaluation
): evaluation is { ok: false; message: string };
