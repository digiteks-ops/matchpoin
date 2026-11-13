import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { respondToInvite } from "@/lib/services/invite-service";
import { ERROR_GENERIC, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();

  if (!UUID_RE.test(params.id ?? "")) {
    return NextResponse.json({ success: false, message: "Undangan tidak ditemukan." }, { status: 404 });
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ success: false, message: "Masuk untuk menanggapi undangan." }, { status: 401 });
  }

  let payload: { action?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ success: false, message: "Permintaan tidak valid." }, { status: 400 });
  }

  if (payload.action !== "accept" && payload.action !== "decline") {
    return NextResponse.json({ success: false, message: "Tindakan tidak valid." }, { status: 400 });
  }

  try {
    await respondToInvite(params.id, user.id, payload.action);
    return NextResponse.json({
      success: true,
      message: payload.action === "accept" ? "Undangan diterima." : "Undangan ditolak.",
    });
  } catch (err) {
    logError("invite.respond", err, { inviteId: params.id, userId: user.id, action: payload.action });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_GENERIC },
      { status: 400 }
    );
  }
}