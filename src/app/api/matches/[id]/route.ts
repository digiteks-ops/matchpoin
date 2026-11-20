import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { getMatchDetail } from "@/lib/services/match-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!UUID_PATTERN.test(params.id)) {
    return NextResponse.json({ message: "ID pertandingan tidak valid." }, { status: 400 });
  }

  try {
    const match = await getMatchDetail(params.id);
    if (!match) {
      return NextResponse.json(
        { message: "Pertandingan tidak ditemukan." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ...match,
      participants: await Promise.all(
        match.participants.map(async (participant) => ({
          ...participant,
          avatarUrl: await signAvatarUrl(participant.avatarUrl),
        }))
      ),
    });
  } catch (error) {
    logError("match.detail", error, { matchId: params.id });
    return NextResponse.json({ message: "Gagal memuat pertandingan." }, { status: 500 });
  }
}
