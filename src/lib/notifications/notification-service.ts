import { randomUUID } from "node:crypto";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import type { RowDataPacket } from "mysql2/promise";

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
  referenceId?: string; // match_id, tournament_id, etc.
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

export async function createNotification(
  userId: string,
  payload: NotificationPayload
): Promise<string> {
  const notificationId = randomUUID();
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;

  try {
    connection = await connectToMySql();
    await connection.execute(
      `INSERT INTO notifications (id, user_id, type, title, message, data, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
      [
        notificationId,
        userId,
        payload.type,
        payload.title,
        payload.message,
        payload.data ? JSON.stringify(payload.data) : null,
      ]
    );

    // Broadcast to Supabase Realtime
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
  } finally {
    if (connection) await connection.end();
  }
}

export async function createNotificationsForUsers(
  userIds: string[],
  payload: NotificationPayload
): Promise<string[]> {
  const notificationIds: string[] = [];
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;

  try {
    connection = await connectToMySql();
    await connection.beginTransaction();

    for (const userId of userIds) {
      const notificationId = randomUUID();
      notificationIds.push(notificationId);
      await connection.execute(
        `INSERT INTO notifications (id, user_id, type, title, message, data, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, NOW())`,
        [
          notificationId,
          userId,
          payload.type,
          payload.title,
          payload.message,
          payload.data ? JSON.stringify(payload.data) : null,
        ]
      );
    }

    await connection.commit();

    // Broadcast to each user
    await Promise.all(
      userIds.map((userId) =>
        broadcastNotification(userId, {
          id: notificationIds[userIds.indexOf(userId)],
          type: payload.type,
          title: payload.title,
          message: payload.message,
          data: payload.data,
          referenceId: payload.referenceId,
          createdAt: new Date().toISOString(),
          isRead: false,
        })
      )
    );

    return notificationIds;
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.end();
  }
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
    // Don't wait for unsubscribe - fire and forget for low latency
    setTimeout(() => channel.unsubscribe(), 100);
  } catch (error) {
    // Log but don't throw - notification is already in MySQL
    console.error("Realtime broadcast failed:", error);
  }
}

export async function markNotificationRead(
  userId: string,
  notificationId: string
): Promise<void> {
  const connection = await connectToMySql();
  try {
    await connection.execute(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [notificationId, userId]
    );
  } finally {
    await connection.end();
  }
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const connection = await connectToMySql();
  try {
    await connection.execute(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
      [userId]
    );
  } finally {
    await connection.end();
  }
}

export async function getUserNotifications(
  userId: string,
  limit = 50,
  offset = 0,
  unreadOnly = false
): Promise<Array<{
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
  referenceId: string | null;
}>> {
  const connection = await connectToMySql();
  try {
    const whereClause = unreadOnly ? "AND is_read = 0" : "";
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT id, type, title, message, data, is_read, created_at, reference_id
       FROM notifications
       WHERE user_id = ? ${whereClause}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, limit, offset]
    );
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      title: row.title,
      message: row.message,
      data: row.data ? JSON.parse(row.data) : null,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at,
      referenceId: row.reference_id ?? null,
    }));
  } finally {
    await connection.end();
  }
}

export async function getUnreadCount(userId: string): Promise<number> {
  const connection = await connectToMySql();
  try {
    const [rows] = await connection.execute<RowDataPacket[]>(
      "SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0",
      [userId]
    );
    return rows[0]?.count ?? 0;
  } finally {
    await connection.end();
  }
}

// Convenience functions for common notification types
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

export async function notifySuperAdminsPendingRegistration(
  tournamentId: string,
  tournamentTitle: string,
  entryId: string
): Promise<void> {
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT u.id FROM users AS u
       JOIN user_roles AS ur ON ur.user_id = u.id
       JOIN roles AS ro ON ro.id = ur.role_id
       WHERE ro.code = 'super_admin' AND ur.revoked_at IS NULL`
    );
    const superAdminIds = rows.map((row) => row.id);
    if (superAdminIds.length > 0) {
      await createNotificationsForUsers(superAdminIds, {
        type: "tournament_registration",
        title: "Pendaftaran Baru Menunggu Persetujuan",
        message: `Pendaftaran baru untuk "${tournamentTitle}" menunggu persetujuan Anda.`,
        data: { tournamentId, tournamentTitle, entryId },
        referenceId: tournamentId,
      });
    }
  } finally {
    if (connection) await connection.end();
  }
}