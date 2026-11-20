import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { approveRegistration } from "@/lib/supabase/admin-service";
import { notifyTournamentRegistration } from "@/lib/notifications/notification-service";

interface ApproveRequest {
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireApiRole("admin");
  if (guard instanceof NextResponse) return guard;

  const { id: registrationId } = await params;
  if (!registrationId) {
    return NextResponse.json(
      { success: false, message: "ID pendaftaran tidak valid." },
      { status: 400 }
    );
  }

  let payload: ApproveRequest = {};
  try {
    payload = (await request.json()) as ApproveRequest;
  } catch {
    payload = {};
  }
  const reason = typeof payload.reason === "string" ? payload.reason.trim().slice(0, 500) : null;

  try {
    const result = await approveRegistration(registrationId, guard.session.user.id, reason);
    if (!result.success) {
      return NextResponse.json({ success: false, message: result.message }, { status: 409 });
    }

    if (result.user_id && result.tournament_id) {
      try {
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
      } catch (notificationError) {
        logError("admin.tournaments.registrations.approve.notify", notificationError, {
          registrationId,
        });
      }
    }

    return NextResponse.json({ success: true, message: result.message });
  } catch (error) {
    logError("admin.tournaments.registrations.approve", error, { registrationId });
    return NextResponse.json(
      { success: false, message: "Gagal menyetujui pendaftaran. Coba lagi." },
      { status: 500 }
    );
  }
}
