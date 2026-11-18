import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { recordMySqlWalkover } from "@/lib/mysql/result-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk mencatat WO." },
      { status: 401 }
    );
  }
  let payload: { winnerTeam?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Payload tidak valid JSON." },
      { status: 400 }
    );
  }
  if (payload.winnerTeam !== 1 && payload.winnerTeam !== 2) {
    return NextResponse.json(
      { success: false, message: "Pemenang WO wajib dipilih (Tim 1 atau Tim 2)." },
      { status: 400 }
    );
  }
  const winnerTeam = payload.winnerTeam;
  const reason = typeof payload.reason === "string" ? payload.reason : undefined;
  return withMatchTransaction(
    "mysql.match.walkover",
    { matchId: params.id, userId },
    (connection) => recordMySqlWalkover(connection, userId, params.id, winnerTeam, reason),
    (result) => NextResponse.json(result)
  );
}
