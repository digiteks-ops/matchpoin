import { randomUUID } from "node:crypto";
import type { Connection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import {
  notifyPlayerJoined,
  notifyChallengeResponse,
  notifyMatchCancelled,
  notifyMatchChallenge,
} from "@/lib/notifications/notification-service";

interface MatchRow extends RowDataPacket {
  id: string;
  organizer_id: string;
  status: string;
  metadata: unknown;
}

interface RosterCounts extends RowDataPacket {
  team1: number;
  team2: number;
  total: number;
}

interface ParticipantCount extends RowDataPacket {
  total: number;
}

interface MatchParticipantRow extends RowDataPacket {
  id: string;
  match_id: string;
  user_id: string;
  team: number;
  is_organizer: boolean;
  metadata: unknown;
}

interface MatchRosterCounts extends RowDataPacket {
  confirmed: number;
  invited: number;
  team1: number;
  team2: number;
}

interface InviteTargetRow extends RowDataPacket {
  is_profile_public: boolean;
  allow_invites: boolean;
}

export class MatchWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchWorkflowError";
  }
}

function metadataObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function logicalCapacity(metadata: unknown): number {
  const category = metadataObject(metadata).category;
  return typeof category === "string" && category.includes("doubles") ? 4 : 2;
}

async function lockMatch(connection: Connection, matchId: string): Promise<MatchRow> {
  const [matches] = await connection.execute<MatchRow[]>(
    "SELECT id, organizer_id, status, metadata FROM matches WHERE id = ? FOR UPDATE",
    [matchId]
  );
  const match = matches[0];
  if (!match) throw new MatchWorkflowError("Pertandingan tidak ditemukan.");
  return match;
}

async function getMatchRosterCounts(
  connection: Connection,
  matchId: string
): Promise<MatchRosterCounts> {
  const [rows] = await connection.execute<MatchRosterCounts[]>(
    `SELECT
       SUM(CASE WHEN is_organizer = TRUE OR
         COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.status')), 'confirmed') = 'confirmed'
         THEN 1 ELSE 0 END) AS confirmed,
       SUM(CASE WHEN JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.status')) = 'invited'
         THEN 1 ELSE 0 END) AS invited,
       SUM(CASE WHEN COALESCE(team, 1) <> 2 AND
         (is_organizer = TRUE OR
          COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.status')), 'confirmed') = 'confirmed')
         THEN 1 ELSE 0 END) AS team1,
       SUM(CASE WHEN COALESCE(team, 1) = 2 AND
         (is_organizer = TRUE OR
          COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.status')), 'confirmed') = 'confirmed')
         THEN 1 ELSE 0 END) AS team2
     FROM match_participants
     WHERE match_id = ? AND left_at IS NULL`,
    [matchId]
  );
  const counts = rows[0];
  return {
    confirmed: Number(counts?.confirmed ?? 0),
    invited: Number(counts?.invited ?? 0),
    team1: Number(counts?.team1 ?? 0),
    team2: Number(counts?.team2 ?? 0),
  } as MatchRosterCounts;
}

async function assertMatchOrganizer(
  match: MatchRow,
  organizerId: string
): Promise<void> {
  if (match.organizer_id !== organizerId) {
    throw new MatchWorkflowError("Hanya penyelenggara pertandingan yang dapat melakukan tindakan ini.");
  }
}

