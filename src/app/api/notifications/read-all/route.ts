import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { markAllNotificationsRead } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  await markAllNotificationsRead(userId);
  return NextResponse.json({ success: true });
}