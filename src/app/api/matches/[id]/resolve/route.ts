import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMatchDispute } from "@/lib/services/rating-service";
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
      { success: false, message: "Harus masuk untuk menyelesaikan sanggahan." },
      { status: 401 }
    );
  }

  let payload: { resolution?: string; reason?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }

  const resolution = payload.resolution;
  if (resolution !== "confirmed" && resolution !== "rejected") {
    return NextResponse.json(
      { success: false, message: "Keputusan sanggahan tidak valid." },
      { status: 400 }
    );
  }

  try {
    const result = await resolveMatchDispute(params.id, resolution, payload.reason ?? "");
    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sanggahan gagal diselesaikan.";
    logError("result.resolve", err, { matchId: params.id, userId: user.id });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