export async function acceptMatchParticipant(
  connection: Connection,
  matchId: string,
  organizerId: string,
  participantUserId: string
): Promise<void> {
  const match = await lockMatch(connection, matchId);
  await assertMatchOrganizer(match, organizerId);
  if (match.status !== "open") {
    throw new MatchWorkflowError("Pendaftaran pertandingan ini sudah ditutup.");
  }

  const capacity = logicalCapacity(match.metadata);
  const counts = await getMatchRosterCounts(connection, matchId);
  if (counts.confirmed + counts.invited >= capacity) {
    throw new MatchWorkflowError("Slot pertandingan sudah penuh.");
  }

  const [rows] = await connection.execute<MatchParticipantRow[]>(
    `SELECT id, user_id, team, is_organizer, metadata
     FROM match_participants
     WHERE match_id = ? AND user_id = ? AND is_organizer = FALSE AND left_at IS NULL
     LIMIT 1 FOR UPDATE`,
    [matchId, participantUserId]
  );
  const participant = rows[0];
  if (!participant) throw new MatchWorkflowError("Permohonan peserta tidak ditemukan.");
  const metadata = metadataObject(participant.metadata);
  if (metadata.status !== "pending") {
    throw new MatchWorkflowError("Permohonan ini sudah diproses.");
  }

  const team: 1 | 2 =
    capacity <= 2 ? 2 : counts.team1 < capacity / 2 && counts.team1 <= counts.team2 ? 1 : 2;
await connection.execute(
     `UPDATE match_participants
      SET metadata = ?, confirmed_at = UTC_TIMESTAMP(), team = ?
      WHERE id = ?`,
     [JSON.stringify({ ...metadata, status: "confirmed" }), team, participant.id]
   );
   const newCount = counts.confirmed + 1;
   await connection.execute(
     "UPDATE matches SET current_players = ?, status = ? WHERE id = ?",
     [newCount, newCount >= capacity ? "full" : "open", matchId]
   );
   // Notify participant that their request was accepted
   await notifyChallengeResponse(participantUserId, matchId, true);
 }

export async function rejectMatchParticipant(
  connection: Connection,
  matchId: string,
  organizerId: string,
  participantUserId: string
): Promise<void> {
  const match = await lockMatch(connection, matchId);
  await assertMatchOrganizer(match, organizerId);
  const [rows] = await connection.execute<MatchParticipantRow[]>(
    `SELECT id, user_id, team, is_organizer, metadata
     FROM match_participants
     WHERE match_id = ? AND user_id = ? AND is_organizer = FALSE AND left_at IS NULL
     LIMIT 1 FOR UPDATE`,
    [matchId, participantUserId]
  );
  const participant = rows[0];
  if (!participant) throw new MatchWorkflowError("Peserta tidak ditemukan.");
  const metadata = metadataObject(participant.metadata);
await connection.execute(
     "UPDATE match_participants SET metadata = ? WHERE id = ?",
     [JSON.stringify({ ...metadata, status: "rejected" }), participant.id]
   );
   const counts = await getMatchRosterCounts(connection, matchId);
   await connection.execute(
     "UPDATE matches SET current_players = ? WHERE id = ?",
     [counts.confirmed, matchId]
   );
   // Notify participant that their request was rejected
   await notifyChallengeResponse(participantUserId, matchId, false);
 }

export async function cancelMySqlMatch(
  connection: Connection,
  matchId: string,
  organizerId: string,
  reason?: string
): Promise<void> {
  const match = await lockMatch(connection, matchId);
  await assertMatchOrganizer(match, organizerId);
  if (match.status !== "open" && match.status !== "full") {
    throw new MatchWorkflowError("Pertandingan ini tidak dapat dibatalkan pada status saat ini.");
  }
const [result] = await connection.execute<ResultSetHeader>(
     `UPDATE matches
      SET status = 'cancelled',
          cancellation_reason = ?,
          cancelled_at = UTC_TIMESTAMP(),
          cancelled_by = ?
      WHERE id = ?`,
     [reason?.trim() || "Dibatalkan oleh penyelenggara pertandingan.", organizerId, matchId]
   );
   if (result.affectedRows === 0) throw new MatchWorkflowError("Pertandingan tidak dapat dibatalkan.");

   // Notify all participants
   const [participants] = await connection.execute<MatchParticipantRow[]>(
     `SELECT user_id FROM match_participants WHERE match_id = ? AND left_at IS NULL`,
     [matchId]
   );
   const participantIds = participants.map((p) => p.user_id);
   const matchTitle = match.metadata && typeof match.metadata === "object" && "title" in match.metadata
     ? String(match.metadata.title)
     : "Match";
   await notifyMatchCancelled(participantIds, matchId, matchTitle, reason ?? "Dibatalkan oleh penyelenggara pertandingan.");
 }

