import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { leaveMatch } from "@/lib/services/match-service";
import { logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk keluar dari pertandingan." },
      { status: 401 }
    );
  }

  try {
    await leaveMatch(params.id, user.id);
    return NextResponse.json({
      success: true,
      message: "Anda telah keluar dari pertandingan.",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal keluar dari pertandingan.";
    logError("match.leave.route", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}