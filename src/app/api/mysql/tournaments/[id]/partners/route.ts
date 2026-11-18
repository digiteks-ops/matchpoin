import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlTournamentPartners } from "@/lib/mysql/competition-service";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json(
      { success: false, message: "Harap masuk untuk memilih partner." },
      { status: 401 }
    );
  }
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const partners = await getMySqlTournamentPartners(connection, params.id, userId);
    if (!partners) {
      return NextResponse.json(
        { success: false, message: "Kompetisi tidak ditemukan." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, partners });
  } catch (error) {
    logError("mysql.tournaments.partners", error, { tournamentId: params.id, userId });
    return NextResponse.json(
      { success: false, message: "Gagal memuat calon partner." },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
