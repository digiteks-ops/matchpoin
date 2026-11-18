import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlInvitations } from "@/lib/mysql/invite-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Masuk untuk melihat undangan." }, { status: 401 });
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const invitations = await getMySqlInvitations(connection, userId);
    return NextResponse.json({ success: true, invitations });
  } catch (error) {
    logError("mysql.invites.list", error, { userId });
    return NextResponse.json({ success: false, message: "Gagal memuat undangan MySQL." }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
