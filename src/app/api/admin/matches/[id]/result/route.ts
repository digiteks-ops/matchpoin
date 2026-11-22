import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { submitMatchResult } from "@/lib/services/rating-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  const body = (await request.json().catch(() => ({}))) as {
    team1Score?: number;
    team2Score?: number;
  };
  const team1Score = Number(body.team1Score);
  const team2Score = Number(body.team2Score);
  if (!Number.isFinite(team1Score) || !Number.isFinite(team2Score)) {
    return NextResponse.json({ success: false, message: "Skor tidak valid." }, { status: 400 });
  }
  if (team1Score === team2Score) {
    return NextResponse.json(
      { success: false, message: "Pertandingan tenis tidak boleh berakhir seri." },
      { status: 400 }
    );
  }

  try {
    const result = await submitMatchResult(
      guard.session.user.id,
      {
        matchId: params.id,
        team1Score,
        team2Score,
        winnerTeam: team1Score > team2Score ? 1 : 2,
        photoUrls: [],
      },
      { asAdmin: true }
    );
    return NextResponse.json({ success: true, result });
  } catch (error) {
    logError("admin.match.result", error, { matchId: params.id });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Gagal menyimpan hasil." },
      { status: 400 }
    );
  }
}
