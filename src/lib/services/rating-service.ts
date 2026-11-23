import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/errors";
import {
  calculateSinglesMatchRating,
  calculateDoublesMatchRating,
  type PlayerRatingState,
  type RatingChangeResult,
} from "@/lib/rating/rating-engine";
import { DTR_DEFAULT_RATING } from "@/lib/rating/dtr-core.mjs";

export type MatchFormat = "singles" | "doubles" | "mixed_doubles";

export interface SubmitMatchResultInput {
  matchId: string;
  team1Score: number;
  team2Score: number;
  winnerTeam: 1 | 2;
  photoUrls?: string[];
}

export interface MatchResultRow {
  id: string;
  match_id: string;
  team1_score: number | null;
  team2_score: number | null;
  winner_team: number | null;
  submitted_by: string | null;
  status: string;
  submitted_at: string | null;
  confirmed_at: string | null;
  disputed_at: string | null;
  is_walkover?: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
}

export interface MatchResultView {
  id: string;
  matchId: string;
  team1Score: number;
  team2Score: number;
  winnerTeam: 1 | 2;
  submittedBy: string | null;
  status: "pending" | "confirmed" | "under_review";
  submittedAt: string | null;
  confirmedAt: string | null;
  disputedAt: string | null;
  disputeDeadline: string | null;
  disputeReason: string | null;
  photoUrls: string[];
}

export interface RatingChangeSummary {
  userId: string;
  oldRating: number;
  newRating: number;
  delta: number;
}

export interface ApplyRatingResponse {
  success: boolean;
  message: string;
  isDuplicate: boolean;
  results: RatingChangeSummary[];
}

const DISPUTE_WINDOW_HOURS = 24;

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/** rating_history.change_reason is varchar(50); keep reasons within that limit. */
const CHANGE_REASON_MAX_LENGTH = 50;

function truncateReason(reason: string): string {
  return reason.length <= CHANGE_REASON_MAX_LENGTH
    ? reason
    : `${reason.slice(0, CHANGE_REASON_MAX_LENGTH - 1).trimEnd()}\u2026`;
}

function formatCategory(category: string): MatchFormat {
  if (category === "mens_singles" || category === "womens_singles") return "singles";
  if (category === "mixed_doubles") return "mixed_doubles";
  return "doubles";
}

export function toMatchResultView(row: MatchResultRow): MatchResultView {
  const meta = metadataObject(row.metadata);
  const deadline =
    typeof meta.dispute_deadline === "string" ? meta.dispute_deadline : null;
  const status =
    row.status === "confirmed"
      ? "confirmed"
      : row.status === "under_review" || row.status === "disputed"
      ? "under_review"
      : "pending";

  const photoUrls = Array.isArray(meta.photo_urls)
    ? (meta.photo_urls as unknown[]).filter((u): u is string => typeof u === "string")
    : [];

  return {
    id: row.id,
    matchId: row.match_id,
    team1Score: row.team1_score ?? 0,
    team2Score: row.team2_score ?? 0,
    winnerTeam: row.winner_team === 2 ? 2 : 1,
    submittedBy: row.submitted_by,
    status,
    submittedAt: row.submitted_at,
    confirmedAt: row.confirmed_at,
    disputedAt: row.disputed_at,
    disputeDeadline: deadline,
    disputeReason: typeof meta.dispute_reason === "string" ? meta.dispute_reason : null,
    photoUrls,
  };
}

async function getMatchContext(matchId: string) {
  const supabase = createClient();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, organizer_id, metadata, status")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) throw new Error(matchError.message);
  if (!match) throw new Error("Pertandingan tidak ditemukan.");

  const meta = metadataObject(match.metadata);
  const category = typeof meta.category === "string" ? meta.category : "mens_singles";

  const { data: participants, error: participantError } = await supabase
    .from("match_participants")
    .select("user_id, team, is_organizer, metadata")
    .eq("match_id", matchId);

  if (participantError) throw new Error(participantError.message);

  const confirmed = (participants ?? []).filter(
    (p) => p.is_organizer || metadataObject(p.metadata).status === "confirmed"
  );
  const organizerParticipant = confirmed.find((p) => p.is_organizer || p.user_id === match.organizer_id);
  const hostTeam = organizerParticipant?.team === 2 ? 2 : 1;
  const team1 = confirmed.filter((p) => (p.is_organizer || p.user_id === match.organizer_id ? hostTeam : p.team === 1 ? 1 : 2) === hostTeam);
  const team2 = confirmed.filter((p) => (p.is_organizer || p.user_id === match.organizer_id ? hostTeam : p.team === 1 ? 1 : 2) !== hostTeam);

  return { supabase, match, meta, category, team1, team2 };
}

