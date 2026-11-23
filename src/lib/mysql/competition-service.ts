import { randomUUID } from "node:crypto";
import type { Connection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { todayInPlatformTimeZone } from "@/lib/utils";
import {
  notifyTournamentRegistration,
  notifyAdminsPendingRegistration,
} from "@/lib/notifications/notification-service";
import {
  evaluateLeagueRegistration,
  inferCategory,
  isDoubles,
  isValidId,
  normalizeId,
} from "./competition-registration-core.mjs";

interface TournamentRow extends RowDataPacket {
  id: string;
  name: string;
  category: string | null;
  max_participants: number;
  status: string;
  registration_deadline: string | null;
}

interface UserRow extends RowDataPacket {
  id: string;
  gender: string | null;
}

interface CountRow extends RowDataPacket {
  entries: number;
}

interface IdRow extends RowDataPacket {
  id: string;
}

interface LeagueOverviewRow extends RowDataPacket {
  id: string;
  name: string;
  category: string;
  season: string | null;
  start_date: string;
  end_date: string;
  status: string;
  max_participants: number;
}

interface LeagueParticipantRow extends RowDataPacket {
  entry_id: string;
  user_id: string;
  joined_at: string | null;
  display_name: string | null;
  avatar_url: string | null;
  province: string | null;
  city_name: string | null;
}

interface LeagueStandingRow extends RowDataPacket {
  entry_id: string;
  position: number | null;
  played: number;
  won: number;
  lost: number;
  games_won: number;
  games_lost: number;
  game_diff: number;
  points: number;
  needs_tiebreak: boolean | number;
}

interface TournamentListRow extends RowDataPacket {
  id: string;
  name: string;
  category: string | null;
  season: string | null;
  start_date: string;
  end_date: string;
  status: string;
  max_participants: number;
  registration_count: number;
  is_registered: number | boolean;
}

interface PartnerRow extends RowDataPacket {
  id: string;
  name: string | null;
}

type RegistrationResult =
  | { success: true; entryId: string; category: string; message: string }
  | { success: false; message: string };

export async function getMySqlTournamentList(
  connection: Connection,
  userId: string | null
) {
  const [rows] = await connection.execute<TournamentListRow[]>(
    `SELECT tournament.id, tournament.name, tournament.category, tournament.season,
            DATE_FORMAT(tournament.start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(tournament.end_date, '%Y-%m-%d') AS end_date,
            tournament.status, tournament.max_participants,
            (SELECT COUNT(DISTINCT entry.entry_id)
             FROM tournament_participants AS entry
             WHERE entry.tournament_id = tournament.id AND entry.status <> 'rejected')
              AS registration_count,
            EXISTS (
              SELECT 1 FROM tournament_participants AS own_entry
              WHERE own_entry.tournament_id = tournament.id
                AND own_entry.user_id = ? AND own_entry.status <> 'rejected'
            ) AS is_registered
     FROM tournaments AS tournament
     WHERE tournament.is_league = TRUE
     ORDER BY tournament.start_date ASC, tournament.name ASC`,
    [userId]
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    category: row.category ?? "mens_singles",
    season: row.season ?? "Q1 2027",
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    max_participants: Number(row.max_participants),
    registration_count: Number(row.registration_count),
    is_registered: Boolean(row.is_registered),
  }));
}

export async function getMySqlTournamentPartners(
  connection: Connection,
  tournamentId: string,
  userId: string
) {
  const [tournaments] = await connection.execute<IdRow[]>(
    "SELECT id FROM tournaments WHERE id = ? AND is_league = TRUE LIMIT 1",
    [tournamentId]
  );
  if (!tournaments[0]) return null;
  const [partners] = await connection.execute<PartnerRow[]>(
    `SELECT player.id, COALESCE(profile.display_name, player.full_name) AS name
     FROM users AS player
     JOIN player_profiles AS profile ON profile.user_id = player.id
     WHERE player.id <> ?
       AND profile.is_profile_public = TRUE
       AND profile.profile_visibility = 'public'
       AND NOT EXISTS (
         SELECT 1 FROM tournament_participants AS entry
         WHERE entry.tournament_id = ? AND entry.user_id = player.id
           AND entry.status <> 'rejected'
       )
     ORDER BY name ASC
     LIMIT 100`,
    [userId, tournamentId]
  );
  return partners.map((partner) => ({
    id: partner.id,
    name: partner.name || "Pemain MATCHPOIN",
  }));
}

