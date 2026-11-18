import { NextResponse } from "next/server";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { MatchWorkflowError } from "@/lib/mysql/match-workflow-service";

export async function withMatchTransaction<T>(
  operation: string,
  context: Record<string, unknown>,
  action: (connection: Awaited<ReturnType<typeof connectToMySql>>) => Promise<T>,
  successResponse: (result: T) => NextResponse
): Promise<NextResponse> {
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  let transactionStarted = false;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();
    transactionStarted = true;
    const result = await action(connection);
    await connection.commit();
    transactionStarted = false;
    return successResponse(result);
  } catch (error) {
    if (transactionStarted && connection) await connection.rollback();
    if (error instanceof MatchWorkflowError) {
      return NextResponse.json({ success: false, message: error.message }, { status: 400 });
    }
    logError(operation, error, context);
    return NextResponse.json(
      { success: false, message: "Tindakan pertandingan gagal. Coba lagi." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
