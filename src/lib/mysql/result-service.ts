import { randomUUID } from "node:crypto";
import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  calculateDoublesMatchRating,
  calculateSinglesMatchRating,
  type PlayerRatingState,
  type RatingChangeResult,
} from "@/lib/rating/rating-engine";
import { recomputeLeagueStandings } from "@/lib/mysql/competition-service";
import { MatchWorkflowError } from "@/lib/mysql/match-workflow-service";
import {
  notifyResultConfirmed,
  notifyResultDisputed,
} from "@/lib/notifications/notification-service";

interface MatchResultContext extends RowDataPacket {
  id: string;
  organizer_id: string;
  status: string;
  metadata: unknown;
  tournament_id: string | null;
}

interface ResultRow extends RowDataPacket {
  id: string;
  match_id: string;
  team1_score: number;
  team2_score: number;
  winner_team: number;
  submitted_by: string | null;
  status: string;
  submitted_at: string;
  confirmed_at: string | null;
  disputed_at: string | null;
  is_walkover: boolean;
  metadata: unknown;
}

interface PlayerRow extends RowDataPacket {
  user_id: string;
  team: number;
  is_organizer: boolean;
  metadata: unknown;
  current_rating: number | string | null;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
  peak_rating: number | string | null;
}

interface HistoryRow extends RowDataPacket {
  id: string;
}

