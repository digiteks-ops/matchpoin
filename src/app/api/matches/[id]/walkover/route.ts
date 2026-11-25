import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
      { success: false, message: "Anda harus masuk untuk mencatat WO." },
      { status: 401 }
    );
  }

  let payload: { winnerTeam?: number; reason?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }

  if (payload.winnerTeam !== 1 && payload.winnerTeam !== 2) {
    return NextResponse.json(
      { success: false, message: "Pemenang WO wajib dipilih (Tim 1 atau Tim 2)." },
      { status: 400 }
    );
  }

  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, message: "Klien admin tidak tersedia." },
        { status: 500 }
      );
    }

    const { data: match, error: matchError } = await admin
      .from("matches")
      .select("id, status, organizer_id, metadata")
      .eq("id", params.id)
      .single();

    if (matchError || !match) {
      return NextResponse.json(
        { success: false, message: "Pertandingan tidak ditemukan." },
        { status: 404 }
      );
    }

    if (match.status === "completed") {
      return NextResponse.json(
        { success: false, message: "Pertandingan sudah selesai." },
        { status: 400 }
      );
    }

    const { data: result, error: resultError } = await admin
      .from("match_results")
      .select("*")
      .eq("match_id", params.id)
      .maybeSingle();

    if (resultError) throw resultError;
    if (result) {
      return NextResponse.json(
        { success: false, message: "Hasil pertandingan sudah ada." },
        { status: 400 }
      );
    }

    const winnerScore = 8;
    const loserScore = 0;

    const { error: insertError } = await admin
      .from("match_results")
      .insert({
        match_id: params.id,
        team1_score: payload.winnerTeam === 1 ? winnerScore : loserScore,
        team2_score: payload.winnerTeam === 1 ? loserScore : winnerScore,
        winner_team: payload.winnerTeam,
        submitted_by: user.id,
        status: "confirmed",
        submitted_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        metadata: {
          is_walkover: true,
          walkover_by: user.id,
          walkover_reason: payload.reason || "Walkover",
          photo_urls: [],
        },
      });

    if (insertError) throw insertError;

    const { error: statusError } = await admin
      .from("matches")
      .update({
        status: "completed",
        result_submitted_at: new Date().toISOString(),
      })
      .eq("id", params.id);

    if (statusError) {
      logError("walkover.status", statusError, { matchId: params.id });
    }

    // MPR only uses real win/loss results. Walkover (WO) must not change rating.
    return NextResponse.json({
      success: true,
      message: `WO dicatat. Tim ${payload.winnerTeam} menang 8–0. Rating tidak berubah.`,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal mencatat WO.";
    logError("walkover.submit", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
