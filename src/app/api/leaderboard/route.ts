import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { buildCommunityRankings } from "@/lib/community/community-ranking-core.mjs";
import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";
import { getActiveCities, getPublicPlayers } from "@/lib/supabase/public-player-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

interface CommunityRow {
  id: string;
  name: string;
  city: string | null;
}

interface MemberRow {
  community_id: string;
  user_id: string;
}

async function loadCommunityRankings() {
  const supabase = createAdminClient() ?? createPublicClient();
  if (!supabase) return [];

  try {
    const [{ data: communities, error }, { data: members }] = await Promise.all([
      supabase.from("communities").select("id, name, city").limit(200),
      supabase.from("community_members").select("community_id, user_id").limit(5000),
    ]);
    if (error || !communities) return [];

    const memberRows = (members ?? []) as MemberRow[];
    if (memberRows.length === 0) {
      return buildCommunityRankings(communities as CommunityRow[], [], []);
    }

    const userIds = Array.from(new Set(memberRows.map((row) => row.user_id)));
    const players: { user_id: string; current_rating: number | null; wins: number | null }[] = [];
    for (let index = 0; index < userIds.length; index += 500) {
      const chunk = userIds.slice(index, index + 500);
      const { data } = await supabase
        .from("public_players")
        .select("user_id, current_rating, wins")
        .in("user_id", chunk);
      if (data) players.push(...data);
    }

    return buildCommunityRankings(communities as CommunityRow[], memberRows, players);
  } catch (error) {
    logError("leaderboard.communities", error);
    return [];
  }
}

export async function GET() {
  try {
    const [players, cities, communities] = await Promise.all([
      getPublicPlayers(500, "rating"),
      getActiveCities(),
      loadCommunityRankings(),
    ]);
    const withSignedAvatars = await Promise.all(
      players.map(async (player) => ({
        ...player,
        avatarUrl: await signAvatarUrl(player.avatarUrl),
      }))
    );
    return NextResponse.json({ success: true, players: withSignedAvatars, cities, communities });
  } catch (error) {
    logError("leaderboard", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat leaderboard." },
      { status: 500 }
    );
  }
}