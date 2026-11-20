import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

export type NotificationType =
  | "match_challenge"
  | "challenge_accepted"
  | "challenge_rejected"
  | "player_joined"
  | "match_cancelled"
  | "result_confirmed"
  | "result_disputed"
  | "tournament_registration"
  | "tournament_update"
  | "admin_announcement";

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  referenceId?: string;
}

let cachedBroadcastClient: ReturnType<typeof createSupabaseClient> | null = null;

function getBroadcastClient() {
  if (cachedBroadcastClient) return cachedBroadcastClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Supabase Realtime not configured");
  }
  cachedBroadcastClient = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 50 } },
  });
  return cachedBroadcastClient;
}

function admin() {
  const client = createAdminClient();
  if (!client) throw new Error("Supabase service role is not configured.");
  return client;
}

interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export async function createNotification(
  userId: string,
  payload: NotificationPayload
): Promise<string> {
  const notificationId = randomUUID();
  const { error } = await admin().from("notifications").insert({
    id: notificationId,
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data ?? null,
    reference_id: payload.referenceId ?? null,
    is_read: false,
  });
  if (error) throw new Error(`Gagal menyimpan notifikasi: ${error.message}`);

  await broadcastNotification(userId, {
    id: notificationId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data,
    referenceId: payload.referenceId,
    createdAt: new Date().toISOString(),
    isRead: false,
  });

  return notificationId;
}

export async function createNotificationsForUsers(
  userIds: string[],
  payload: NotificationPayload
): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = userIds.map((userId) => ({
    id: randomUUID(),
    user_id: userId,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    data: payload.data ?? null,
    reference_id: payload.referenceId ?? null,
    is_read: false,
  }));

  const { error } = await admin().from("notifications").insert(rows);
  if (error) throw new Error(`Gagal menyimpan notifikasi: ${error.message}`);

  await Promise.all(
    rows.map((row) =>
      broadcastNotification(row.user_id, {
        id: row.id,
        type: row.type,
        title: row.title,
        message: row.message,
        data: payload.data,
        referenceId: payload.referenceId,
        createdAt: new Date().toISOString(),
        isRead: false,
      })
    )
  );

  return rows.map((row) => row.id);
}

async function broadcastNotification(
  userId: string,
  notification: Record<string, unknown>
): Promise<void> {
  try {
    const client = getBroadcastClient();
    const channel = client.channel(`user-notifications:${userId}`, {
      config: { broadcast: { self: true } },
    });
    await channel.send({
      type: "broadcast",
      event: "notification",
      payload: notification,
    });
    setTimeout(() => channel.unsubscribe(), 100);
  } catch (error) {
    console.error("Realtime broadcast failed:", error);
  }
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  const { error } = await admin()
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId)
    .eq("user_id", userId);
  if (error) throw new Error(`Gagal menandai notifikasi: ${error.message}`);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const { error } = await admin()
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(`Gagal menandai notifikasi: ${error.message}`);
}

export async function getUserNotifications(
  userId: string,
  limit = 50,
  offset = 0,
  unreadOnly = false
): Promise<
  Array<{
    id: string;
    type: string;
    title: string;
    message: string;
    data: Record<string, unknown> | null;
    isRead: boolean;
    createdAt: string;
    referenceId: string | null;
  }>
