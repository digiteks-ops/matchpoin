export type MatchCategory =
  | "mens_singles"
  | "womens_singles"
  | "mens_doubles"
  | "womens_doubles"
  | "mixed_doubles";

export type UmpirePreference = "dengan_wasit" | "tanpa_wasit";

export type MatchStatus = "open" | "full" | "in_progress" | "completed" | "cancelled";

export interface CreateOpenMatchInput {
  title: string;
  description?: string;
  courtId?: string | null;
  courtName?: string;
  province?: string;
  cityName?: string;
  matchDate: string; // YYYY-MM-DD
  startTime: string; // HH:mm:ss
  durationMinutes?: number;
  category: MatchCategory;
  umpireOption: UmpirePreference;
  umpireName?: string;
  minRating?: number;
  maxRating?: number;
  level?: string;
  reclubLink?: string;
  raceToScore?: number;
  courtSwitchAt?: number;
}

export interface MatchParticipantInfo {
  id: string;
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  gender: string | null;
  rating: number;
  isOrganizer: boolean;
  status: "confirmed" | "pending" | "rejected" | "invited";
  team?: 1 | 2;
}

export interface OpenMatchDetail {
  id: string;
  title: string;
  description: string | null;
  courtId: string | null;
  courtName: string;
  courtAddress: string;
  province?: string | null;
  cityName?: string | null;
  organizerId: string;
  organizerName: string;
  matchDate: string;
  startTime: string;
  durationMinutes: number;
  category: MatchCategory;
  categoryLabel: string;
  umpireOption: UmpirePreference;
  umpireName: string | null;
  minRating: number;
  maxRating: number;
  maxPlayers: number;
  currentPlayers: number;
  availableSlots: number;
  status: MatchStatus;
  participants: MatchParticipantInfo[];
  pendingRequests: MatchParticipantInfo[];
  invitedPlayers: MatchParticipantInfo[];
  createdAt: string;
  raceToScore: number;
  courtSwitchAt: number;
  courtSwapped: boolean;
}

export const MATCH_CATEGORY_LABELS: Record<MatchCategory, string> = {
  mens_singles: "Tunggal Putra (Men's Singles)",
  womens_singles: "Tunggal Putri (Women's Singles)",
  mens_doubles: "Ganda Putra (Men's Doubles)",
  womens_doubles: "Ganda Putri (Women's Doubles)",
  mixed_doubles: "Ganda Campuran (Mixed Doubles)",
};

export const VALID_CATEGORIES = Object.keys(MATCH_CATEGORY_LABELS) as MatchCategory[];

/**
 * Number of players that actually play the match.
 */
export function logicalMaxPlayers(category: MatchCategory): number {
  return category.includes("singles") ? 2 : 4;
}

/**
 * Row capacity stored on matches.max_players.
 *
 * The database trigger increments matches.current_players for every
 * match_participants row, including pending join requests and invites, and a
 * check constraint keeps current_players <= max_players. Reserving headroom for
 * those rows keeps a single pending request from filling a singles match.
 */
export function maxParticipantRows(category: MatchCategory): number {
  return logicalMaxPlayers(category) + 2;
}

/**
 * Validates mixed doubles composition: each team must have at most 1 male and 1 female.
 */
export function validateMixedDoublesTeam(
  teamMembers: { gender: string | null | undefined }[]
): { valid: boolean; message?: string } {
  const males = teamMembers.filter((m) => m.gender === "male").length;
  const females = teamMembers.filter((m) => m.gender === "female").length;

  if (males > 1) {
    return { valid: false, message: "Tim Ganda Campuran maksimal memiliki 1 pemain putra." };
  }
  if (females > 1) {
    return { valid: false, message: "Tim Ganda Campuran maksimal memiliki 1 pemain putri." };
  }
  return { valid: true };
}