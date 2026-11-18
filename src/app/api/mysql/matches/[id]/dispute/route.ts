import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { disputeMySqlMatchResult } from "@/lib/mysql/result-service";
import { signAssetReadUrls } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk menyanggah hasil pertandingan." },
      { status: 401 }
    );
  }
  let payload: { reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }
  const reason = typeof payload.reason === "string" ? payload.reason : "";
  return withMatchTransaction(
    "mysql.match.result.dispute",
    { matchId: params.id, userId },
    async (connection) => {
      const result = await disputeMySqlMatchResult(connection, userId, params.id, reason);
      return { ...result, photoUrls: await signAssetReadUrls(result.photoUrls) };
    },
    (result) => NextResponse.json({ success: true, result })
  );
}
