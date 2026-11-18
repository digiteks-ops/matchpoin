import { NextResponse } from "next/server";
import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { inspectImageObject, isAllowedImageType, signAssetReadUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }
  let payload: { objectKey?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Payload tidak valid JSON." }, { status: 400 });
  }
  const objectKey = typeof payload.objectKey === "string" ? payload.objectKey : "";
  if (!objectKey.startsWith(`avatars/${userId}/`) || objectKey.includes("..")) {
    return NextResponse.json({ success: false, message: "Kunci foto profil tidak valid." }, { status: 400 });
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    const file = await inspectImageObject(objectKey);
    if (!isAllowedImageType(file.contentType) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: "Foto profil tidak valid." }, { status: 400 });
    }
    const avatarUrl = await signAssetReadUrl(objectKey);
    connection = await connectToMySql();
    const [result] = await connection.execute<ResultSetHeader>(
      "UPDATE users SET avatar_url = ? WHERE id = ?",
      [objectKey, userId]
    );
    if (result.affectedRows === 0) {
      const [users] = await connection.execute<RowDataPacket[]>(
        "SELECT id FROM users WHERE id = ? LIMIT 1",
        [userId]
      );
      if (users.length === 0) {
        return NextResponse.json({ success: false, message: "Akun tidak ditemukan." }, { status: 404 });
      }
    }
    return NextResponse.json({ success: true, avatarUrl });
  } catch (error) {
    logError("mysql.asset.avatar", error, { userId });
    return NextResponse.json(
      { success: false, message: "Foto profil tidak dapat disimpan." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
