import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { invitePlayerToMySqlMatch } from "@/lib/mysql/match-workflow-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Masuk untuk mengundang pemain." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Permintaan tidak valid." }, { status: 400 });
  }
  const inviteeId =
    body && typeof body === "object" && "inviteeId" in body &&
    typeof body.inviteeId === "string" ? body.inviteeId : "";
  if (!inviteeId) {
    return NextResponse.json({ success: false, message: "Pemain yang diundang wajib dipilih." }, { status: 400 });
  }
  return withMatchTransaction(
    "mysql.match.invite",
    { matchId: params.id, inviteeId, userId },
    async (connection) => invitePlayerToMySqlMatch(connection, params.id, userId, inviteeId),
    (inviteId) => NextResponse.json({ success: true, inviteId, message: "Undangan terkirim." })
  );
}
