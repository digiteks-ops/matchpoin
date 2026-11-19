import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { logError } from "@/lib/errors";
import { getPendingInvites } from "@/lib/services/invite-service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.id) {
    return NextResponse.json(
      { success: false, message: "Masuk untuk melihat undangan." },
      { status: 401 }
    );
  }

  try {
    const invitations = await getPendingInvites(user.id, 100);
    return NextResponse.json({ success: true, invitations });
  } catch (error) {
    logError("invites.list", error, { userId: user.id });
    return NextResponse.json(
      { success: false, message: "Gagal memuat undangan." },
      { status: 500 }
    );
  }
}