export async function getLeagueOverview(connection: Connection, category: string) {
  const [leagues] = await connection.execute<LeagueOverviewRow[]>(
    `SELECT id, name, category, season,
            DATE_FORMAT(start_date, '%Y-%m-%d') AS start_date,
            DATE_FORMAT(end_date, '%Y-%m-%d') AS end_date,
            status, max_participants
     FROM tournaments
     WHERE category = ? AND is_league = TRUE
     ORDER BY start_date ASC
     LIMIT 1`,
    [category]
  );
  const league = leagues[0];
  if (!league) return { league: null, participants: [], standings: [] };

  const [participants] = await connection.execute<LeagueParticipantRow[]>(
    `SELECT entry.entry_id, entry.user_id,
            DATE_FORMAT(entry.joined_at, '%Y-%m-%dT%H:%i:%sZ') AS joined_at,
            player.display_name, player.avatar_url, player.province, player.city_name
     FROM tournament_participants AS entry
     LEFT JOIN public_players AS player ON player.user_id = entry.user_id
     WHERE entry.tournament_id = ? AND entry.status <> 'rejected'
     ORDER BY entry.joined_at ASC, entry.id ASC`,
    [league.id]
  );

  const [standingRows] = await connection.execute<LeagueStandingRow[]>(
    `SELECT entry_id, position, played, won, lost, games_won, games_lost,
            game_diff, points, needs_tiebreak
     FROM league_standings
     WHERE tournament_id = ?
     ORDER BY position ASC, entry_id ASC`,
    [league.id]
  );

  const namesByEntry = new Map<string, LeagueParticipantRow[]>();
  for (const participant of participants) {
    const entryParticipants = namesByEntry.get(participant.entry_id) ?? [];
    entryParticipants.push(participant);
    namesByEntry.set(participant.entry_id, entryParticipants);
  }

  const mapStanding = (entryId: string, values?: LeagueStandingRow, rank = 0) => {
    const entryParticipants = namesByEntry.get(entryId) ?? [];
    const first = entryParticipants[0];
    const name = entryParticipants
      .map((participant) => participant.display_name)
      .filter((displayName): displayName is string => Boolean(displayName))
      .join(" & ");
    return {
      entryId,
      name: name || "Peserta",
      avatarUrl: first?.avatar_url ?? null,
      province: first?.province ?? null,
      cityName: first?.city_name ?? null,
      points: Number(values?.points ?? 0),
      wins: Number(values?.won ?? 0),
      losses: Number(values?.lost ?? 0),
      matchesPlayed: Number(values?.played ?? 0),
      gamesFor: Number(values?.games_won ?? 0),
      gamesAgainst: Number(values?.games_lost ?? 0),
      gameDiff: Number(values?.game_diff ?? 0),
      rank: Number(values?.position && values.position > 0 ? values.position : rank),
      needsTiebreak: Boolean(values?.needs_tiebreak),
    };
  };

  const standings =
    standingRows.length > 0
      ? standingRows.map((row, index) => mapStanding(row.entry_id, row, index + 1))
      : Array.from(namesByEntry.keys()).map((entryId, index) =>
          mapStanding(entryId, undefined, index + 1)
        );

  return {
    league: { ...league, season: league.season ?? "" },
    participants: participants.map((participant) => ({
      userId: participant.user_id,
      name: participant.display_name ?? "Pemain MATCHPOIN",
      avatarUrl: participant.avatar_url,
      province: participant.province,
      cityName: participant.city_name,
      joinedAt: participant.joined_at,
    })),
    standings,
  };
}

