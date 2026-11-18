import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { syncMySqlMatchResultStatus } from "@/lib/mysql/result-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: true, synced: false });
  }
  return withMatchTransaction(
    "mysql.match.result.sync",
    { matchId: params.id, userId },
    async (connection) => ({ synced: await syncMySqlMatchResultStatus(connection, params.id) }),
    (result) => NextResponse.json({ success: true, ...result })
  );
}
