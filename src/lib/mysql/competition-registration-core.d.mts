export interface LeagueRegistrationTournament {
  name?: string | null;
  category?: string | null;
  status?: string | null;
  max_participants?: number | null;
  registration_deadline?: string | null;
}

export type ParsedRegistrationPayload =
  | { ok: true; leagueId: string; partnerUserId: string | null }
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
  today?: string;
}

export function normalizeId(value: unknown): string;
export function isValidId(value: unknown): boolean;
export function inferCategory(name: string): string;
export function isDoubles(category: string): boolean;
export function parseRegistrationPayload(payload: unknown): ParsedRegistrationPayload;
export function evaluateLeagueRegistration(
  input: LeagueRegistrationEvaluationInput
): LeagueRegistrationEvaluation;
