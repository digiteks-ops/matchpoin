import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { getTournamentPartners } from "@/lib/supabase/competition-service";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json(
      { success: false, message: "Harap masuk untuk memilih partner." },
      { status: 401 }
    );
  }

  const category = new URL(request.url).searchParams.get("category");

  try {
    const partners = await getTournamentPartners(params.id, user.id, category);
    if (!partners) {
      return NextResponse.json(
        { success: false, message: "Kompetisi tidak ditemukan." },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, partners });
  } catch (error) {
    logError("tournaments.partners", error, { tournamentId: params.id, userId: user.id });
    return NextResponse.json(
      { success: false, message: "Gagal memuat calon partner." },
      { status: 500 }
    );
  }
}
