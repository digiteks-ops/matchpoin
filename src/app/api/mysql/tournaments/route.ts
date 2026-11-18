import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlTournamentList } from "@/lib/mysql/competition-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  const userId = user?.id ?? null;
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const tournaments = await getMySqlTournamentList(connection, userId);
    return NextResponse.json({ success: true, tournaments });
  } catch (error) {
    logError("mysql.tournaments.list", error, { userId });
    return NextResponse.json(
      { success: false, message: "Gagal memuat daftar kompetisi." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
