import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { createImageUploadUrl, isAllowedImageType } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Harus login untuk mengunggah foto." }, { status: 401 });
  }
  let payload: { kind?: unknown; matchId?: unknown; contentType?: unknown; size?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Payload tidak valid JSON." }, { status: 400 });
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
      return NextResponse.json({ success: false, message: "Foto profil maksimal 5 MB." }, { status: 400 });
    }
    scope = { kind: "avatar" };
  } else if (
    payload.kind === "evidence" &&
    typeof payload.matchId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.matchId)
  ) {
    if (payload.size > 1024 * 1024) {
      return NextResponse.json({ success: false, message: "Foto bukti maksimal 1 MB." }, { status: 400 });
    }
    let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
    try {
      connection = await connectToMySql();
      const [matches] = await connection.execute<Array<RowDataPacket & { organizer_id: string }>>(
        "SELECT organizer_id FROM matches WHERE id = ? LIMIT 1",
        [payload.matchId]
      );
      if (!matches[0] || matches[0].organizer_id !== userId) {
        return NextResponse.json(
          { success: false, message: "Hanya penyelenggara pertandingan yang dapat mengunggah bukti hasil." },
          { status: 403 }
        );
      }
    } catch (error) {
      logError("mysql.asset.authorize", error, { matchId: payload.matchId, userId });
      return NextResponse.json({ success: false, message: "Gagal memverifikasi pertandingan." }, { status: 500 });
    } finally {
      if (connection) await connection.end();
    }
    scope = { kind: "evidence", matchId: payload.matchId };
  } else {
    return NextResponse.json({ success: false, message: "Jenis unggahan tidak valid." }, { status: 400 });
  }

  try {
    const upload = await createImageUploadUrl(userId, payload.contentType, payload.size, scope);
    return NextResponse.json({ success: true, ...upload });
  } catch (error) {
    logError("mysql.asset.upload_url", error, { userId, kind: payload.kind });
    return NextResponse.json(
      { success: false, message: "Layanan penyimpanan foto tidak tersedia." },
      { status: 503 }
    );
  }
}
