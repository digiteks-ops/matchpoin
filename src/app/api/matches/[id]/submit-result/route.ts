import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitMatchResult } from "@/lib/services/rating-service";
import { logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk mengirim hasil pertandingan." },
      { status: 401 }
    );
  }

  let payload: {
    team1Score?: number;
    team2Score?: number;
    winnerTeam?: number;
    photoUrls?: string[];
  };
  try {
    payload = (await request.json()) as typeof payload;
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

  const photoUrls = Array.isArray(payload.photoUrls)
    ? payload.photoUrls.filter((u): u is string => typeof u === "string").slice(0, 6)
    : [];

  if (photoUrls.length === 0) {
    return NextResponse.json(
      { success: false, message: "Foto bukti hasil pertandingan wajib diunggah sebelum mengirim hasil." },
      { status: 400 }
    );
  }

  try {
    const result = await submitMatchResult(user.id, {
      matchId: params.id,
      team1Score: payload.team1Score,
      team2Score: payload.team2Score,
      winnerTeam: payload.winnerTeam,
      photoUrls,
    });
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Hasil gagal dikirim.";
    logError("result.submit", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}