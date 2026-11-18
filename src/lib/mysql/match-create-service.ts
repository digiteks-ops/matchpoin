import { randomUUID } from "node:crypto";
import type { Connection, RowDataPacket } from "mysql2/promise";
import {
  VALID_CATEGORIES,
  maxParticipantRows,
  type CreateOpenMatchInput,
} from "@/lib/matches/constants";
import { toPlatformIsoString, todayInPlatformTimeZone } from "@/lib/utils";

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
  if (!VALID_CATEGORIES.includes(input.category)) {
    throw new MatchCreationError("Kategori pertandingan tidak valid.");
  }

  const isDoubles = input.category.includes("doubles");
  const matchType = input.matchType ?? (isDoubles ? "open" : "private");
  if (matchType !== "open" && matchType !== "private") {
    throw new MatchCreationError("Tipe pertandingan tidak valid.");
  }
  if (!isDoubles && matchType !== "private") {
    throw new MatchCreationError("Tipe pertandingan tidak valid.");
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
    if (manualCourtName.length < 2 || !manualProvince || !manualCity) {
      throw new MatchCreationError("Nama lapangan, provinsi, dan kota wajib diisi.");
    }
  }

  const partnerUserId = input.partnerUserId?.trim() || null;
  const opponentUserId = input.opponentUserId?.trim() || null;
  const opponentPartnerUserId = input.opponentPartnerUserId?.trim() || null;
  const selectedIds = [partnerUserId, opponentUserId, opponentPartnerUserId].filter(
    (id): id is string => Boolean(id)
  );
  if (!isDoubles && selectedIds.length > 0) {
    throw new MatchCreationError("Partner dan lawan hanya berlaku untuk pertandingan ganda.");
  }

  if (isDoubles && matchType === "private") {
    if (!partnerUserId || !opponentUserId || !opponentPartnerUserId) {
      throw new MatchCreationError("Ganda privat wajib memilih partner dan 2 pemain lawan.");
    }
    if (
      new Set([userId, partnerUserId, opponentUserId, opponentPartnerUserId]).size !== 4
    ) {
      throw new MatchCreationError("Host, partner, dan pemain lawan harus berbeda.");
    }
  } else if (isDoubles && selectedIds.length > 0) {
    throw new MatchCreationError("Pertandingan ganda terbuka tidak dapat menentukan pemain manual.");
  }

  if (selectedIds.length > 0) {
    const placeholders = selectedIds.map(() => "?").join(", ");
    const [players] = await connection.execute<PlayerRow[]>(
      `SELECT user_id FROM player_profiles WHERE user_id IN (${placeholders})`,
      selectedIds
    );
    if (players.length !== new Set(selectedIds).size) {
      throw new MatchCreationError("Pemain yang dipilih tidak ditemukan.");
    }
  }

  const metadata = {
    category: input.category,
    match_type: matchType,
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
  const participants = [
    { userId, team: 1, isOrganizer: true, role: "organizer" },
    ...(isDoubles && matchType === "private"
      ? [
          { userId: partnerUserId!, team: 1, isOrganizer: false, role: "host_partner" },
          { userId: opponentUserId!, team: 2, isOrganizer: false, role: "opponent" },
          { userId: opponentPartnerUserId!, team: 2, isOrganizer: false, role: "opponent_partner" },
        ]
      : []),
  ];

  await connection.execute(
    `INSERT INTO matches
       (id, title, description, court_id, organizer_id, match_date, start_time,
        duration_minutes, max_players, current_players, status, is_private, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
    [
      matchId,
      title,
      input.description?.trim() || null,
      courtId,
      userId,
      input.matchDate,
      startTime,
      duration,
      maxParticipantRows(input.category),
      participants.length,
      matchType === "private",
      JSON.stringify(metadata),
    ]
  );
  for (const participant of participants) {
    await connection.execute(
      `INSERT INTO match_participants
         (id, match_id, user_id, is_organizer, team, metadata, confirmed_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        randomUUID(),
        matchId,
        participant.userId,
        participant.isOrganizer,
        participant.team,
        JSON.stringify({ status: "confirmed", role: participant.role, added_by: userId }),
      ]
    );
  }

  return matchId;
}
