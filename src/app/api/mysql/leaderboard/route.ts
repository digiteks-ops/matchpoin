import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getActiveCities, getPublicPlayers } from "@/lib/mysql/public-player-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const [players, cities] = await Promise.all([
      getPublicPlayers(connection, 500, "rating"),
      getActiveCities(connection),
    ]);
    const withSignedAvatars = await Promise.all(
      players.map(async (player) => ({
        ...player,
        avatarUrl: await signAvatarUrl(player.avatarUrl),
      }))
    );
    return NextResponse.json({ success: true, players: withSignedAvatars, cities });
  } catch (error) {
    logError("mysql.leaderboard", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat leaderboard." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