export async function registerForCompetition(
  connection: Connection,
  userId: string,
  tournamentId: string,
  partnerUserId: string | null
): Promise<RegistrationResult> {
  const leagueId = normalizeId(tournamentId);
  if (!isValidId(leagueId)) {
    return { success: false, message: "ID Liga tidak valid." };
  }

  const [tournaments] = await connection.execute<TournamentRow[]>(
    `SELECT id, name, category, max_participants, status,
            DATE_FORMAT(registration_deadline, '%Y-%m-%d') AS registration_deadline
     FROM tournaments
     WHERE id = ? AND is_league = TRUE
     FOR UPDATE`,
    [leagueId]
  );
  const tournament = tournaments[0];
  if (!tournament) return { success: false, message: "Liga tidak ditemukan." };

  const category = tournament.category || inferCategory(tournament.name);
  const doubles = isDoubles(category);

  // Duplicate check is PER CATEGORY: a player may enter several categories
  // (e.g. Single Man + Double Man), so only rows of this category count.
  const [existingEntries] = await connection.execute<RowDataPacket[]>(
    `SELECT user_id
     FROM tournament_participants
     WHERE tournament_id = ? AND category = ? AND user_id IN (?, ?) AND status <> 'rejected'`,
    [leagueId, category, userId, partnerUserId ?? userId]
  );
  const registeredUserIds = existingEntries.map((entry) => String(entry.user_id));

  let partnerExists = true;
  let partnerGender: string | null = null;
  if (doubles && partnerUserId) {
    const [partners] = await connection.execute<UserRow[]>(
      "SELECT id, gender FROM users WHERE id = ? LIMIT 1",
      [partnerUserId]
    );
    partnerExists = Boolean(partners[0]);
    partnerGender = partners[0]?.gender ?? null;
  }

  let userExists = true;
  let userGender: string | null = null;
  if (category === "mixed_doubles" && partnerUserId) {
    const [users] = await connection.execute<UserRow[]>(
      "SELECT id, gender FROM users WHERE id = ? LIMIT 1",
      [userId]
    );
    userExists = Boolean(users[0]);
    userGender = users[0]?.gender ?? null;
  }

  const [counts] = await connection.execute<CountRow[]>(
    `SELECT COUNT(DISTINCT entry_id) AS entries
     FROM tournament_participants
     WHERE tournament_id = ? AND status <> 'rejected'`,
    [leagueId]
  );
  const entryCount = Number(counts[0]?.entries ?? 0);

  const evaluation = evaluateLeagueRegistration({
    tournament,
    userId,
    partnerUserId,
    registeredUserIds,
    entryCount,
    userGender,
    partnerGender,
    userExists,
    partnerExists,
    today: todayInPlatformTimeZone(),
  });
  if (!evaluation.ok) {
    return { success: false, message: evaluation.message };
  }

  const entryId = randomUUID();
  await connection.execute(
    `INSERT INTO tournament_participants
       (id, tournament_id, user_id, category, entry_id, entry_role, partner_user_id, status)
     VALUES (?, ?, ?, ?, ?, 'captain', ?, 'pending')`,
    [randomUUID(), leagueId, userId, evaluation.category, entryId, partnerUserId]
  );

  if (evaluation.doubles && partnerUserId) {
    await connection.execute(
      `INSERT INTO tournament_participants
         (id, tournament_id, user_id, category, entry_id, entry_role, status)
       VALUES (?, ?, ?, ?, ?, 'partner', 'pending')`,
      [randomUUID(), leagueId, partnerUserId, evaluation.category, entryId]
    );
    // Notify partner of pending registration
    await notifyTournamentRegistration(partnerUserId, leagueId, tournament.name);
  }

  // Notify user of pending registration
  await notifyTournamentRegistration(userId, leagueId, tournament.name);

  // Notify admins about a new pending registration
  await notifyAdminsPendingRegistration(leagueId, tournament.name, entryId);

  return {
    success: true,
    entryId,
    category: evaluation.category,
    message: evaluation.doubles
      ? "Pendaftaran tim Anda telah dikirim dan menunggu persetujuan admin."
      : "Pendaftaran Anda telah dikirim dan menunggu persetujuan admin.",
  };
}

