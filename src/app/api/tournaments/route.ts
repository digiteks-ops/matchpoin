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
    const schemaMissing =
      error instanceof Error &&
      /column .* does not exist|schema cache|could not find the .* column/i.test(error.message);
    return NextResponse.json(
      {
        success: false,
        message: schemaMissing
          ? "Skema turnamen belum diperbarui. Jalankan migration 00014 di Supabase."
          : "Gagal memuat daftar kompetisi.",
      },
      { status: 500 }
    );
  }
}
