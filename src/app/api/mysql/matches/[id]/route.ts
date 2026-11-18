import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlMatchDetail, getOpenMatchDetail } from "@/lib/mysql/match-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)) {
    return NextResponse.json({ message: "ID pertandingan tidak valid." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    const user = await getCurrentUser();
    const userId = user?.id;
    connection = await connectToMySql();
    let match = await getOpenMatchDetail(connection, params.id);
    if (!match && userId) {
      match = await getMySqlMatchDetail(connection, params.id, userId);
    }
    if (!match) {
      return NextResponse.json({ message: "Pertandingan tidak ditemukan." }, { status: 404 });
    }
    const signParticipants = async (participants: typeof match.participants) =>
      Promise.all(
        participants.map(async (participant) => ({
          ...participant,
          avatarUrl: await signAvatarUrl(participant.avatarUrl),
        }))
      );
    const canManage = Boolean(userId && userId === match.organizerId);
    return NextResponse.json({
      ...match,
      participants: await signParticipants(match.participants),
      pendingRequests: canManage ? await signParticipants(match.pendingRequests) : [],
      invitedPlayers: canManage ? await signParticipants(match.invitedPlayers) : [],
    });
  } catch (error) {
    logError("mysql.match.detail", error, { matchId: params.id });
    return NextResponse.json({ message: "Gagal memuat pertandingan." }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
