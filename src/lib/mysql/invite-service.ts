import type { Connection, RowDataPacket } from "mysql2/promise";
import { MATCH_CATEGORY_LABELS } from "@/lib/matches/constants";

interface InvitationRow extends RowDataPacket {
  participant_id: string;
  match_id: string;
  title: string;
  category: string;
  match_date: string;
  start_time: string;
  court_name: string | null;
  organizer_name: string;
}

export async function getMySqlInvitations(connection: Connection, userId: string) {
  const [rows] = await connection.execute<InvitationRow[]>(
    `SELECT participant.id AS participant_id, match_record.id AS match_id,
            match_record.title,
            JSON_UNQUOTE(JSON_EXTRACT(match_record.metadata, '$.category')) AS category,
            DATE_FORMAT(match_record.match_date, '%Y-%m-%d') AS match_date,
            TIME_FORMAT(match_record.start_time, '%H:%i:%s') AS start_time,
            COALESCE(court.name, JSON_UNQUOTE(JSON_EXTRACT(match_record.metadata, '$.court_name'))) AS court_name,
            organizer.full_name AS organizer_name
     FROM match_participants AS participant
     JOIN matches AS match_record ON match_record.id = participant.match_id
     JOIN users AS organizer ON organizer.id = match_record.organizer_id
     LEFT JOIN tennis_courts AS court ON court.id = match_record.court_id
     WHERE participant.user_id = ? AND participant.left_at IS NULL
       AND JSON_UNQUOTE(JSON_EXTRACT(participant.metadata, '$.status')) = 'invited'
       AND match_record.status = 'open'
     ORDER BY match_record.match_date ASC, match_record.start_time ASC`,
    [userId]
  );

  return rows.map((row) => {
    const category = Object.prototype.hasOwnProperty.call(MATCH_CATEGORY_LABELS, row.category)
      ? (row.category as keyof typeof MATCH_CATEGORY_LABELS)
      : "mens_singles";
    return {
      participantId: row.participant_id,
      matchId: row.match_id,
      title: row.title,
      categoryLabel: MATCH_CATEGORY_LABELS[category],
      matchDate: row.match_date,
      startTime: row.start_time,
      courtName: row.court_name || "Lapangan belum ditentukan",
      organizerName: row.organizer_name || "Penyelenggara",
    };
  });
}
