import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  MATCH_CATEGORY_LABELS,
  logicalMaxPlayers,
  type MatchCategory,
  type MatchParticipantInfo,
  type MatchStatus,
  type OpenMatchDetail,
} from "@/lib/matches/constants";
import { todayInPlatformTimeZone } from "@/lib/utils";

interface MatchRow extends RowDataPacket {
  id: string;
  title: string;
  description: string | null;
  court_id: string | null;
  organizer_id: string;
  match_date: string;
  start_time: string;
  duration_minutes: number;
  current_players: number;
  status: MatchStatus;
  is_private: boolean | number;
  metadata: unknown;
  created_at: string;
  court_name: string | null;
  court_address: string | null;
  organizer_name: string;
}

interface ParticipantRow extends RowDataPacket {
  id: string;
  match_id: string;
  user_id: string;
  is_organizer: boolean;
  team: number;
  metadata: unknown;
  full_name: string | null;
  avatar_url: string | null;
  gender: string | null;
  show_rating: boolean | number | null;
  current_rating: number | string | null;
}

function asObject(value: unknown): Record<string, unknown> {
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

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function categoryOf(value: unknown): MatchCategory {
  return typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(MATCH_CATEGORY_LABELS, value)
    ? (value as MatchCategory)
    : "mens_singles";
}

async function mapMatchRows(
  connection: Connection,
  matches: MatchRow[]
): Promise<OpenMatchDetail[]> {
  if (matches.length === 0) return [];

  const placeholders = matches.map(() => "?").join(", ");
  const [participants] = await connection.execute<ParticipantRow[]>(
    `SELECT participant.id, participant.match_id, participant.user_id,
            participant.is_organizer, participant.team, participant.metadata,
            player.full_name, player.avatar_url, player.gender,
            profile.show_rating, rating.current_rating
     FROM match_participants AS participant
     JOIN users AS player ON player.id = participant.user_id
     LEFT JOIN player_profiles AS profile ON profile.user_id = participant.user_id
     LEFT JOIN player_ratings AS rating ON rating.user_id = participant.user_id
     WHERE participant.match_id IN (${placeholders}) AND participant.left_at IS NULL
     ORDER BY participant.joined_at ASC`,
    matches.map((match) => match.id)
  );

  const byMatch = new Map<string, ParticipantRow[]>();
  for (const participant of participants) {
    const list = byMatch.get(participant.match_id) ?? [];
    list.push(participant);
    byMatch.set(participant.match_id, list);
  }

  return matches.map((match) => {
    const meta = asObject(match.metadata);
    const category = categoryOf(meta.category);
    const maxPlayers = logicalMaxPlayers(category);
    const allParticipants = (byMatch.get(match.id) ?? [])
      .map((row): MatchParticipantInfo => {
        const participantMeta = asObject(row.metadata);
        const status =
          participantMeta.status === "pending" ||
          participantMeta.status === "invited" ||
          participantMeta.status === "rejected"
            ? participantMeta.status
            : "confirmed";
        const isOrganizer = row.is_organizer || row.user_id === match.organizer_id;
        const showRating = Boolean(row.show_rating);
        return {
          id: row.id,
          userId: row.user_id,
          fullName: row.full_name || "Pemain",
          avatarUrl: row.avatar_url,
          gender: row.gender,
          rating: showRating ? Number(row.current_rating ?? 1) : 1,
          showRating,
          isOrganizer,
          status,
          team: (isOrganizer ? 1 : maxPlayers <= 2 ? 2 : row.team === 2 ? 2 : 1) as 1 | 2,
        };
      });
    const activeParticipants = allParticipants.filter(
      (participant) =>
        participant.isOrganizer ||
        participant.status === "confirmed" ||
        participant.status === "pending" ||
        participant.status === "invited"
    );
    const confirmed = activeParticipants.filter((participant) => participant.status === "confirmed");
    const reservedSlots = activeParticipants.filter(
      (participant) => participant.status === "pending" || participant.status === "invited"
    ).length;
    const confirmedSorted = [...confirmed].sort(
      (a, b) =>
        (a.team ?? 1) - (b.team ?? 1) || a.fullName.localeCompare(b.fullName)
    );
    const currentPlayers =
      allParticipants.length > 0 ? confirmed.length : match.current_players;
    const availableSlots = Math.max(0, maxPlayers - currentPlayers - reservedSlots);
    const status: MatchStatus =
      match.status === "open" && availableSlots === 0 ? "full" : match.status;
    const courtName = match.court_name || text(meta.court_name, "Lapangan tidak diketahui");
    const courtAddress =
      match.court_address ||
      text(meta.court_address) ||
      [text(meta.court_city), text(meta.court_province)].filter(Boolean).join(", ");

    return {
      id: match.id,
      title: match.title,
      description: match.description,
      courtId: match.court_id,
      courtName,
      courtAddress,
      province: text(meta.court_province) || null,
      cityName: text(meta.court_city) || null,
      organizerId: match.organizer_id,
      organizerName: match.organizer_name || "Host",
      matchDate: match.match_date,
      startTime: match.start_time,
      durationMinutes: match.duration_minutes,
      category,
      categoryLabel: MATCH_CATEGORY_LABELS[category],
      umpireOption: meta.umpire_option === "dengan_wasit" ? "dengan_wasit" : "tanpa_wasit",
      umpireName: text(meta.umpire_name) || null,
      minRating: Number(meta.min_rating ?? 1),
      maxRating: Number(meta.max_rating ?? 10),
      maxPlayers,
      currentPlayers,
      availableSlots,
      status,
      isPrivate: Boolean(match.is_private),
      participants: confirmedSorted,
      pendingRequests: activeParticipants.filter((participant) => participant.status === "pending"),
      invitedPlayers: activeParticipants.filter((participant) => participant.status === "invited"),
      createdAt: match.created_at,
      raceToScore: Number(meta.race_to ?? 8),
      courtSwitchAt: Number(meta.court_switch_at ?? 4),
      courtSwapped: Boolean(meta.court_swapped),
    };
  });
}

const MATCH_SELECT = `SELECT match_record.id, match_record.title, match_record.description,
            match_record.court_id, match_record.organizer_id,
            DATE_FORMAT(match_record.match_date, '%Y-%m-%d') AS match_date,
            TIME_FORMAT(match_record.start_time, '%H:%i:%s') AS start_time,
            match_record.duration_minutes, match_record.current_players,
            match_record.status, match_record.is_private, match_record.metadata,
            DATE_FORMAT(match_record.created_at, '%Y-%m-%dT%H:%i:%sZ') AS created_at,
            court.name AS court_name, court.address AS court_address,
            organizer.full_name AS organizer_name
     FROM matches AS match_record
     LEFT JOIN tennis_courts AS court ON court.id = match_record.court_id
     JOIN users AS organizer ON organizer.id = match_record.organizer_id`;

export async function getOpenMatchList(
  connection: Connection,
  limit: number,
  matchId?: string
): Promise<OpenMatchDetail[]> {
  const [matches] = await connection.execute<MatchRow[]>(
    `${MATCH_SELECT}
     WHERE match_record.status IN ('open', 'full')
       AND match_record.is_private = FALSE
       AND match_record.match_date >= ?
       AND (? IS NULL OR match_record.id = ?)
     ORDER BY match_record.match_date ASC, match_record.start_time ASC
     LIMIT ?`,
    [todayInPlatformTimeZone(), matchId ?? null, matchId ?? null, limit]
  );
  return mapMatchRows(connection, matches);
}

export async function getMySqlMatchList(
  connection: Connection,
  userId: string,
  limit = 100
): Promise<OpenMatchDetail[]> {
  const [matches] = await connection.execute<MatchRow[]>(
    `${MATCH_SELECT}
     WHERE match_record.organizer_id = ?
        OR EXISTS (
          SELECT 1 FROM match_participants AS participant
          WHERE participant.match_id = match_record.id
            AND participant.user_id = ? AND participant.left_at IS NULL
            AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(participant.metadata, '$.status')), 'confirmed')
                IN ('confirmed', 'invited', 'pending')
        )
     ORDER BY match_record.match_date DESC, match_record.start_time DESC
     LIMIT ?`,
    [userId, userId, limit]
  );
  return mapMatchRows(connection, matches);
}

export async function getMySqlMatchDetail(
  connection: Connection,
  matchId: string,
  userId: string
): Promise<OpenMatchDetail | null> {
  const [matches] = await connection.execute<MatchRow[]>(
    `${MATCH_SELECT}
     WHERE match_record.id = ?
       AND (match_record.organizer_id = ? OR EXISTS (
         SELECT 1 FROM match_participants AS participant
         WHERE participant.match_id = match_record.id
           AND participant.user_id = ? AND participant.left_at IS NULL
           AND COALESCE(JSON_UNQUOTE(JSON_EXTRACT(participant.metadata, '$.status')), 'confirmed')
               IN ('confirmed', 'invited', 'pending')
       ))
     LIMIT 1`,
    [matchId, userId, userId]
  );
  const [match] = await mapMatchRows(connection, matches);
  return match ?? null;
}

export async function getOpenMatchDetail(
  connection: Connection,
  matchId: string
): Promise<OpenMatchDetail | null> {
  const [match] = await getOpenMatchList(connection, 1, matchId);
  return match ?? null;
}
