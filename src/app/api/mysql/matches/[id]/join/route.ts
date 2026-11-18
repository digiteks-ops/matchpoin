import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import {
  joinMySqlMatch,
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
      { success: false, message: "Anda harus masuk untuk mengajukan partisipasi." },
      { status: 401 }
    );
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  let transactionStarted = false;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    transactionStarted = true;
    await joinMySqlMatch(connection, params.id, userId);
    await connection.commit();
    transactionStarted = false;
    return NextResponse.json({
      success: true,
      message: "Anda berhasil bergabung dengan pertandingan.",
    });
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error instanceof MatchWorkflowError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    logError("mysql.match.join", error, { matchId: params.id, userId });
    return NextResponse.json(
      { success: false, message: "Gagal mengajukan permohonan." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
