import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { disputeMatchResult } from "@/lib/services/rating-service";
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
      { success: false, message: "Harus masuk untuk menyanggah hasil." },
      { status: 401 }
    );
  }

  let payload: { reason?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }

  try {
    const result = await disputeMatchResult(user.id, params.id, payload.reason ?? "");
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sanggahan gagal dikirim.";
    logError("result.dispute", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}