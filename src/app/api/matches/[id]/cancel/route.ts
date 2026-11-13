import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cancelOpenMatch } from "@/lib/services/match-service";
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
      { success: false, message: "Harus masuk untuk membatalkan pertandingan." },
      { status: 401 }
    );
  }

  let reason: string | undefined;
  try {
    const body = (await request.json()) as { reason?: string };
    reason = body.reason;
  } catch {
    reason = undefined;
  }

  try {
    await cancelOpenMatch(params.id, user.id, reason);
    return NextResponse.json({ success: true, message: "Pertandingan dibatalkan." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Pertandingan gagal dibatalkan.";
    logError("match.cancel", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}