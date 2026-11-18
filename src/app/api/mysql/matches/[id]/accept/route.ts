import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { acceptMatchParticipant } from "@/lib/mysql/match-workflow-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Harus masuk untuk menerima peserta." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Payload tidak valid JSON." }, { status: 400 });
  }
  const participantUserId =
    body && typeof body === "object" && "participantUserId" in body &&
    typeof body.participantUserId === "string" ? body.participantUserId : "";
  if (!participantUserId) {
    return NextResponse.json({ success: false, message: "participantUserId diperlukan." }, { status: 400 });
  }
  return withMatchTransaction(
    "mysql.match.accept",
    { matchId: params.id, participantUserId, userId },
    async (connection) => acceptMatchParticipant(connection, params.id, userId, participantUserId),
    () => NextResponse.json({ success: true, message: "Peserta diterima." })
  );
}
