// src/app/api/chat/route.ts
//
// GET  -> daftar percakapan pemain (chat pertandingan + chat pribadi)
// POST -> membuka percakapan; body { matchId } untuk chat grup pertandingan,
//         atau { userId } untuk chat pribadi (host <-> penantang).
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getMyChats, openDirectChat, openMatchChat } from "@/lib/services/chat-service";
import { ERROR_GENERIC, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Masuk untuk melihat chat Anda." },
      { status: 401 }
    );
  }

  try {
    const conversations = await getMyChats(user.id);
    return NextResponse.json({ success: true, conversations });
  } catch (err) {
    logError("chat.list.route", err, { userId: user.id });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_GENERIC },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Masuk untuk membuka chat." },
      { status: 401 }
    );
  }

  let payload: { matchId?: string; userId?: string };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json(
      { success: false, message: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  try {
    if (payload.matchId) {
      const conversationId = await openMatchChat(payload.matchId);
      return NextResponse.json({ success: true, conversationId });
    }
    if (payload.userId) {
      if (payload.userId === user.id) {
        return NextResponse.json(
          { success: false, message: "Tidak dapat memulai chat dengan diri sendiri." },
          { status: 400 }
        );
      }
      const conversationId = await openDirectChat(payload.userId);
      return NextResponse.json({ success: true, conversationId });
    }
    return NextResponse.json(
      { success: false, message: "Tentukan pertandingan atau pemain yang akan dichat." },
      { status: 400 }
    );
  } catch (err) {
    logError("chat.open.route", err, { userId: user.id, ...payload });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_GENERIC },
      { status: 400 }
    );
  }
}