> {
  let query = admin()
    .from("notifications")
    .select("id, type, title, message, data, reference_id, is_read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + Math.max(limit, 1) - 1);
  if (unreadOnly) query = query.eq("is_read", false);

  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat notifikasi: ${error.message}`);

  return ((data ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message,
    data: row.data ?? null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    referenceId: row.reference_id ?? null,
  }));
}

export async function getUnreadCount(userId: string): Promise<number> {
  const { count, error } = await admin()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw new Error(`Gagal menghitung notifikasi: ${error.message}`);
  return count ?? 0;
}

export async function notifyMatchChallenge(
  challengerId: string,
  opponentId: string,
  matchId: string,
  matchTitle: string
): Promise<void> {
  await createNotification(opponentId, {
    type: "match_challenge",
    title: "New Match Challenge",
    message: `${challengerId} challenged you to "${matchTitle}"`,
    data: { challengerId, matchId, matchTitle },
    referenceId: matchId,
  });
}

export async function notifyChallengeResponse(
  opponentId: string,
  matchId: string,
  accepted: boolean
): Promise<void> {
  await createNotification(opponentId, {
    type: accepted ? "challenge_accepted" : "challenge_rejected",
    title: accepted ? "Challenge Accepted" : "Challenge Rejected",
    message: accepted
      ? "Your match challenge was accepted"
      : "Your match challenge was rejected",
    data: { matchId, accepted },
    referenceId: matchId,
  });
}

export async function notifyPlayerJoined(
  organizerId: string,
  playerId: string,
  matchId: string,
  matchTitle: string
): Promise<void> {
  await createNotification(organizerId, {
    type: "player_joined",
    title: "Player Joined Match",
    message: `${playerId} joined "${matchTitle}"`,
    data: { playerId, matchId, matchTitle },
    referenceId: matchId,
  });
}

export async function notifyOpenMatchJoined(
  organizerId: string,
  playerName: string,
  matchId: string,
  matchTitle: string
): Promise<void> {
  await createNotification(organizerId, {
    type: "player_joined",
    title: "Pemain Bergabung",
    message: `${playerName} bergabung ke "${matchTitle}".`,
    data: { matchId, matchTitle, playerName },
    referenceId: matchId,
  });
}

export async function notifyMatchCancelled(
  participantIds: string[],
  matchId: string,
  matchTitle: string,
  reason: string
): Promise<void> {
  await createNotificationsForUsers(participantIds, {
    type: "match_cancelled",
    title: "Match Cancelled",
    message: `"${matchTitle}" was cancelled: ${reason}`,
    data: { matchId, matchTitle, reason },
    referenceId: matchId,
  });
}

export async function notifyResultConfirmed(
  participantIds: string[],
  matchId: string,
  matchTitle: string
): Promise<void> {
  await createNotificationsForUsers(participantIds, {
    type: "result_confirmed",
    title: "Result Confirmed",
    message: `Result for "${matchTitle}" has been confirmed`,
    data: { matchId, matchTitle },
    referenceId: matchId,
  });
}

export async function notifyResultDisputed(
  organizerId: string,
  matchId: string,
  matchTitle: string,
  reason: string
): Promise<void> {
  await createNotification(organizerId, {
    type: "result_disputed",
    title: "Result Disputed",
    message: `Result for "${matchTitle}" was disputed: ${reason}`,
    data: { matchId, matchTitle, reason },
    referenceId: matchId,
  });
}

export async function notifyTournamentRegistration(
  userId: string,
  tournamentId: string,
  tournamentTitle: string
): Promise<void> {
  await createNotification(userId, {
    type: "tournament_registration",
    title: "Tournament Registration",
    message: `You have been registered for "${tournamentTitle}"`,
    data: { tournamentId, tournamentTitle },
    referenceId: tournamentId,
  });
}

export async function notifyAdminAnnouncement(
  userIds: string[],
  title: string,
  message: string,
  data?: Record<string, unknown>
): Promise<void> {
  await createNotificationsForUsers(userIds, {
    type: "admin_announcement",
    title,
    message,
    data,
  });
}

export async function notifyAdminsPendingRegistration(
  tournamentId: string,
  tournamentTitle: string,
  entryId: string
): Promise<void> {
  const { data, error } = await admin()
    .from("user_roles")
    .select("user_id, roles!inner(code)")
    .is("revoked_at", null)
    .in("roles.code", ["admin", "super_admin"]);
  if (error) {
    console.error("Failed to load admins for notification:", error.message);
    return;
  }
  const adminIds = Array.from(
    new Set((data ?? []).map((row) => row.user_id as string).filter(Boolean))
  );
  if (adminIds.length === 0) return;

  await createNotificationsForUsers(adminIds, {
    type: "tournament_registration",
    title: "Pendaftaran Baru Menunggu Persetujuan",
    message: `Pendaftaran baru untuk "${tournamentTitle}" menunggu persetujuan Anda.`,
    data: { tournamentId, tournamentTitle, entryId },
    referenceId: tournamentId,
  });
}
