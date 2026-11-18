import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getOpenMatchList } from "@/lib/mysql/match-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestedLimit = new URL(request.url).searchParams.get("limit");
  const limit = requestedLimit === null ? 50 : Number(requestedLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json({ message: "Batas daftar pertandingan tidak valid." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const matches = await getOpenMatchList(connection, limit);
    const signedMatches = await Promise.all(
      matches.map(async (match) => {
        const signParticipants = async (participants: typeof match.participants) =>
          Promise.all(
            participants.map(async (participant) => ({
              ...participant,
              avatarUrl: await signAvatarUrl(participant.avatarUrl),
            }))
          );
        return {
          ...match,
          participants: await signParticipants(match.participants),
          pendingRequests: [],
          invitedPlayers: [],
        };
      })
    );
    return NextResponse.json(signedMatches);
  } catch (error) {
    logError("mysql.match.list", error);
    return NextResponse.json({ message: "Gagal memuat pertandingan." }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
