import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getLeagueOverview } from "@/lib/mysql/competition-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

const CATEGORIES = new Set([
  "mens_singles",
  "womens_singles",
  "mens_doubles",
  "womens_doubles",
  "mixed_doubles",
]);

export async function GET(
  _request: Request,
  { params }: { params: { category: string } }
) {
  if (!CATEGORIES.has(params.category)) {
    return NextResponse.json({ message: "Kategori liga tidak valid." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const overview = await getLeagueOverview(connection, params.category);
    return NextResponse.json({
      ...overview,
      participants: await Promise.all(
        overview.participants.map(async (participant) => ({
          ...participant,
          avatarUrl: await signAvatarUrl(participant.avatarUrl),
        }))
      ),
      standings: await Promise.all(
        overview.standings.map(async (standing) => ({
          ...standing,
          avatarUrl: await signAvatarUrl(standing.avatarUrl),
        }))
      ),
    });
  } catch (error) {
    logError("mysql.league.overview", error, { category: params.category });
    return NextResponse.json(
      { message: "Gagal memuat data liga." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
