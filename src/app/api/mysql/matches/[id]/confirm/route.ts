import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { confirmMySqlMatchResult } from "@/lib/mysql/result-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk mengonfirmasi hasil pertandingan." },
      { status: 401 }
    );
  }
  return withMatchTransaction(
    "mysql.match.result.confirm",
    { matchId: params.id, userId },
    (connection) => confirmMySqlMatchResult(connection, userId, params.id),
    (result) => NextResponse.json(result)
  );
}
