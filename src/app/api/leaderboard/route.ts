import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { getActiveCities, getPublicPlayers } from "@/lib/supabase/public-player-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [players, cities] = await Promise.all([
      getPublicPlayers(500, "rating"),
      getActiveCities(),
    ]);
    const withSignedAvatars = await Promise.all(
      players.map(async (player) => ({
        ...player,
        avatarUrl: await signAvatarUrl(player.avatarUrl),
      }))
    );
    return NextResponse.json({ success: true, players: withSignedAvatars, cities });
  } catch (error) {
    logError("leaderboard", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat leaderboard." },
      { status: 500 }
    );
  }
}
