import { randomUUID } from "node:crypto";
import type { Connection, RowDataPacket } from "mysql2/promise";
import { type CreateOpenMatchInput } from "@/lib/matches/constants";
import { toPlatformIsoString, todayInPlatformTimeZone } from "@/lib/utils";
import {
  buildMatchRoster,
  MatchRosterError,
  type MatchRoster,
} from "./match-roster-core.mjs";

interface CourtRow extends RowDataPacket {
  id: string;
  status: string;
}

interface PlayerRow extends RowDataPacket {
  user_id: string;
}

export class MatchCreationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchCreationError";
  }
}

export async function createMySqlMatch(
  connection: Connection,
  userId: string,
  input: CreateOpenMatchInput
): Promise<string> {
  const title = (input.title ?? "").trim();
  if (title.length < 3 || title.length > 100) {
    throw new MatchCreationError("Judul pertandingan harus terdiri dari 3 sampai 100 karakter.");
  }

  let roster: MatchRoster;
  try {
    roster = buildMatchRoster({
      category: input.category,
      matchType: input.matchType,
      organizerId: userId,
      partnerUserId: input.partnerUserId,
      opponentUserId: input.opponentUserId,
      opponentPartnerUserId: input.opponentPartnerUserId,
    });
  } catch (error) {
    if (error instanceof MatchRosterError) {
      throw new MatchCreationError(error.message);
    }
    throw error;
  }

  if (input.umpireOption !== "dengan_wasit" && input.umpireOption !== "tanpa_wasit") {
    throw new MatchCreationError("Pilihan wasit tidak valid.");
  }

  const duration = Number(input.durationMinutes ?? 60);
  if (!Number.isFinite(duration) || duration < 30 || duration > 300) {
    throw new MatchCreationError("Durasi pertandingan harus antara 30 sampai 300 menit.");
  }
  const minRating = Number(input.minRating ?? 1);
  const maxRating = Number(input.maxRating ?? 10);
  if (
    !Number.isFinite(minRating) ||
    !Number.isFinite(maxRating) ||
    minRating < 1 ||
    maxRating > 10 ||
    minRating > maxRating
  ) {
    throw new MatchCreationError("Rentang rating pertandingan tidak valid.");
  }
  const startTime =
    input.startTime?.length === 5 ? `${input.startTime}:00` : input.startTime ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.matchDate ?? "") || !/^\d{2}:\d{2}:\d{2}$/.test(startTime)) {
    throw new MatchCreationError("Jadwal pertandingan tidak valid.");
  }
  const startsAt = toPlatformIsoString(input.matchDate, startTime);
  if (
    !startsAt ||
    input.matchDate < todayInPlatformTimeZone() ||
    new Date(startsAt).getTime() < Date.now()
  ) {
    throw new MatchCreationError("Jadwal pertandingan harus di waktu yang akan datang.");
  }

  const manualCourtName = (input.courtName ?? "").trim();
  const manualProvince = (input.province ?? "").trim();
  const manualCity = (input.cityName ?? "").trim();
  let courtId = input.courtId ?? null;
  if (courtId) {
    const [courts] = await connection.execute<CourtRow[]>(
      "SELECT id, status FROM tennis_courts WHERE id = ? LIMIT 1",
      [courtId]
    );
    if (!courts[0]) throw new MatchCreationError("Lapangan tidak ditemukan.");
    if (courts[0].status !== "available") {
      throw new MatchCreationError("Lapangan sedang tidak tersedia.");
    }
  } else {
    courtId = null;
    // For manual court entry, only court name is required; province/city optional
    if (manualCourtName.length < 2) {
      throw new MatchCreationError("Nama lapangan wajib diisi (minimal 2 karakter).");
    }
  }

  if (roster.playerIdsToVerify.length > 0) {
    const uniquePlayerIds = Array.from(new Set(roster.playerIdsToVerify));
    const placeholders = uniquePlayerIds.map(() => "?").join(", ");
    const [players] = await connection.execute<PlayerRow[]>(
      `SELECT user_id FROM player_profiles WHERE user_id IN (${placeholders})`,
      uniquePlayerIds
    );
    if (players.length !== uniquePlayerIds.length) {
      throw new MatchCreationError("Pemain yang dipilih tidak ditemukan.");
    }
  }

  const [organizers] = await connection.execute<PlayerRow[]>(
    "SELECT id AS user_id FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  if (!organizers[0]) {
    throw new MatchCreationError(
      "Akun penyelenggara belum tersinkron dengan database pertandingan. Silakan masuk ulang."
    );
  }

  const metadata = {
    category: roster.category,
    match_type: roster.matchType,
    umpire_option: input.umpireOption,
    umpire_name: input.umpireName?.trim() || null,
    min_rating: minRating,
    max_rating: maxRating,
    level: input.level ?? "all",
    reclub_link: input.reclubLink?.trim() || null,
    race_to: input.raceToScore ?? 8,
    court_switch_at: input.courtSwitchAt ?? 4,
    court_swapped: false,
    manual_court: !courtId,
    court_name: manualCourtName || null,
    court_province: manualProvince || null,
    court_city: manualCity || null,
    court_address: manualCourtName
      ? [manualCourtName, manualCity, manualProvince].filter(Boolean).join(", ")
      : null,
  };
  const matchId = randomUUID();

  // Both writes below run inside the caller's transaction (see the create
  // route), so a match and its roster are committed or rolled back together.
  await connection.execute(
    `INSERT INTO matches
       (id, title, description, court_id, organizer_id, match_date, start_time,
        duration_minutes, max_players, current_players, status, is_private, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      matchId,
      title,
      input.description?.trim() || null,
      courtId,
      userId,
      input.matchDate,
      startTime,
      duration,
      roster.maxPlayers,
      roster.currentPlayers,
      roster.status,
      roster.isPrivate,
      JSON.stringify(metadata),
    ]
  );

  if (roster.participants.length > 0) {
    const participantPlaceholders = roster.participants
      .map(() => "(?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())")
      .join(", ");
    const participantValues = roster.participants.flatMap((participant) => [
      randomUUID(),
      matchId,
      participant.userId,
      participant.isOrganizer,
      participant.team,
      JSON.stringify({
        status: "confirmed",
        role: participant.role,
        added_by: userId,
      }),
    ]);
    await connection.execute(
      `INSERT INTO match_participants
         (id, match_id, user_id, is_organizer, team, metadata, confirmed_at)
       VALUES ${participantPlaceholders}`,
      participantValues
    );
  }

  return matchId;
}
