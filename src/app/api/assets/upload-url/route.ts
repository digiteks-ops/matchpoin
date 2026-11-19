import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { createImageUploadUrl, isAllowedImageType } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Harus login untuk mengunggah foto." },
      { status: 401 }
    );
  }

  let payload: { kind?: unknown; matchId?: unknown; contentType?: unknown; size?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }
  if (
    typeof payload.contentType !== "string" ||
    !isAllowedImageType(payload.contentType) ||
    typeof payload.size !== "number" ||
    !Number.isInteger(payload.size) ||
    payload.size < 1
  ) {
    return NextResponse.json({ success: false, message: "Data foto tidak valid." }, { status: 400 });
  }

  let scope: { kind: "avatar" } | { kind: "evidence"; matchId: string };
  if (payload.kind === "avatar") {
    if (payload.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: "Foto profil maksimal 5 MB." },
        { status: 400 }
      );
    }
    scope = { kind: "avatar" };
  } else if (
    payload.kind === "evidence" &&
    typeof payload.matchId === "string" &&
    UUID_PATTERN.test(payload.matchId)
  ) {
    if (payload.size > 1024 * 1024) {
      return NextResponse.json(
        { success: false, message: "Foto bukti maksimal 1 MB." },
        { status: 400 }
      );
    }
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, message: "Layanan penyimpanan foto tidak tersedia." },
        { status: 503 }
      );
    }
    const { data: match, error } = await admin
      .from("matches")
      .select("organizer_id")
      .eq("id", payload.matchId)
      .maybeSingle();
    if (error) {
      logError("asset.authorize", error, { matchId: payload.matchId, userId });
      return NextResponse.json(
        { success: false, message: "Gagal memverifikasi pertandingan." },
        { status: 500 }
      );
    }
    if (!match || match.organizer_id !== userId) {
      return NextResponse.json(
        {
          success: false,
          message: "Hanya penyelenggara pertandingan yang dapat mengunggah bukti hasil.",
        },
        { status: 403 }
      );
    }
    scope = { kind: "evidence", matchId: payload.matchId };
  } else {
    return NextResponse.json({ success: false, message: "Jenis unggahan tidak valid." }, { status: 400 });
  }

  try {
    const upload = await createImageUploadUrl(userId, payload.contentType, payload.size, scope);
    return NextResponse.json({ success: true, ...upload });
  } catch (error) {
    logError("asset.upload_url", error, { userId, kind: payload.kind });
    return NextResponse.json(
      { success: false, message: "Layanan penyimpanan foto tidak tersedia." },
      { status: 503 }
    );
  }
}
