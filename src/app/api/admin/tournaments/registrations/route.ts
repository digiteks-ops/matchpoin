import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { listPendingRegistrations } from "@/lib/supabase/admin-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireApiRole("super_admin");
  if (guard instanceof NextResponse) return guard;

  try {
    const registrations = await listPendingRegistrations();
    return NextResponse.json({ success: true, registrations });
  } catch (error) {
    logError("admin.tournaments.registrations.list", error);
    return NextResponse.json(
      { success: false, message: "Gagal memuat pendaftaran tertunda." },
      { status: 500 }
    );
  }
}