async function getResult(matchId: string): Promise<MatchResultRow | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("match_results")
    .select("*")
    .eq("match_id", matchId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as MatchResultRow | null) ?? null;
}

/**
 * Returns the current result for a match, if any.
 */
export async function getMatchResult(matchId: string): Promise<MatchResultView | null> {
  const result = await getResult(matchId);
  return result ? toMatchResultView(result) : null;
}

async function assertParticipant(matchId: string, userId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("match_participants")
    .select("user_id")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return supabase;

  // Host yang tidak ikut bermain tetap boleh mengonfirmasi/menyanggah hasil
  // yang dikirim lawan (kebalikan dari aturan submit dua arah).
  const { data: match } = await supabase
    .from("matches")
    .select("organizer_id")
    .eq("id", matchId)
    .maybeSingle();
  if (match?.organizer_id === userId) return supabase;

  throw new Error("Anda bukan peserta pertandingan ini.");
}

async function assertCanSubmitResult(matchId: string, userId: string) {
  const { supabase, match, team1, team2 } = await getMatchContext(matchId);
  const participantIds = [...team1, ...team2].map((participant) => participant.user_id);

  // Both sides may submit: the host AND every confirmed opponent. Whoever
  // submits first becomes the pending result; the other side then confirms or
  // disputes it (see confirmMatchResult / disputeMatchResult).
  const allowed = match.organizer_id === userId || participantIds.includes(userId);
  if (!allowed) {
    throw new Error("Hanya Host atau lawan terkonfirmasi yang dapat mengirim hasil pertandingan ini.");
  }
  return supabase;
}

/**
 * Submits a match result. The opponent then has 24 hours (server time) to dispute it.
 * Ratings are never applied at submission time. Only the Host may submit the official result.
 */
