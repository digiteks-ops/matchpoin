import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import {
  leaveMySqlMatch,
  MatchWorkflowError,
} from "@/lib/mysql/match-workflow-service";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk untuk keluar dari pertandingan." },
      { status: 401 }
    );
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  let transactionStarted = false;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    transactionStarted = true;
    await leaveMySqlMatch(connection, params.id, userId);
    await connection.commit();
    transactionStarted = false;
    return NextResponse.json({ success: true, message: "Anda berhasil keluar." });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error instanceof MatchWorkflowError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    logError("mysql.match.leave", error, { matchId: params.id, userId });
    return NextResponse.json(
      { success: false, message: "Gagal keluar dari pertandingan." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
