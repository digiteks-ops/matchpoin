import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import {
  getRegistrationStats,
  listLeagueOptions,
  listRegistrations,
} from "@/lib/supabase/admin-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  const url = new URL(request.url);
  const tournamentId = url.searchParams.get("tournamentId") || undefined;
  const status = url.searchParams.get("status") || undefined;

  try {
    const [registrations, stats, tournaments] = await Promise.all([
      listRegistrations({ tournamentId, status }),
      getRegistrationStats(),
      listLeagueOptions(),
    ]);
    return NextResponse.json({ success: true, registrations, stats, tournaments });
  } catch (error) {
    logError("admin.tournaments.registrations.list", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat pendaftaran." },
      { status: 500 }
    );
  }
}