export async function invitePlayerToMySqlMatch(
  connection: Connection,
  matchId: string,
  organizerId: string,
  inviteeId: string
): Promise<string> {
  if (organizerId === inviteeId) throw new MatchWorkflowError("Tidak dapat mengundang diri sendiri.");
  const match = await lockMatch(connection, matchId);
  await assertMatchOrganizer(match, organizerId);
  if (match.status !== "open") {
    throw new MatchWorkflowError("Undangan hanya dapat dikirim untuk pertandingan yang masih dibuka.");
  }

  const [played] = await connection.execute<ParticipantCount[]>(
    `SELECT COUNT(DISTINCT result.match_id) AS total
     FROM match_results AS result
     JOIN match_participants AS organizer
       ON organizer.match_id = result.match_id AND organizer.user_id = ?
     JOIN match_participants AS invitee
       ON invitee.match_id = result.match_id AND invitee.user_id = ?
     WHERE result.status = 'confirmed'`,
    [organizerId, inviteeId]
  );
  if (Number(played[0]?.total ?? 0) > 0) {
    throw new MatchWorkflowError("Anda sudah pernah bertanding dengan pemain ini. Anti-rematch aktif.");
  }

  const [existing] = await connection.execute<MatchParticipantRow[]>(
    `SELECT id, user_id, team, is_organizer, metadata
     FROM match_participants WHERE match_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
    [matchId, inviteeId]
  );
  if (existing[0]) {
    const status = metadataObject(existing[0].metadata).status;
    throw new MatchWorkflowError(
      status === "invited"
        ? "Pemain ini sudah diundang."
        : status === "confirmed"
        ? "Pemain ini sudah menjadi peserta."
        : "Pemain ini sudah pernah diundang."
    );
  }

  const [profiles] = await connection.execute<InviteTargetRow[]>(
    "SELECT is_profile_public, allow_invites FROM player_profiles WHERE user_id = ? LIMIT 1",
    [inviteeId]
  );
  if (!profiles[0]) throw new MatchWorkflowError("Pemain tidak ditemukan.");
  if (!profiles[0].is_profile_public || !profiles[0].allow_invites) {
    throw new MatchWorkflowError("Pemain ini tidak menerima undangan.");
  }

  const counts = await getMatchRosterCounts(connection, matchId);
  const capacity = logicalCapacity(match.metadata);
  if (counts.confirmed + counts.invited >= capacity) {
    throw new MatchWorkflowError("Slot pertandingan sudah penuh.");
  }
  const team: 1 | 2 =
    capacity <= 2 ? 2 : counts.team1 <= counts.team2 ? 1 : 2;
  const inviteId = randomUUID();
  await connection.execute(
    `INSERT INTO match_participants
       (id, match_id, user_id, is_organizer, team, metadata)
     VALUES (?, ?, ?, FALSE, ?, ?)`,
    [
      inviteId,
      matchId,
      inviteeId,
      team,
      JSON.stringify({
        status: "invited",
        invited_by: organizerId,
        invited_at: new Date().toISOString(),
      }),
    ]
  );
  await connection.execute(
    "UPDATE matches SET current_players = ? WHERE id = ?",
    [counts.confirmed, matchId]
  );

// Notify invitee of the challenge
   const matchTitle1 = match.metadata && typeof match.metadata === "object" && "title" in match.metadata
     ? String(match.metadata.title)
     : "Match";
   await notifyMatchChallenge(organizerId, inviteeId, matchId, matchTitle1);

  return inviteId;
}

export async function respondToMySqlInvite(
  connection: Connection,
  participantId: string,
  userId: string,
  action: "accept" | "decline"
): Promise<void> {
  const [inviteReferences] = await connection.execute<MatchParticipantRow[]>(
    `SELECT id, match_id, user_id, team, is_organizer, metadata
     FROM match_participants WHERE id = ? LIMIT 1`,
    [participantId]
  );
  if (!inviteReferences[0]) throw new MatchWorkflowError("Undangan tidak ditemukan.");
  const match = await lockMatch(connection, inviteReferences[0].match_id);
  const [rows] = await connection.execute<MatchParticipantRow[]>(
    `SELECT id, match_id, user_id, team, is_organizer, metadata
     FROM match_participants WHERE id = ? LIMIT 1 FOR UPDATE`,
    [participantId]
  );
  const invite = rows[0];
  if (!invite) throw new MatchWorkflowError("Undangan tidak ditemukan.");
  if (invite.user_id !== userId) throw new MatchWorkflowError("Anda tidak berhak menanggapi undangan ini.");
  const inviteMetadata = metadataObject(invite.metadata);
  if (inviteMetadata.status !== "invited") {
    throw new MatchWorkflowError("Undangan ini sudah ditanggapi.");
  }

  if (action === "decline") {
    await connection.execute(
      "UPDATE match_participants SET metadata = ? WHERE id = ?",
      [JSON.stringify({ ...inviteMetadata, status: "declined" }), participantId]
    );
    // Notify organizer that invite was declined
    await notifyChallengeResponse(inviteMetadata.invited_by as string, invite.match_id, false);
    return;
  }
  if (match.status === "cancelled") throw new MatchWorkflowError("Pertandingan telah dibatalkan.");
  if (match.status === "completed") throw new MatchWorkflowError("Pertandingan telah selesai.");
  if (match.status !== "open") {
    throw new MatchWorkflowError("Pendaftaran pertandingan ini sudah ditutup.");
  }

  const capacity = logicalCapacity(match.metadata);
  const counts = await getMatchRosterCounts(connection, invite.match_id);
  if (counts.confirmed + 1 > capacity) throw new MatchWorkflowError("Slot pertandingan sudah penuh.");
  const team: 1 | 2 =
    capacity <= 2
      ? 2
      : counts.team1 < Math.ceil(capacity / 2) && counts.team1 <= counts.team2
      ? 1
      : counts.team1 >= Math.ceil(capacity / 2)
      ? 2
      : 1;
await connection.execute(
     `UPDATE match_participants
      SET metadata = ?, confirmed_at = UTC_TIMESTAMP(), team = ?
      WHERE id = ?`,
     [JSON.stringify({ ...inviteMetadata, status: "confirmed" }), team, participantId]
   );
   const currentPlayers = counts.confirmed + 1;
   await connection.execute(
     "UPDATE matches SET current_players = ?, status = ? WHERE id = ?",
     [currentPlayers, currentPlayers >= capacity ? "full" : "open", invite.match_id]
   );

   // Notify organizer that invite was accepted
   await notifyChallengeResponse(inviteMetadata.invited_by as string, invite.match_id, true);
 }

export async function joinMySqlMatch(
  connection: Connection,
  matchId: string,
  userId: string
): Promise<{ team: 1 | 2; status: "open" | "full" }> {
  const match = await lockMatch(connection, matchId);
  if (match.organizer_id === userId) {
    throw new MatchWorkflowError("Anda adalah penyelenggara pertandingan ini.");
  }
  if (match.status === "cancelled") {
    throw new MatchWorkflowError("Pertandingan ini telah dibatalkan.");
  }
  if (match.status === "completed") {
    throw new MatchWorkflowError("Pertandingan ini telah selesai.");
  }
  if (match.status === "in_progress") {
    throw new MatchWorkflowError("Pertandingan ini sedang berlangsung.");
  }
  if (match.status === "full") {
    throw new MatchWorkflowError("Slot pertandingan sudah penuh.");
  }

  const [existing] = await connection.execute<ParticipantCount[]>(
    `SELECT COUNT(*) AS total FROM match_participants
     WHERE match_id = ? AND user_id = ? AND left_at IS NULL`,
    [matchId, userId]
  );
  if (Number(existing[0]?.total ?? 0) > 0) {
    throw new MatchWorkflowError("Anda sudah terdaftar pada pertandingan ini.");
  }

  const capacity = logicalCapacity(match.metadata);
  const [counts] = await connection.execute<RosterCounts[]>(
    `SELECT
       SUM(CASE WHEN COALESCE(team, 1) <> 2 THEN 1 ELSE 0 END) AS team1,
       SUM(CASE WHEN COALESCE(team, 1) = 2 THEN 1 ELSE 0 END) AS team2,
       COUNT(*) AS total
     FROM match_participants
     WHERE match_id = ? AND left_at IS NULL
       AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.status')), 'confirmed')
           IN ('confirmed', 'invited')`,
    [matchId]
  );
  const roster = counts[0];
  const team1 = Number(roster?.team1 ?? 0);
  const team2 = Number(roster?.team2 ?? 0);
  const total = Number(roster?.total ?? 0);
  if (total >= capacity) throw new MatchWorkflowError("Slot pertandingan sudah penuh.");

  const targetTeam: 1 | 2 =
    capacity === 2 ? 2 : team2 < capacity / 2 ? 2 : team1 < capacity / 2 ? 1 : 2;
  if ((targetTeam === 2 && team2 >= capacity / 2) || (targetTeam === 1 && team1 >= capacity / 2)) {
    throw new MatchWorkflowError("Slot pertandingan sudah penuh.");
  }

await connection.execute(
     `INSERT INTO match_participants
        (id, match_id, user_id, is_organizer, team, metadata, confirmed_at)
      VALUES (?, ?, ?, FALSE, ?, ?, UTC_TIMESTAMP())`,
     [
       randomUUID(),
       matchId,
       userId,
       targetTeam,
       JSON.stringify({ status: "confirmed", joined_via: "open_match" }),
     ]
   );
   const newTotal = total + 1;
   const status = newTotal >= capacity ? "full" : "open";
   const [activeRows] = await connection.execute<ParticipantCount[]>(
     "SELECT COUNT(*) AS total FROM match_participants WHERE match_id = ? AND left_at IS NULL",
     [matchId]
   );
   await connection.execute(
     "UPDATE matches SET status = ?, current_players = ? WHERE id = ?",
     [status, Number(activeRows[0]?.total ?? 0), matchId]
   );

// Notify organizer that a player joined
    const matchTitle2 = match.metadata && typeof match.metadata === "object" && "title" in match.metadata
      ? String(match.metadata.title)
      : "Match";
    await notifyPlayerJoined(match.organizer_id, userId, matchId, matchTitle2);

   return { team: targetTeam, status };
 }

export async function leaveMySqlMatch(
  connection: Connection,
  matchId: string,
  userId: string
): Promise<{ remaining: number }> {
  const match = await lockMatch(connection, matchId);
  if (match.organizer_id === userId) {
    throw new MatchWorkflowError(
      "Penyelenggara tidak dapat keluar. Batalkan pertandingan jika diperlukan."
    );
  }
  if (match.status === "completed" || match.status === "cancelled") {
    throw new MatchWorkflowError("Pertandingan yang sudah selesai tidak dapat diubah.");
  }

  const [deleteResult] = await connection.execute<ResultSetHeader>(
    `DELETE FROM match_participants
     WHERE match_id = ? AND user_id = ? AND is_organizer = FALSE`,
    [matchId, userId]
  );
  if (deleteResult.affectedRows === 0) {
    throw new MatchWorkflowError("Anda bukan peserta pertandingan ini.");
  }

  const [remainingRows] = await connection.execute<ParticipantCount[]>(
    `SELECT COUNT(*) AS total FROM match_participants
     WHERE match_id = ? AND left_at IS NULL
       AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.status')), 'confirmed')
           IN ('confirmed', 'invited')`,
    [matchId]
  );
  const remaining = Number(remainingRows[0]?.total ?? 0);
  const capacity = logicalCapacity(match.metadata);
  const [activeRows] = await connection.execute<ParticipantCount[]>(
    "SELECT COUNT(*) AS total FROM match_participants WHERE match_id = ? AND left_at IS NULL",
    [matchId]
  );
  await connection.execute(
    `UPDATE matches
     SET status = CASE WHEN ? < ? THEN 'open' ELSE status END,
         current_players = ?
     WHERE id = ?`,
    [remaining, capacity, Number(activeRows[0]?.total ?? 0), matchId]
  );
  return { remaining };
}