function objectValue(value: unknown): Record<string, unknown> {
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

function resultView(row: ResultRow) {
  const metadata = objectValue(row.metadata);
  return {
    id: row.id,
    matchId: row.match_id,
    team1Score: row.team1_score,
    team2Score: row.team2_score,
    winnerTeam: row.winner_team === 2 ? 2 : 1,
    submittedBy: row.submitted_by,
    status: row.status === "confirmed" ? "confirmed" : row.status === "pending" ? "pending" : "under_review",
    submittedAt: row.submitted_at,
    confirmedAt: row.confirmed_at,
    disputedAt: row.disputed_at,
    disputeDeadline: typeof metadata.dispute_deadline === "string" ? metadata.dispute_deadline : null,
    disputeReason: typeof metadata.dispute_reason === "string" ? metadata.dispute_reason : null,
    photoUrls: Array.isArray(metadata.photo_urls)
      ? metadata.photo_urls.filter((url): url is string => typeof url === "string")
      : [],
  };
}

async function lockMatch(connection: Connection, matchId: string): Promise<MatchResultContext> {
  const [rows] = await connection.execute<MatchResultContext[]>(
    `SELECT id, organizer_id, status, metadata, tournament_id
     FROM matches WHERE id = ? FOR UPDATE`,
    [matchId]
  );
  if (!rows[0]) throw new MatchWorkflowError("Pertandingan tidak ditemukan.");
  return rows[0];
}

async function getPlayers(connection: Connection, matchId: string): Promise<PlayerRow[]> {
  const [rows] = await connection.execute<PlayerRow[]>(
    `SELECT participant.user_id, participant.team, participant.is_organizer,
            participant.metadata, rating.current_rating, rating.matches_played,
            rating.wins, rating.losses, rating.draws, rating.peak_rating
     FROM match_participants AS participant
     LEFT JOIN player_ratings AS rating ON rating.user_id = participant.user_id
     WHERE participant.match_id = ? AND participant.left_at IS NULL
       AND (participant.is_organizer = TRUE OR
         COALESCE(JSON_UNQUOTE(JSON_EXTRACT(participant.metadata, '$.status')), 'confirmed') = 'confirmed')
     ORDER BY participant.joined_at ASC`,
    [matchId]
  );
  return rows;
}

function teamLists(match: MatchResultContext, players: PlayerRow[]) {
  const organizer = players.find((player) => player.is_organizer || player.user_id === match.organizer_id);
  const hostTeam = organizer?.team === 2 ? 2 : 1;
  const team1 = players.filter((player) =>
    (player.is_organizer || player.user_id === match.organizer_id
      ? hostTeam
      : player.team === 1 ? 1 : 2) === hostTeam
  );
  const team2 = players.filter((player) =>
    (player.is_organizer || player.user_id === match.organizer_id
      ? hostTeam
      : player.team === 1 ? 1 : 2) !== hostTeam
  );
  return { team1, team2 };
}

export async function submitMySqlMatchResult(
  connection: Connection,
  userId: string,
  matchId: string,
  team1Score: number,
  team2Score: number,
  winnerTeam: 1 | 2,
  photoUrls: string[]
) {
  const match = await lockMatch(connection, matchId);
  if (match.organizer_id !== userId) {
    throw new MatchWorkflowError("Hanya Host (penyelenggara) yang dapat mengirim hasil resmi pertandingan.");
  }
  if (match.status === "cancelled") {
    throw new MatchWorkflowError("Pertandingan yang dibatalkan tidak dapat mengirim hasil.");
  }
  if (
    !Number.isInteger(team1Score) ||
    !Number.isInteger(team2Score) ||
    team1Score < 0 ||
    team2Score < 0 ||
    team1Score === team2Score
  ) {
    throw new MatchWorkflowError("Skor harus bilangan bulat non-negatif dan tidak boleh seri.");
  }
  if (winnerTeam !== (team1Score > team2Score ? 1 : 2)) {
    throw new MatchWorkflowError("Pemenang tidak sesuai dengan skor yang dimasukkan.");
  }

  const matchMetadata = objectValue(match.metadata);
  const category = typeof matchMetadata.category === "string" ? matchMetadata.category : "mens_singles";
  const isSingles = category.endsWith("singles");
  const playersPerTeam = isSingles ? 1 : 2;
  const raceTo = Math.max(1, Number(matchMetadata.race_to) || 8);
  if (team1Score > raceTo || team2Score > raceTo || Math.max(team1Score, team2Score) !== raceTo) {
    throw new MatchWorkflowError(`Skor tidak valid. Format pertandingan Race to ${raceTo}.`);
  }
  const { team1, team2 } = teamLists(match, await getPlayers(connection, matchId));
  if (team1.length < playersPerTeam || team2.length < playersPerTeam) {
    throw new MatchWorkflowError("Peserta pertandingan belum lengkap atau susunan tim belum lengkap.");
  }
  const photos = photoUrls.map((url) => url.trim()).filter(Boolean).slice(0, 6);
  if (photos.length === 0) {
    throw new MatchWorkflowError("Foto bukti hasil pertandingan wajib diunggah sebelum mengirim hasil.");
  }

  const [existingRows] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE match_id = ? LIMIT 1 FOR UPDATE",
    [matchId]
  );
  const existing = existingRows[0];
  if (existing?.status === "confirmed") {
    throw new MatchWorkflowError("Hasil pertandingan ini sudah dikonfirmasi.");
  }
  if (existing && existing.submitted_by !== userId) {
    throw new MatchWorkflowError("Hasil pertandingan sudah dikirim oleh pihak lain.");
  }
  if (existing && (existing.status === "under_review" || existing.status === "disputed")) {
    throw new MatchWorkflowError("Hasil sedang ditinjau dan tidak dapat diubah.");
  }

  const now = new Date();
  const deadline = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
  const metadata = {
    ...objectValue(existing?.metadata),
    dispute_deadline: deadline,
    photo_urls: photos,
  };
  if (existing) {
    await connection.execute(
      `UPDATE match_results SET team1_score = ?, team2_score = ?, winner_team = ?,
       status = 'pending', submitted_at = UTC_TIMESTAMP(), confirmed_at = NULL,
       disputed_at = NULL, metadata = ? WHERE id = ?`,
      [team1Score, team2Score, winnerTeam, JSON.stringify(metadata), existing.id]
    );
  } else {
    await connection.execute(
      `INSERT INTO match_results
       (id, match_id, team1_score, team2_score, winner_team, submitted_by, status, metadata)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [randomUUID(), matchId, team1Score, team2Score, winnerTeam, userId, JSON.stringify(metadata)]
    );
  }
  await connection.execute(
    "UPDATE matches SET status = 'in_progress', result_submitted_at = UTC_TIMESTAMP() WHERE id = ?",
    [matchId]
  );
  const [savedRows] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE match_id = ? LIMIT 1",
    [matchId]
  );
  return resultView(savedRows[0]);
}

export async function getMySqlMatchResult(
  connection: Connection,
  userId: string,
  matchId: string
) {
  const [participants] = await connection.execute<HistoryRow[]>(
    `SELECT id FROM match_participants
     WHERE match_id = ? AND user_id = ? AND left_at IS NULL
     LIMIT 1`,
    [matchId, userId]
  );
  if (!participants[0]) throw new MatchWorkflowError("Anda bukan peserta pertandingan ini.");
  const [results] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE match_id = ? LIMIT 1",
    [matchId]
  );
  return results[0] ? resultView(results[0]) : null;
}

export async function confirmMySqlMatchResult(
  connection: Connection,
  userId: string,
  matchId: string
) {
  const match = await lockMatch(connection, matchId);
  const [participantRows] = await connection.execute<HistoryRow[]>(
    `SELECT id FROM match_participants
     WHERE match_id = ? AND user_id = ? AND left_at IS NULL
     LIMIT 1`,
    [matchId, userId]
  );
  if (!participantRows[0]) throw new MatchWorkflowError("Anda bukan peserta pertandingan ini.");
  const [results] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE match_id = ? LIMIT 1 FOR UPDATE",
    [matchId]
  );
  const result = results[0];
  if (!result) throw new MatchWorkflowError("Belum ada hasil pertandingan yang dikirim.");
  if (result.status === "confirmed") {
    return { success: true, message: "Hasil sudah dikonfirmasi.", isDuplicate: true, results: [] };
  }
  if (result.status === "under_review" || result.status === "disputed") {
    throw new MatchWorkflowError("Hasil sedang ditinjau dan belum dapat dikonfirmasi.");
  }
  if (result.submitted_by === userId) {
    throw new MatchWorkflowError("Anda tidak dapat mengonfirmasi hasil yang Anda kirim sendiri.");
  }

await connection.execute(
     "UPDATE match_results SET status = 'confirmed', confirmed_at = UTC_TIMESTAMP() WHERE id = ?",
     [result.id]
   );
   const ratingResult = await applyMySqlVerifiedRatings(connection, match, result);

   // Notify all participants
   const [participants] = await connection.execute<HistoryRow[]>(
     `SELECT user_id FROM match_participants WHERE match_id = ? AND left_at IS NULL`,
     [matchId]
   );
   const participantIds = participants.map((p) => p.user_id);
   await notifyResultConfirmed(
     participantIds,
     matchId,
     match.metadata ? (match.metadata as any).title ?? "Match" : "Match"
   );

   return ratingResult;
}

export async function syncMySqlMatchResultStatus(connection: Connection, matchId: string) {
  const match = await lockMatch(connection, matchId);
  const [results] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE match_id = ? LIMIT 1 FOR UPDATE",
    [matchId]
  );
  const result = results[0];
  if (!result || result.status !== "pending") return false;

  const metadata = objectValue(result.metadata);
  const submittedAt = new Date(result.submitted_at).getTime();
  const deadline =
    typeof metadata.dispute_deadline === "string"
      ? new Date(metadata.dispute_deadline).getTime()
      : submittedAt + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(deadline) || Date.now() < deadline) return false;

await connection.execute(
     `UPDATE match_results SET status = 'confirmed', confirmed_at = UTC_TIMESTAMP(),
      metadata = ? WHERE id = ?`,
     [JSON.stringify({ ...metadata, auto_confirmed: true }), result.id]
   );
   await applyMySqlVerifiedRatings(connection, match, result);

   // Notify all participants of auto-confirmation
   const [participants] = await connection.execute<HistoryRow[]>(
     `SELECT user_id FROM match_participants WHERE match_id = ? AND left_at IS NULL`,
     [matchId]
   );
   const participantIds = participants.map((p) => p.user_id);
   await notifyResultConfirmed(
     participantIds,
     matchId,
     match.metadata ? (match.metadata as any).title ?? "Match" : "Match"
   );

   return true;
}

export async function disputeMySqlMatchResult(
  connection: Connection,
  userId: string,
  matchId: string,
  reason: string
) {
  const match = await lockMatch(connection, matchId);
  const [participants] = await connection.execute<HistoryRow[]>(
    "SELECT id FROM match_participants WHERE match_id = ? AND user_id = ? AND left_at IS NULL LIMIT 1",
    [matchId, userId]
  );
  if (!participants[0]) throw new MatchWorkflowError("Anda bukan peserta pertandingan ini.");
  const [results] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE match_id = ? LIMIT 1 FOR UPDATE",
    [matchId]
  );
  const result = results[0];
  if (!result) throw new MatchWorkflowError("Belum ada hasil pertandingan yang dikirim.");
  if (result.status === "confirmed") throw new MatchWorkflowError("Hasil sudah dikonfirmasi dan tidak dapat disanggah.");
  if (result.status === "under_review" || result.status === "disputed") {
    throw new MatchWorkflowError("Hasil ini sudah berada dalam peninjauan.");
  }
  if (result.submitted_by === userId) {
    throw new MatchWorkflowError("Anda tidak dapat menyanggah hasil yang Anda kirim sendiri.");
  }
  if (!reason.trim()) throw new MatchWorkflowError("Alasan sanggahan wajib diisi.");
  const metadata = { ...objectValue(result.metadata), dispute_reason: reason.trim() };
await connection.execute(
     "UPDATE match_results SET status = 'under_review', disputed_at = UTC_TIMESTAMP(), metadata = ? WHERE id = ?",
     [JSON.stringify(metadata), result.id]
   );
   await connection.execute(
     "UPDATE matches SET dispute_raised_at = UTC_TIMESTAMP() WHERE id = ?",
     [matchId]
   );

   // Notify organizer (submitter) that result was disputed
   await notifyResultDisputed(
     result.submitted_by as string,
     matchId,
     match.metadata ? (match.metadata as any).title ?? "Match" : "Match",
     reason.trim()
   );

   return resultView({ ...result, status: "under_review", metadata });
}

export async function recordMySqlWalkover(
  connection: Connection,
  userId: string,
  matchId: string,
  winnerTeam: 1 | 2,
  reason?: string
) {
  const match = await lockMatch(connection, matchId);
  if (match.status === "completed" || match.status === "cancelled") {
    throw new MatchWorkflowError("Pertandingan sudah selesai atau dibatalkan.");
  }
  const [participants] = await connection.execute<HistoryRow[]>(
    `SELECT id FROM match_participants
     WHERE match_id = ? AND user_id = ? AND left_at IS NULL
     LIMIT 1`,
    [matchId, userId]
  );
  if (!participants[0]) throw new MatchWorkflowError("Hanya peserta pertandingan yang dapat mencatat WO.");
  const [existing] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE match_id = ? LIMIT 1 FOR UPDATE",
    [matchId]
  );
  if (existing[0]) throw new MatchWorkflowError("Hasil pertandingan sudah ada.");
  const [roster] = await connection.execute<PlayerRow[]>(
    `SELECT user_id, team, is_organizer, metadata
     FROM match_participants
     WHERE match_id = ? AND left_at IS NULL
       AND (is_organizer = TRUE OR
         COALESCE(JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.status')), 'confirmed') = 'confirmed')`,
    [matchId]
  );
  const { team1, team2 } = teamLists(match, roster);
  const category = objectValue(match.metadata).category;
  const playersPerTeam = typeof category === "string" && category.endsWith("singles") ? 1 : 2;
  if (team1.length < playersPerTeam || team2.length < playersPerTeam) {
    throw new MatchWorkflowError("Peserta pertandingan belum lengkap untuk mencatat WO.");
  }

  const winnerScore = 8;
  const loserScore = 0;
  const metadata = {
    is_walkover: true,
    walkover_by: userId,
    walkover_reason: reason?.trim() || "Walkover",
    photo_urls: [],
  };
  const resultId = randomUUID();
  await connection.execute(
    `INSERT INTO match_results
     (id, match_id, team1_score, team2_score, winner_team, submitted_by, status,
      submitted_at, confirmed_at, is_walkover, walkover_by, walkover_reason, metadata)
     VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, TRUE, ?, ?, ?)`,
    [
      resultId,
      matchId,
      winnerTeam === 1 ? winnerScore : loserScore,
      winnerTeam === 1 ? loserScore : winnerScore,
      winnerTeam,
      userId,
      new Date(),
      new Date(),
      userId,
      metadata.walkover_reason,
      JSON.stringify(metadata),
    ]
  );
  const [results] = await connection.execute<ResultRow[]>(
    "SELECT * FROM match_results WHERE id = ?",
    [resultId]
  );
  const confirmedResult = results[0];
  await connection.execute(
    "UPDATE matches SET result_submitted_at = UTC_TIMESTAMP() WHERE id = ?",
    [matchId]
  );
  const confirmedMatch = { ...match, status: "in_progress" };
  await applyMySqlVerifiedRatings(connection, confirmedMatch, confirmedResult);
  return {
    success: true,
    message: `WO dicatat. Tim ${winnerTeam} menang 8–0.`,
  };
}

async function applyMySqlVerifiedRatings(
  connection: Connection,
  match: MatchResultContext,
  result: ResultRow
) {
  if (match.status === "cancelled") {
    throw new MatchWorkflowError("Pertandingan yang dibatalkan tidak memengaruhi rating.");
  }
  const [history] = await connection.execute<HistoryRow[]>(
    "SELECT id FROM rating_history WHERE match_id = ? LIMIT 1",
    [match.id]
  );
  if (history.length > 0) {
    return {
      success: true,
      message: "Pertandingan ini telah diproses sebelumnya. Perubahan rating tidak diduplikasi.",
      isDuplicate: true,
      results: [],
    };
  }

  const roster = await getPlayers(connection, match.id);
  for (const player of roster) {
    await connection.execute(
      "INSERT IGNORE INTO player_ratings (id, user_id) VALUES (?, ?)",
      [randomUUID(), player.user_id]
    );
  }
  const { team1, team2 } = teamLists(match, await getPlayers(connection, match.id));
  const metadata = objectValue(match.metadata);
  const category = typeof metadata.category === "string" ? metadata.category : "mens_singles";
  const singles = category.endsWith("singles");
  const required = singles ? 1 : 2;
  if (team1.length < required || team2.length < required) {
    throw new MatchWorkflowError("Peserta pertandingan belum lengkap.");
  }

  const ratingFor = (player: PlayerRow): PlayerRatingState => ({
    userId: player.user_id,
    currentRating: Number(player.current_rating ?? 1),
    matchesPlayed: Number(player.matches_played ?? 0),
  });
  const ratingChanges: Array<{
    change: RatingChangeResult;
    opponentId: string | null;
    opponentRating: number;
    outcome: "win" | "loss";
    player: PlayerRow;
  }> = [];
  const winner = result.winner_team === 2 ? 2 : 1;

  if (singles) {
    const player1 = ratingFor(team1[0]);
    const player2 = ratingFor(team2[0]);
    const calculated = calculateSinglesMatchRating(player1, player2, winner === 1 ? "A" : "B");
    ratingChanges.push(
      { change: calculated.playerA, opponentId: player2.userId, opponentRating: player2.currentRating, outcome: winner === 1 ? "win" : "loss", player: team1[0] },
      { change: calculated.playerB, opponentId: player1.userId, opponentRating: player1.currentRating, outcome: winner === 2 ? "win" : "loss", player: team2[0] }
    );
  } else {
    const team1States = [ratingFor(team1[0]), ratingFor(team1[1])] as [PlayerRatingState, PlayerRatingState];
    const team2States = [ratingFor(team2[0]), ratingFor(team2[1])] as [PlayerRatingState, PlayerRatingState];
    const calculated = calculateDoublesMatchRating(team1States, team2States, winner);
    calculated.team1Results.forEach((change, index) =>
      ratingChanges.push({ change, opponentId: null, opponentRating: calculated.team2Avg, outcome: winner === 1 ? "win" : "loss", player: team1[index] })
    );
    calculated.team2Results.forEach((change, index) =>
      ratingChanges.push({ change, opponentId: null, opponentRating: calculated.team1Avg, outcome: winner === 2 ? "win" : "loss", player: team2[index] })
    );
  }

  for (const item of ratingChanges) {
    const currentRating = Number(item.player.current_rating ?? 1);
    const oldRating = currentRating;
    const newRating = item.change.newRating;
    const matchesPlayed = Number(item.player.matches_played ?? 0) + 1;
    const wins = Number(item.player.wins ?? 0) + (item.outcome === "win" ? 1 : 0);
    const losses = Number(item.player.losses ?? 0) + (item.outcome === "loss" ? 1 : 0);
    const draws = Number(item.player.draws ?? 0);
    const peak = Math.max(Number(item.player.peak_rating ?? currentRating), newRating);
    await connection.execute(
      `INSERT INTO rating_history
       (id, user_id, match_id, old_rating, new_rating, change_reason, match_result, opponent_id, opponent_rating)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        item.player.user_id,
        match.id,
        oldRating,
        newRating,
        item.change.changeReason.slice(0, 50),
        item.outcome,
        item.opponentId,
        item.opponentRating,
      ]
    );
    await connection.execute(
      `UPDATE player_ratings
       SET current_rating = ?, peak_rating = ?, matches_played = ?, wins = ?,
           losses = ?, draws = ?, last_match_at = UTC_TIMESTAMP(),
           last_rating_change_at = UTC_TIMESTAMP()
       WHERE user_id = ?`,
      [newRating, peak, matchesPlayed, wins, losses, draws, item.player.user_id]
    );
  }

  await connection.execute(
    "UPDATE matches SET status = 'completed', result_confirmed_at = UTC_TIMESTAMP() WHERE id = ?",
    [match.id]
  );
  if (match.tournament_id) {
    await recomputeLeagueStandings(connection, match.tournament_id);
  }
  return {
    success: true,
    message: "MATCHPOIN Rating berhasil diperbarui dan dicatat dalam histori pertandingan.",
    isDuplicate: false,
    results: ratingChanges.map((item) => ({
      userId: item.change.userId,
      oldRating: item.change.oldRating,
      newRating: item.change.newRating,
      delta: item.change.ratingDelta,
    })),
  };
}
