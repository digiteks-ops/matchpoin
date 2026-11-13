import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { invitePlayerToMatch } from "@/lib/services/invite-service";
import { ERROR_INVITE, logError, toUserMessage } from "@/lib/errors";

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
    return NextResponse.json({ success: false, message: "Masuk untuk mengundang pemain." }, { status: 401 });
  }

  let payload: { inviteeId?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ success: false, message: "Permintaan tidak valid." }, { status: 400 });
  }

  if (!payload.inviteeId) {
    return NextResponse.json({ success: false, message: "Pemain yang diundang wajib dipilih." }, { status: 400 });
  }

  try {
    const inviteId = await invitePlayerToMatch(params.id, user.id, payload.inviteeId);
    return NextResponse.json({ success: true, inviteId, message: "Undangan terkirim." });
  } catch (err) {
    logError("invite.send", err, { matchId: params.id, inviteeId: payload.inviteeId });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_INVITE },
      { status: 400 }
    );
  }
}