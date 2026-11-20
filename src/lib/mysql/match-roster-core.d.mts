import type { MatchCategory, MatchType } from "@/lib/matches/constants";

export type MatchRosterRole =
  | "organizer"
  | "host_partner"
  | "opponent"
  | "opponent_partner"
  | "team1_captain"
  | "team1_partner"
  | "team2_captain"
  | "team2_partner";

export interface MatchRosterParticipant {
  userId: string;
  team: 1 | 2;
  isOrganizer: boolean;
  role: MatchRosterRole;
}

export interface MatchRosterInput {
  category: MatchCategory | string;
  matchType?: MatchType | string | null;
  organizerId: string;
  partnerUserId?: string | null;
  opponentUserId?: string | null;
  opponentPartnerUserId?: string | null;
}

export interface MatchRoster {
  category: MatchCategory;
  matchType: MatchType;
  isPrivate: boolean;
  maxPlayers: number;
  currentPlayers: number;
  status: "open" | "full";
  participants: MatchRosterParticipant[];
  playerIdsToVerify: string[];
}

export class MatchRosterError extends Error {}

export function isDoublesCategory(category: unknown): boolean;
export function logicalRosterSize(category: MatchCategory | string): number;
export function buildMatchRoster(input: MatchRosterInput): MatchRoster;

export interface ExplicitTeamRosterInput {
  category: MatchCategory | string;
  team1UserIds: string[];
  team2UserIds: string[];
}

export function buildExplicitTeamRoster(input: ExplicitTeamRosterInput): MatchRoster;