export async function submitMatchResult(
  userId: string,
  input: SubmitMatchResultInput,
  options: { asAdmin?: boolean } = {}
): Promise<MatchResultView> {
  const asAdmin = Boolean(options.asAdmin);
  const adminClient = asAdmin ? createAdminClient() : null;
  if (asAdmin && !adminClient) {
    throw new Error("Konfigurasi server admin belum lengkap.");
  }
  const supabase = asAdmin ? adminClient! : await assertCanSubmitResult(input.matchId, userId);

  if (!Number.isInteger(input.team1Score) || !Number.isInteger(input.team2Score)) {
    throw new Error("Skor harus berupa bilangan bulat.");
  }
  if (input.team1Score < 0 || input.team2Score < 0) {
    throw new Error("Skor tidak boleh negatif.");
  }
  if (input.team1Score === input.team2Score) {
    throw new Error("Pertandingan tenis tidak boleh berakhir seri.");
  }
  if (input.winnerTeam !== 1 && input.winnerTeam !== 2) {
    throw new Error("Pemenang pertandingan tidak valid.");
  }

  const expectedWinner =
    input.team1Score > input.team2Score ? 1 : 2;
  if (input.winnerTeam !== expectedWinner) {
    throw new Error("Pemenang tidak sesuai dengan skor yang dimasukkan.");
  }

  const { category, team1, team2, meta } = await getMatchContext(input.matchId);
  const format = formatCategory(category);
  const playersPerTeam = format === "singles" ? 1 : 2;
  const requiredPlayers = playersPerTeam * 2;
  const confirmedPlayers = team1.length + team2.length;

  const raceTo = Math.max(1, Number((meta as any).race_to ?? 8) || 8);
  if (input.team1Score > raceTo || input.team2Score > raceTo) {
    throw new Error(`Skor tidak valid. Format pertandingan Race to ${raceTo}.`);
  }
  if (Math.max(input.team1Score, input.team2Score) !== raceTo) {
    throw new Error(`Pertandingan berakhir saat salah satu pihak mencapai ${raceTo} poin.`);
  }

  if (confirmedPlayers < requiredPlayers) {
    throw new Error(
      `Peserta belum lengkap: format ${format} membutuhkan ${requiredPlayers} pemain, baru ${confirmedPlayers} pemain yang terkonfirmasi.`
    );
  }

  if (team1.length < playersPerTeam || team2.length < playersPerTeam) {
    throw new Error(
      `Susunan tim belum lengkap: ${format} membutuhkan ${playersPerTeam} pemain per tim (Tim 1: ${team1.length} pemain, Tim 2: ${team2.length} pemain).`
    );
  }

  const photos = (input.photoUrls ?? [])
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter((url) => url.length > 0);

  if (!asAdmin && photos.length === 0) {
    throw new Error("Foto bukti hasil pertandingan wajib diunggah sebelum mengirim hasil.");
  }

  const existing = await getResult(input.matchId);
  if (existing) {
    if (existing.status === "confirmed") {
      throw new Error("Hasil pertandingan ini sudah dikonfirmasi.");
    }
    if (!asAdmin && existing.submitted_by !== userId) {
      throw new Error("Hasil pertandingan sudah dikirim oleh pihak lain.");
    }
    if (existing.status === "under_review") {
      throw new Error("Hasil sedang ditinjau dan tidak dapat diubah.");
    }

    const now = new Date();
    const deadline = new Date(addHours(now, DISPUTE_WINDOW_HOURS).toISOString());
    const nextMetadata = {
      ...metadataObject(existing.metadata),
      dispute_deadline: deadline.toISOString(),
      photo_urls: photos,
    };

    const { data, error } = await supabase
      .from("match_results")
      .update({
        team1_score: input.team1Score,
        team2_score: input.team2Score,
        winner_team: input.winnerTeam,
        status: asAdmin ? "confirmed" : "pending",
        submitted_at: now.toISOString(),
        confirmed_at: asAdmin ? now.toISOString() : null,
        disputed_at: null,
        metadata: nextMetadata,
      })
      .eq("id", existing.id)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

  // Only organizers may update matches under RLS, so a non-organizer submitter
  // needs the admin client to record the match as in progress.
  const admin = createAdminClient();
  const { error: statusError } = await (admin ?? supabase)
    .from("matches")
    .update({
      status: asAdmin ? "completed" : "in_progress",
      result_submitted_at: now.toISOString(),
    })
    .eq("id", input.matchId);

  if (statusError) {
    logError("result.status", statusError, { matchId: input.matchId });
  }

  if (asAdmin) {
    await applyVerifiedMatchRatings(input.matchId, supabase);
  }

  return toMatchResultView(data as MatchResultRow);
  }

  const now = new Date();
  const deadline = addHours(now, DISPUTE_WINDOW_HOURS);

  const { data, error } = await supabase
    .from("match_results")
    .insert({
      match_id: input.matchId,
      team1_score: input.team1Score,
      team2_score: input.team2Score,
      winner_team: input.winnerTeam,
      submitted_by: userId,
      status: asAdmin ? "confirmed" : "pending",
      submitted_at: now.toISOString(),
      confirmed_at: asAdmin ? now.toISOString() : null,
      metadata: {
        dispute_deadline: deadline.toISOString(),
        photo_urls: photos,
      },
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  // Only organizers may update matches under RLS, so a non-organizer submitter
  // needs the admin client to record the match as in progress.
  const admin = createAdminClient();
  const { error: statusError } = await (admin ?? supabase)
    .from("matches")
    .update({
      status: asAdmin ? "completed" : "in_progress",
      result_submitted_at: now.toISOString(),
    })
    .eq("id", input.matchId);

  if (statusError) {
    logError("result.status", statusError, { matchId: input.matchId });
  }

  if (asAdmin) {
    await applyVerifiedMatchRatings(input.matchId, supabase);
  }

  return toMatchResultView(data as MatchResultRow);
}

/**
 * Confirms a pending result. Only the opponent (a participant who did not submit) may confirm.
 * Ratings are applied exactly once, after confirmation.
 */
export async function confirmMatchResult(
  userId: string,
  matchId: string
): Promise<ApplyRatingResponse> {
  const supabase = await assertParticipant(matchId, userId);
  const result = await getResult(matchId);

  if (!result) throw new Error("Belum ada hasil pertandingan yang dikirim.");
  if (result.status === "confirmed") {
    return applyVerifiedMatchRatings(matchId);
  }
  if (result.status === "under_review") {
    throw new Error("Hasil sedang ditinjau dan belum dapat dikonfirmasi.");
  }
  if (result.submitted_by === userId) {
    throw new Error("Anda tidak dapat mengonfirmasi hasil yang Anda kirim sendiri.");
  }

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    })
    .eq("id", result.id);

  if (error) throw new Error(error.message);

  return applyVerifiedMatchRatings(matchId);
}

