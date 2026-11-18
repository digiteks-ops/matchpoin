import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getPublicPlayer } from "@/lib/mysql/public-player-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)) {
    return NextResponse.json({ success: false, message: "ID pemain tidak valid." }, { status: 400 });
  }
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const player = await getPublicPlayer(connection, params.id);
    if (!player) {
      return NextResponse.json({ success: false, message: "Profil pemain tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      player: { ...player, avatarUrl: await signAvatarUrl(player.avatarUrl) },
    });
  } catch (error) {
    logError("mysql.player.detail", error, { playerId: params.id });
    return NextResponse.json(
      { success: false, message: "Gagal memuat profil pemain." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
