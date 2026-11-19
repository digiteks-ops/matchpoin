import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
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
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }
  const objectKey = typeof payload.objectKey === "string" ? payload.objectKey : "";
  if (!objectKey.startsWith(`avatars/${userId}/`) || objectKey.includes("..")) {
    return NextResponse.json(
      { success: false, message: "Kunci foto profil tidak valid." },
      { status: 400 }
    );
  }

  try {
    const file = await inspectImageObject(objectKey);
    if (!isAllowedImageType(file.contentType) || file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ success: false, message: "Foto profil tidak valid." }, { status: 400 });
    }

    const avatarUrl = await signAssetReadUrl(objectKey);
    const supabase = createClient();
    const { data: updated, error: updateError } = await supabase
      .from("users")
      .update({ avatar_url: objectKey })
      .eq("id", userId)
      .select("id")
      .maybeSingle();
    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return NextResponse.json({ success: false, message: "Akun tidak ditemukan." }, { status: 404 });
    }

    const admin = createAdminClient();
    if (admin) {
      const bucket = process.env.SUPABASE_STORAGE_AVATARS_BUCKET ?? "avatars";
      await admin.from("file_metadata").upsert(
        {
          user_id: userId,
          storage_key: objectKey,
          bucket,
          original_name: objectKey.split("/").pop() ?? objectKey,
          content_type: file.contentType,
          size_bytes: file.size,
          kind: "avatar",
        },
        { onConflict: "storage_key", ignoreDuplicates: true }
      );
    }

    return NextResponse.json({ success: true, avatarUrl });
  } catch (error) {
    logError("asset.avatar", error, { userId });
    return NextResponse.json(
      { success: false, message: "Foto profil tidak dapat disimpan." },
      { status: 500 }
    );
  }
}
