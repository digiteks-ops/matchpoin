import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import { getUserNotifications, getUnreadCount } from "@/lib/notifications/notification-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const unreadOnly = url.searchParams.get("unread") === "true";

  const [notifications, unreadCount] = await Promise.all([
    getUserNotifications(userId, limit, offset, unreadOnly),
    getUnreadCount(userId),
  ]);

  return NextResponse.json({
    success: true,
    notifications,
    unreadCount,
    hasMore: notifications.length === limit,
  });
}