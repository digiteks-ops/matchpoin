import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { cancelTournamentMatchAsAdmin } from "@/lib/services/match-service";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string; matchId: string } }
) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  let reason = "Dibatalkan oleh admin turnamen.";
  try {
    const body = (await request.json()) as { reason?: unknown };
    if (typeof body.reason === "string" && body.reason.trim()) {
      reason = body.reason.trim().slice(0, 300);
    }
  } catch {
    // keep the default reason
  }

  try {
    const admin = createAdminClient();
    if (!admin) throw new Error("Supabase service role is not configured.");
    const { data: match, error } = await admin
      .from("matches")
      .select("id, tournament_id")
      .eq("id", params.matchId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!match || match.tournament_id !== params.id) {
      return NextResponse.json(
        { success: false, message: "Pertandingan tidak ditemukan pada turnamen ini." },
        { status: 404 }
      );
    }

    await cancelTournamentMatchAsAdmin(params.matchId, guard.session.user.id, reason);
    return NextResponse.json({ success: true, message: "Pertandingan dibatalkan." });
  } catch (error) {
    logError("admin.tournaments.matches.cancel", error, {
      tournamentId: params.id,
      matchId: params.matchId,
    });
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Gagal membatalkan pertandingan.",
      },
      { status: 400 }
    );
  }
}
