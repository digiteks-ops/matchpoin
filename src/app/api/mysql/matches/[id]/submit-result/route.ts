import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { submitMySqlMatchResult } from "@/lib/mysql/result-service";
import {
  inspectImageObject,
  InvalidSupabaseImageError,
  isOwnedEvidenceKey,
  isSupabaseStorageConfigured,
  signAssetReadUrls,
} from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk mengirim hasil pertandingan." },
      { status: 401 }
    );
  }

  let payload: {
    team1Score?: unknown;
    team2Score?: unknown;
    winnerTeam?: unknown;
    photoUrls?: unknown;
  };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }
  if (
    typeof payload.team1Score !== "number" ||
    typeof payload.team2Score !== "number" ||
    (payload.winnerTeam !== 1 && payload.winnerTeam !== 2)
  ) {
    return NextResponse.json(
      { success: false, message: "Skor dan pemenang wajib diisi dengan benar." },
      { status: 400 }
    );
  }
  const team1Score = payload.team1Score;
  const team2Score = payload.team2Score;
  const winnerTeam = payload.winnerTeam;
  const photoUrls = Array.isArray(payload.photoUrls)
    ? payload.photoUrls.filter((url): url is string => typeof url === "string").slice(0, 6)
    : [];
  if (
    photoUrls.length === 0 ||
    photoUrls.some((key) => !isOwnedEvidenceKey(key, params.id, userId))
  ) {
    return NextResponse.json(
      { success: false, message: "Foto bukti harus diunggah ke penyimpanan MATCHPOIN." },
      { status: 400 }
    );
  }
  if (!isSupabaseStorageConfigured()) {
    return NextResponse.json(
      { success: false, message: "Penyimpanan foto belum dikonfigurasi." },
      { status: 503 }
    );
  }
  try {
    await Promise.all(photoUrls.map((key) => inspectImageObject(key)));
  } catch (error) {
    if (error instanceof InvalidSupabaseImageError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    logError("mysql.match.result.evidence", error, { matchId: params.id, userId });
    return NextResponse.json(
      { success: false, message: "Foto bukti tidak dapat diverifikasi saat ini." },
      { status: 503 }
    );
  }

  return withMatchTransaction(
    "mysql.match.result.submit",
    { matchId: params.id, userId },
    async (connection) => {
      const result = await submitMySqlMatchResult(
        connection,
        userId,
        params.id,
        team1Score,
        team2Score,
        winnerTeam,
        photoUrls
      );
      return { ...result, photoUrls: await signAssetReadUrls(result.photoUrls) };
    },
    (result) => NextResponse.json({ success: true, result })
  );
}
