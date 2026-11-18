import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { cancelMySqlMatch } from "@/lib/mysql/match-workflow-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Harus masuk untuk membatalkan pertandingan." }, { status: 401 });
  }
  let reason: string | undefined;
  try {
    const body: unknown = await request.json();
    if (body && typeof body === "object" && "reason" in body) {
      if (typeof body.reason !== "string") {
        return NextResponse.json({ success: false, message: "Alasan tidak valid." }, { status: 400 });
      }
      reason = body.reason;
    }
  } catch {
    return NextResponse.json({ success: false, message: "Permintaan tidak valid." }, { status: 400 });
  }
  return withMatchTransaction(
    "mysql.match.cancel",
    { matchId: params.id, userId },
    async (connection) => cancelMySqlMatch(connection, params.id, userId, reason),
    () => NextResponse.json({ success: true, message: "Pertandingan dibatalkan." })
  );
}
