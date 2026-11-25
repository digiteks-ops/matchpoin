export const ADMIN_WHATSAPP_NUMBER: string;
export const LEAGUE_WHATSAPP_GROUP_URL: string;

/** `0812-3456-7890` -> `6281234567890`; kosong bila nomor tidak sah. */
export function normalizeWhatsappNumber(input: string | null | undefined): string;
export function isValidWhatsappNumber(input: string | null | undefined): boolean;
/** Versi longgar untuk kontak resmi (nomor non-seluler), tetap berawalan 62. */
export function normalizeWhatsappContact(input: string | null | undefined): string;

/** `https://wa.me/<nomor>` dengan pesan opsional. Kosong bila nomor tidak sah. */
export function whatsappChatUrl(number: string | null | undefined, message?: string): string;
export function whatsappContactUrl(number: string | null | undefined, message?: string): string;
export function adminWhatsappUrl(message?: string): string;

export interface ChallengeMessageInput {
  hostName?: string | null;
  matchTitle?: string | null;
  matchDate?: string | null;
  startTime?: string | null;
  courtName?: string | null;
  categoryLabel?: string | null;
  appUrl?: string | null;
  matchId?: string | null;
  groupUrl?: string | null;
}
export function buildChallengeMessage(input: ChallengeMessageInput): string;

export interface LeagueWelcomeMessageInput {
  playerName?: string | null;
  categoryLabel?: string | null;
  groupUrl?: string | null;
}
export function buildLeagueWelcomeMessage(input: LeagueWelcomeMessageInput): string;