export async function recomputeLeagueStandings(
  connection: Connection,
  tournamentId: string
): Promise<number> {
  const [tournaments] = await connection.execute<IdRow[]>(
    "SELECT id FROM tournaments WHERE id = ? FOR UPDATE",
    [tournamentId]
  );
  if (!tournaments[0]) throw new Error("Liga tidak ditemukan.");

  await connection.execute("DELETE FROM league_standings WHERE tournament_id = ?", [
    tournamentId,
  ]);

  const [insertResult] = await connection.execute<ResultSetHeader>(
    `INSERT INTO league_standings
       (id, tournament_id, category, entry_id, position, played, won, lost,
        wo_won, wo_lost, games_won, games_lost, game_diff, points)
     SELECT
       UUID(),
       ?,
       (SELECT category FROM tournaments WHERE id = ?),
       results.entry_id,
       0,
       COUNT(*),
       SUM(CASE WHEN results.is_win = 1 AND results.is_walkover = 0 THEN 1 ELSE 0 END),
       SUM(CASE WHEN results.is_win = 0 AND results.is_walkover = 0 THEN 1 ELSE 0 END),
       SUM(CASE WHEN results.is_win = 1 AND results.is_walkover = 1 THEN 1 ELSE 0 END),
       SUM(CASE WHEN results.is_win = 0 AND results.is_walkover = 1 THEN 1 ELSE 0 END),
       SUM(results.games_for),
       SUM(results.games_against),
       SUM(results.games_for) - SUM(results.games_against),
       SUM(CASE WHEN results.is_win = 1 THEN 3 ELSE 0 END)
     FROM (
       SELECT DISTINCT
         result.match_id,
         participant_entry.entry_id,
         CASE WHEN participant.team = 1 THEN result.team1_score ELSE result.team2_score END
           AS games_for,
         CASE WHEN participant.team = 1 THEN result.team2_score ELSE result.team1_score END
           AS games_against,
         (result.winner_team = participant.team) AS is_win,
         result.is_walkover
       FROM match_results AS result
       JOIN matches AS match_record ON match_record.id = result.match_id
       JOIN match_participants AS participant
         ON participant.match_id = result.match_id
       JOIN tournament_participants AS participant_entry
         ON participant_entry.tournament_id = ?
        AND participant_entry.user_id = participant.user_id
       WHERE result.status = 'confirmed'
         AND match_record.tournament_id = ?
         AND participant.left_at IS NULL
     ) AS results
     GROUP BY results.entry_id`,
    [tournamentId, tournamentId, tournamentId, tournamentId]
  );

  await connection.execute(
    `UPDATE league_standings AS standing
     JOIN (
       SELECT id,
              ROW_NUMBER() OVER (
                ORDER BY points DESC, game_diff DESC, games_won DESC, entry_id
              ) AS rank_position
       FROM league_standings
       WHERE tournament_id = ?
     ) AS ranked ON ranked.id = standing.id
     SET standing.position = ranked.rank_position
     WHERE standing.tournament_id = ?`,
    [tournamentId, tournamentId]
  );

  await connection.execute(
    `UPDATE league_standings AS standing
     LEFT JOIN (
       SELECT tournament_id, points, game_diff, games_won, COUNT(*) AS tied_entries
       FROM league_standings
       GROUP BY tournament_id, points, game_diff, games_won
     ) AS ties
       ON ties.tournament_id = standing.tournament_id
      AND ties.points = standing.points
      AND ties.game_diff = standing.game_diff
      AND ties.games_won = standing.games_won
     SET standing.needs_tiebreak = COALESCE(ties.tied_entries, 0) > 1
     WHERE standing.tournament_id = ?`,
    [tournamentId]
  );

  return Number(insertResult.affectedRows);
}
