import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { getOpenMatches } from "@/lib/services/match-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const rawLimit = new URL(request.url).searchParams.get("limit");
  const limit = rawLimit === null ? 50 : Number(rawLimit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return NextResponse.json(
      { message: "Batas daftar pertandingan tidak valid." },
      { status: 400 }
    );
  }

  try {
    const matches = await getOpenMatches(limit);
    const signed = await Promise.all(
      matches.map(async (match) => ({
        ...match,
        participants: await Promise.all(
          match.participants.map(async (participant) => ({
            ...participant,
            avatarUrl: await signAvatarUrl(participant.avatarUrl),
          }))
        ),
      }))
    );
    return NextResponse.json(signed);
  } catch (error) {
    logError("match.list", error);
    return NextResponse.json({ message: "Gagal memuat pertandingan." }, { status: 500 });
  }
}
