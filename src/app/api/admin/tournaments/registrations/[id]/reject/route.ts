import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { rejectRegistration } from "@/lib/supabase/admin-service";
import { notifyTournamentRegistration } from "@/lib/notifications/notification-service";

interface RejectRequest {
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiRole("super_admin");
  if (guard instanceof NextResponse) return guard;

  const { id: registrationId } = await params;
  if (!registrationId) {
    return NextResponse.json(
      { success: false, message: "ID pendaftaran tidak valid." },
      { status: 400 }
    );
  }

  let payload: RejectRequest;
  try {
    payload = (await request.json()) as RejectRequest;
  } catch {
    return NextResponse.json({ success: false, message: "Data tidak valid." }, { status: 400 });
  }

  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : "";
  if (!reason) {
    return NextResponse.json(
      { success: false, message: "Alasan penolakan wajib diisi." },
      { status: 400 }
    );
  }

  try {
    const result = await rejectRegistration(registrationId, guard.session.user.id, reason);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 409 });
    }

    if (result.user_id && result.tournament_id) {
      await notifyTournamentRegistration(
        result.user_id,
        result.tournament_id,
        result.tournament_name ?? "Liga"
      );
      if (result.partner_user_id) {
        await notifyTournamentRegistration(
          result.partner_user_id,
          result.tournament_id,
          result.tournament_name ?? "Liga"
        );
      }
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    logError("admin.tournaments.registrations.reject", error, { registrationId });
    return NextResponse.json(
      { success: false, message: "Gagal menolak pendaftaran. Coba lagi." },
      { status: 500 }
    );
  }
}
