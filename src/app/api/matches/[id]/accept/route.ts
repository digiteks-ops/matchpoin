import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { acceptParticipantRequest } from "@/lib/services/match-service";
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
      { success: false, message: "Harus masuk untuk menerima peserta." },
      { status: 401 }
    );
  }

  let payload: { participantUserId?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }

  if (!payload.participantUserId) {
    return NextResponse.json(
      { success: false, message: "participantUserId diperlukan." },
      { status: 400 }
    );
  }

  try {
    await acceptParticipantRequest(params.id, user.id, payload.participantUserId);
    return NextResponse.json({ success: true, message: "Peserta diterima." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal menerima peserta.";
    logError("match.accept", err, { matchId: params.id, participantUserId: payload.participantUserId });
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}