import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { getTournamentList } from "@/lib/supabase/competition-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  try {
    const tournaments = await getTournamentList(user?.id ?? null);
    return NextResponse.json({ success: true, tournaments });
  } catch (error) {
    logError("tournaments.list", error, { userId: user?.id ?? null });
    return NextResponse.json(
      { success: false, message: "Gagal memuat daftar kompetisi." },
      { status: 500 }
    );
  }
}
