import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { confirmMatchResult } from "@/lib/services/rating-service";
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
      { success: false, message: "Harus masuk untuk mengonfirmasi hasil." },
      { status: 401 }
    );
  }

  try {
    const result = await confirmMatchResult(user.id, params.id);
    return NextResponse.json({ ...result, success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Hasil gagal dikonfirmasi.";
    logError("result.confirm", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}