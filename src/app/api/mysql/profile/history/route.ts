import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlPlayerStats } from "@/lib/mysql/player-history-service";
import { signAssetReadUrls } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Harus login untuk melihat riwayat." },
      { status: 401 }
    );
  }
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const stats = await getMySqlPlayerStats(connection, userId);
    const recentMatches = await Promise.all(
      stats.recentMatches.map(async (match) => ({
        ...match,
        photoUrls: await signAssetReadUrls(match.photoUrls),
      }))
    );
    return NextResponse.json({ success: true, stats: { ...stats, recentMatches } });
  } catch (error) {
    logError("mysql.profile.history", error, { userId });
    return NextResponse.json(
      { success: false, message: "Gagal memuat riwayat." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
