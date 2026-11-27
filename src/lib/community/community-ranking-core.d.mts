export interface CommunityRankingInput {
  id: string;
  name: string;
  city?: string | null;
}

export interface CommunityMemberInput {
  community_id: string;
  user_id: string;
}

export interface CommunityPlayerInput {
  user_id: string;
  current_rating?: number | string | null;
  wins?: number | null;
}

export interface CommunityRanking {
  id: string;
  name: string;
  city: string | null;
  memberCount: number;
  totalWins: number;
  averageRating: number;
}

export function buildCommunityRankings(
  communities: CommunityRankingInput[],
  members: CommunityMemberInput[],
  players: CommunityPlayerInput[]
): CommunityRanking[];