/**
 * Disputes a pending result, moving it to Under Review. No rating changes are applied.
 */
export async function disputeMatchResult(
  userId: string,
  matchId: string,
  reason: string
): Promise<MatchResultView> {
  const supabase = await assertParticipant(matchId, userId);
  const result = await getResult(matchId);

  if (!result) throw new Error("Belum ada hasil pertandingan yang dikirim.");
  if (result.status === "confirmed") {
    throw new Error("Hasil sudah dikonfirmasi dan tidak dapat disanggah.");
  }
  if (result.status === "under_review") {
    throw new Error("Hasil ini sudah berada dalam peninjauan.");
  }
  if (result.submitted_by === userId) {
    throw new Error("Anda tidak dapat menyanggah hasil yang Anda kirim sendiri.");
  }
  if (!reason.trim()) {
    throw new Error("Alasan sanggahan wajib diisi.");
  }

const meta = metadataObject(result.metadata);
  const now = new Date();
  const { data, error } = await supabase
    .from("match_results")
    .update({
      status: "under_review",
      disputed_at: now.toISOString(),
      metadata: { ...meta, dispute_reason: reason.trim() },
    })
    .eq("id", result.id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const admin = createAdminClient();
  const { error: disputeMatchError } = await (admin ?? supabase)
    .from("matches")
    .update({ dispute_raised_at: now.toISOString() })
    .eq("id", matchId);

  if (disputeMatchError) {
    logError("result.dispute_status", disputeMatchError, { matchId });
  }

  return toMatchResultView(data as MatchResultRow);
}

/**
 * Auto-confirms a pending result once the 24-hour server-side window has elapsed.
 * Call this when loading match details.
 */
export async function syncMatchResultStatus(matchId: string): Promise<void> {
  const supabase = createClient();
  const result = await getResult(matchId);
  if (!result || result.status !== "pending") return;

  const meta = metadataObject(result.metadata);
  const deadlineRaw = meta.dispute_deadline;
  const deadline = typeof deadlineRaw === "string" ? new Date(deadlineRaw) : null;
  const submittedAt = result.submitted_at ? new Date(result.submitted_at) : null;
  const fallbackDeadline = submittedAt ? addHours(submittedAt, DISPUTE_WINDOW_HOURS) : null;
  const effectiveDeadline = deadline ?? fallbackDeadline;

  if (!effectiveDeadline) return;
  if (Date.now() < effectiveDeadline.getTime()) return;

  const { error } = await supabase
    .from("match_results")
    .update({
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      metadata: { ...meta, auto_confirmed: true },
    })
    .eq("id", result.id);

  if (error) return;
  await applyVerifiedMatchRatings(matchId);
}

/**
 * Applies rating changes for a confirmed match. Must only be called after confirmation.
 */
export async function applyVerifiedMatchRatings(
  matchId: string,
  client?: ReturnType<typeof createClient>
): Promise<ApplyRatingResponse> {
  const supabase = client ?? createClient();

  const { supabase: _s, match, meta, category, team1, team2 } = await getMatchContext(matchId);

  if (match.status === "cancelled") {
    throw new Error("Pertandingan yang dibatalkan tidak memengaruhi rating.");
  }

  const result = await getResult(matchId);
  if (!result || result.status !== "confirmed") {
    throw new Error(
      "Integritas Rating: hanya pertandingan dengan status 'confirmed' yang dapat mengubah DTR."
    );
  }

  // DTR only uses real win/loss results. Walkovers never change rating.
  if (result.is_walkover === true || metadataObject(result.metadata).is_walkover === true) {
    return {
      success: true,
      message: "Walkover (WO) tidak mengubah rating DTR.",
      isDuplicate: true,
      results: [],
    };
  }

  const { data: existingHistory } = await supabase
    .from("rating_history")
    .select("id")
    .eq("match_id", matchId)
    .limit(1);

  if (existingHistory && existingHistory.length > 0) {
    return {
      success: true,
      message: "Pertandingan ini telah diproses sebelumnya. Perubahan rating tidak diduplikasi.",
      isDuplicate: true,
      results: [],
    };
  }

  const format = formatCategory(category);
  const requiredPlayers = format === "singles" ? 1 : 2;
  if (team1.length < requiredPlayers || team2.length < requiredPlayers) {
    throw new Error("Peserta pertandingan belum lengkap.");
  }

  const userIds = [...team1, ...team2].map((p) => p.user_id);
  const { data: ratingRows } = await supabase
    .from("player_ratings")
    .select("user_id, current_rating, matches_played, wins, losses, draws, peak_rating")
    .in("user_id", userIds);

  const ratingMap = new Map(
    (ratingRows ?? []).map((r) => [
      r.user_id,
      {
        currentRating: Number(r.current_rating ?? DTR_DEFAULT_RATING),
        matchesPlayed: Number(r.matches_played ?? 0),
        wins: Number(r.wins ?? 0),
        losses: Number(r.losses ?? 0),
        draws: Number(r.draws ?? 0),
        peakRating: Number(r.peak_rating ?? r.current_rating ?? DTR_DEFAULT_RATING),
      },
    ])
  );

  // A player who never completed onboarding may not have a player_ratings row
  // yet; the RPC refuses to record history without one.
  const missingRatings = userIds.filter((id) => !ratingMap.has(id));
  if (missingRatings.length > 0) {
    const admin = createAdminClient();
    const { error: seedError } = await (admin ?? supabase)
      .from("player_ratings")
      .insert(
        missingRatings.map((id) => ({
          user_id: id,
          current_rating: DTR_DEFAULT_RATING,
          peak_rating: DTR_DEFAULT_RATING,
        }))
      );

    if (seedError) {
      logError("rating.seed", seedError, { matchId, missingRatings });
    }

    missingRatings.forEach((id) => {
      ratingMap.set(id, {
        currentRating: DTR_DEFAULT_RATING,
        matchesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        peakRating: DTR_DEFAULT_RATING,
      });
    });
  }

  const toState = (p: { user_id: string }): PlayerRatingState => {
    const r = ratingMap.get(p.user_id);
    return {
      userId: p.user_id,
      currentRating: r?.currentRating ?? DTR_DEFAULT_RATING,
      matchesPlayed: r?.matchesPlayed ?? 0,
    };
  };

  const winnerTeam = result.winner_team === 2 ? 2 : 1;
  const resultsToPersist: {
    result: RatingChangeResult;
    opponentId: string | null;
    opponentRating: number;
    matchOutcome: "win" | "loss" | "draw";
  }[] = [];

  if (format === "singles") {
    const calc = calculateSinglesMatchRating(
      toState(team1[0]),
      toState(team2[0]),
      winnerTeam === 1 ? "A" : "B"
    );

    resultsToPersist.push({
      result: calc.playerA,
      opponentId: team2[0].user_id,
      opponentRating: toState(team2[0]).currentRating,
      matchOutcome: winnerTeam === 1 ? "win" : "loss",
    });
    resultsToPersist.push({
      result: calc.playerB,
      opponentId: team1[0].user_id,
      opponentRating: toState(team1[0]).currentRating,
      matchOutcome: winnerTeam === 2 ? "win" : "loss",
    });
  } else {
    const team1Players: [PlayerRatingState, PlayerRatingState] = [
      toState(team1[0]),
      toState(team1[1]),
    ];
    const team2Players: [PlayerRatingState, PlayerRatingState] = [
      toState(team2[0]),
      toState(team2[1]),
    ];

    const calc = calculateDoublesMatchRating(
      team1Players,
      team2Players,
      winnerTeam
    );

    calc.team1Results.forEach((r) => {
      resultsToPersist.push({
        result: r,
        opponentId: null,
        opponentRating: calc.team2Avg,
        matchOutcome: winnerTeam === 1 ? "win" : "loss",
      });
    });
    calc.team2Results.forEach((r) => {
      resultsToPersist.push({
        result: r,
        opponentId: null,
        opponentRating: calc.team1Avg,
        matchOutcome: winnerTeam === 2 ? "win" : "loss",
      });
    });
  }

  for (const item of resultsToPersist) {
    const current = ratingMap.get(item.result.userId);
    const oldRating = current?.currentRating ?? item.result.oldRating;
    const newRating = item.result.newRating;
    const delta = Math.round(newRating - oldRating);
    const matchesPlayed = (current?.matchesPlayed ?? 0) + 1;
    const wins = (current?.wins ?? 0) + (item.matchOutcome === "win" ? 1 : 0);
    const losses = (current?.losses ?? 0) + (item.matchOutcome === "loss" ? 1 : 0);
    const draws = (current?.draws ?? 0) + (item.matchOutcome === "draw" ? 1 : 0);
    const peakRating = Math.max(current?.peakRating ?? newRating, newRating);

    const { error: rpcError } = await supabase.rpc("apply_match_rating_change", {
      p_user_id: item.result.userId,
      p_match_id: matchId,
      p_old_rating: oldRating,
      p_new_rating: newRating,
      p_rating_change: delta,
      p_change_reason: truncateReason(item.result.changeReason),
      p_match_result: item.matchOutcome,
      p_opponent_id: item.opponentId,
      p_opponent_rating: item.opponentRating,
      p_matches_played: matchesPlayed,
      p_wins: wins,
      p_losses: losses,
      p_draws: draws,
      p_peak_rating: peakRating,
    });

    if (rpcError) {
      // The RPC is created by the match workflow migration. Until it is applied,
      // persist directly so the result is not lost; RLS may still block the update.
      logError("rating.rpc", rpcError, {
        matchId,
        userId: item.result.userId,
        code: rpcError.code,
      });
      const { error: historyError } = await supabase.from("rating_history").insert({
        user_id: item.result.userId,
        match_id: matchId,
        old_rating: oldRating,
        new_rating: newRating,
        change_reason: truncateReason(item.result.changeReason),
        match_result: item.matchOutcome,
        opponent_id: item.opponentId,
        opponent_rating: item.opponentRating,
        algorithm_version: 2,
      });

      if (historyError) {
        throw new Error(
          `Rating tidak dapat disimpan (${rpcError.message || rpcError.code}): ${historyError.message}. Terapkan migrasi match workflow terlebih dahulu.`
        );
      }

      const { error: updateError } = await supabase
        .from("player_ratings")
        .update({
          current_rating: newRating,
          peak_rating: peakRating,
          matches_played: matchesPlayed,
          wins,
          losses,
          draws,
          last_match_at: new Date().toISOString(),
          last_rating_change_at: new Date().toISOString(),
        })
        .eq("user_id", item.result.userId);

      if (updateError) {
        throw new Error(
          `Rating tidak dapat diperbarui: ${updateError.message}. Terapkan migrasi match workflow terlebih dahulu.`
        );
      }
    }
  }

  // The confirming player is often not the organizer, and only organizers may
  // update matches under RLS, so the completion is written with the admin client.
  const admin = createAdminClient();
  const { error: completeError } = await (admin ?? supabase)
    .from("matches")
    .update({
      status: "completed",
      result_confirmed_at: new Date().toISOString(),
    })
    .eq("id", matchId);

  if (completeError) {
    logError("rating.complete", completeError, { matchId });
    throw new Error(`Rating tersimpan, tetapi status pertandingan gagal diperbarui: ${completeError.message}.`);
  }

  return {
    success: true,
    message: "DTR berhasil diperbarui dan dicatat dalam histori pertandingan.",
    isDuplicate: false,
    results: resultsToPersist.map((r) => ({
      userId: r.result.userId,
      oldRating: r.result.oldRating,
      newRating: r.result.newRating,
      delta: r.result.ratingDelta,
    })),
  };
}