import { NextResponse } from "next/server";
import type { RowDataPacket } from "mysql2/promise";
import { getCurrentUser } from "@/lib/auth/supabase-session";
import type { Connection } from "mysql2/promise";
import { withMatchTransaction } from "@/lib/mysql/match-route";
import { getMySqlMatchResult } from "@/lib/mysql/result-service";
import { signAssetReadUrls } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const user = await getCurrentUser();
  const userId = user?.id;
  if (!userId) {
    return NextResponse.json({ success: false, message: "Harus login." }, { status: 401 });
  }
  return withMatchTransaction(
    "mysql.match.result.get",
    { matchId: params.id, userId },
    async (connection) => {
      const result = await getMySqlMatchResult(connection, userId, params.id);
      const match = await getMatchResultContext(connection, userId, params.id);
      return {
        match,
        result: result
          ? { ...result, photoUrls: await signAssetReadUrls(result.photoUrls) }
          : null,
      };
    },
    (data) => NextResponse.json({ success: true, ...data })
  );
}

async function getMatchResultContext(connection: Connection, userId: string, matchId: string) {
  const [rows] = await connection.execute<
    (RowDataPacket & {
      id: string;
      title: string;
      organizer_id: string;
      status: string;
      match_date: string;
      start_time: string;
      race_to: number | null;
      team: number;
    })[]
  >(
    `SELECT match_record.id, match_record.title, match_record.organizer_id,
            match_record.status,
            DATE_FORMAT(match_record.match_date, '%Y-%m-%d') AS match_date,
            TIME_FORMAT(match_record.start_time, '%H:%i:%s') AS start_time,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(match_record.metadata, '$.race_to')) AS UNSIGNED) AS race_to,
            participant.team
     FROM matches AS match_record
     JOIN match_participants AS participant ON participant.match_id = match_record.id
     WHERE match_record.id = ? AND participant.user_id = ? AND participant.left_at IS NULL
     LIMIT 1`,
    [matchId, userId]
  );
  const match = rows[0];
  if (!match) return null;
  return {
    id: match.id,
    title: match.title,
    status: match.status,
    matchDate: match.match_date,
    startTime: match.start_time,
    raceToScore: Number(match.race_to ?? 8),
    isOrganizer: match.organizer_id === userId,
    viewerTeam: match.team === 2 ? 2 : 1,
  };
}
