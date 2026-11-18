import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getActiveCities, getPublicPlayers } from "@/lib/mysql/public-player-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const requestedLimit = Number(query.get("limit") ?? 100);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
    return NextResponse.json({ success: false, message: "Batas daftar pemain tidak valid." }, { status: 400 });
  }
  const order = query.get("order") === "rating" ? "rating" : "name";
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const [players, cities] = await Promise.all([
      getPublicPlayers(connection, requestedLimit, order),
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
    logError("mysql.players.list", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat daftar pemain." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
