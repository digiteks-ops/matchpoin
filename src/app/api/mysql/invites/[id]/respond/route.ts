import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { respondToMySqlInvite } from "@/lib/mysql/match-workflow-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Masuk untuk menanggapi undangan." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Permintaan tidak valid." }, { status: 400 });
  }
  const action =
    body && typeof body === "object" && "action" in body &&
    (body.action === "accept" || body.action === "decline") ? body.action : null;
  if (!action) {
    return NextResponse.json({ success: false, message: "Tindakan tidak valid." }, { status: 400 });
  }
  return withMatchTransaction(
    "mysql.invite.respond",
    { inviteId: params.id, userId, action },
    async (connection) => respondToMySqlInvite(connection, params.id, userId, action),
    () =>
      NextResponse.json({
        success: true,
        message: action === "accept" ? "Undangan diterima." : "Undangan ditolak.",
      })
  );
}
