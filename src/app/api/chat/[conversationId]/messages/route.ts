// src/app/api/chat/[conversationId]/messages/route.ts
//
// GET  -> isi percakapan (pesan lama ke baru)
// POST -> kirim pesan teks; body { content }
//
// Hanya anggota percakapan yang bisa membaca/menulis: RLS tabel `messages`
// menegakkannya, sehingga permintaan dari bukan-anggota gagal tanpa membocorkan
// isi percakapan.
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getConversation, sendChatMessage } from "@/lib/services/chat-service";
import { ERROR_GENERIC, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  return { user, error };
}

export async function GET(
  _request: Request,
  { params }: { params: { conversationId: string } }
) {
  if (!UUID_RE.test(params.conversationId ?? "")) {
    return NextResponse.json(
      { success: false, message: "Percakapan tidak ditemukan." },
      { status: 404 }
    );
  }

  const { user, error: authError } = await requireUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Masuk untuk melihat pesan." },
      { status: 401 }
    );
  }

  try {
    const conversation = await getConversation(params.conversationId, user.id);
    if (!conversation) {
      return NextResponse.json(
        { success: false, message: "Percakapan tidak ditemukan." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, conversation });
  } catch (err) {
    logError("chat.messages.list", err, { conversationId: params.conversationId, userId: user.id });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_GENERIC },
      { status: 400 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: { conversationId: string } }
) {
  if (!UUID_RE.test(params.conversationId ?? "")) {
    return NextResponse.json(
      { success: false, message: "Percakapan tidak ditemukan." },
      { status: 404 }
    );
  }

  const { user, error: authError } = await requireUser();
  if (authError || !user) {
    return NextResponse.json(
      { success: false, message: "Masuk untuk mengirim pesan." },
      { status: 401 }
    );
  }

  let payload: { content?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json(
      { success: false, message: "Permintaan tidak valid." },
      { status: 400 }
    );
  }

  if (typeof payload.content !== "string") {
    return NextResponse.json(
      { success: false, message: "Pesan tidak boleh kosong." },
      { status: 400 }
    );
  }

  try {
    const message = await sendChatMessage(params.conversationId, user.id, payload.content);
    return NextResponse.json({ success: true, message });
  } catch (err) {
    logError("chat.messages.send", err, { conversationId: params.conversationId, userId: user.id });
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : ERROR_GENERIC },
      { status: 400 }
    );
  }
}