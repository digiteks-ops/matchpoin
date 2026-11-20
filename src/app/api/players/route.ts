import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import {
  getActiveCities,
  getPublicPlayers,
} from "@/lib/supabase/public-player-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const requestedLimit = Number(query.get("limit") ?? 100);
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 500) {
    return NextResponse.json(
      { success: false, message: "Batas daftar pemain tidak valid." },
      { status: 400 }
    );
  }
  const order = query.get("order") === "rating" ? "rating" : "name";

  try {
    const [players, cities] = await Promise.all([
      getPublicPlayers(requestedLimit, order),
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
    logError("players.list", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat daftar pemain." },
      { status: 500 }
    );
  }
}
