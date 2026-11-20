import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { getMatchResult } from "@/lib/services/rating-service";
import { getMatchResultContext } from "@/lib/supabase/competition-service";
import { signAssetReadUrls } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }

  try {
    const [result, match] = await Promise.all([
      getMatchResult(params.id),
      getMatchResultContext(user.id, params.id),
    ]);
    return NextResponse.json({
      success: true,
      match,
      result: result
        ? { ...result, photoUrls: await signAssetReadUrls(result.photoUrls) }
        : null,
    });
  } catch (error) {
    logError("match.result.get", error, { matchId: params.id, userId: user.id });
    return NextResponse.json(
      { success: false, message: "Gagal memuat hasil pertandingan." },
      { status: 500 }
    );
  }
}
