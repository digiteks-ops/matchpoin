import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, toUserMessage } from "@/lib/errors";
import { ensurePlayerRecords } from "@/lib/services/player-sync";
import { toPlatformIsoString, todayInPlatformTimeZone } from "@/lib/utils";
import {
  buildExplicitTeamRoster,
  buildMatchRoster,
  MatchRosterError,
} from "@/lib/mysql/match-roster-core.mjs";
import {
  MATCH_CATEGORY_LABELS,
  VALID_CATEGORIES,
  logicalMaxPlayers,
  maxParticipantRows,
  type CreateOpenMatchInput,
  type MatchCategory,
  type MatchParticipantInfo,
  type MatchStatus,
  type MatchType,
  type OpenMatchDetail,
  type UmpirePreference,
} from "@/lib/matches/constants";

export * from "@/lib/matches/constants";

const VALID_STATUSES: MatchStatus[] = ["open", "full", "in_progress", "completed", "cancelled"];

/**
 * Cek apakah dua pemain sudah pernah bertanding dalam match yang Completed.
 * Digunakan untuk anti-rematch dalam liga.
 */
export async function hasPlayedBefore(
  supabase: ReturnType<typeof createClient>,
  userIdA: string,
  userIdB: string
): Promise<boolean> {
  const { data: results } = await supabase
    .from("match_results")
    .select("match_id")
    .eq("status", "confirmed");

  if (!results || results.length === 0) return false;

  const matchIds = results.map((r) => r.match_id);
  const { data: participants } = await supabase
    .from("match_participants")
    .select("match_id, user_id")
    .in("match_id", matchIds);

  if (!participants) return false;

  const matchPlayerSets: Record<string, string[]> = {};
  for (const p of participants) {
    if (!matchPlayerSets[p.match_id]) matchPlayerSets[p.match_id] = [];
    matchPlayerSets[p.match_id].push(p.user_id);
  }

  const matchIdList = Object.keys(matchPlayerSets);
  for (let i = 0; i < matchIdList.length; i++) {
    const players = matchPlayerSets[matchIdList[i]];
    if (players.includes(userIdA) && players.includes(userIdB)) return true;
  }

  return false;
}

type MatchMetadata = {
  category?: string;
  umpire_option?: string;
  umpire_name?: string | null;
  min_rating?: number;
  max_rating?: number;
  level?: string;
  court_name?: string | null;
  court_province?: string | null;
  court_city?: string | null;
  court_address?: string | null;
  manual_court?: boolean;
  [key: string]: unknown;
};

type ParticipantMetadata = {
  status?: string;
  [key: string]: unknown;
};

function asMetadata(value: unknown): MatchMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as MatchMetadata) : {};
}

function asParticipantMetadata(value: unknown): ParticipantMetadata {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ParticipantMetadata) : {};
}

/**
 * A participant row still counts towards the match roster while it is
 * confirmed, awaiting approval, or invited.
 */
function isActiveParticipantStatus(status: string | undefined): boolean {
  return status === "confirmed" || status === "pending" || status === "invited";
}

function normalizeCategory(category: string): MatchCategory {
  return VALID_CATEGORIES.includes(category as MatchCategory)
    ? (category as MatchCategory)
    : "mens_singles";
}

function normalizeStatus(status: string | null | undefined): MatchStatus {
  return VALID_STATUSES.includes(status as MatchStatus) ? (status as MatchStatus) : "open";
}

interface RosterParticipant {
  userId: string;
  team: 1 | 2;
  isOrganizer: boolean;
  role: string;
}

interface BuiltRoster {
  category: MatchCategory;
  matchType: MatchType;
  isPrivate: boolean;
  maxPlayers: number;
  currentPlayers: number;
  status: "open" | "full";
  participants: RosterParticipant[];
  playerIdsToVerify: string[];
}

function assertCategoryGender(
  category: MatchCategory,
  participants: RosterParticipant[],
  genderById: Map<string, string | null>,
  strict: boolean
): void {
  const genderOf = (userId: string): string | null => genderById.get(userId) ?? null;
  const requireGender = (userId: string): string | null => {
    const gender = genderOf(userId);
    if (!gender && strict) {
      throw new Error("Lengkapi jenis kelamin pemain di profil sebelum membuat pertandingan kategori ini.");
    }
    return gender;
  };

  if (category === "mixed_doubles") {
    const teams: Record<1 | 2, string[]> = { 1: [], 2: [] };
    for (const participant of participants) {
      teams[participant.team].push(participant.userId);
    }
    for (const team of [1, 2] as const) {
      const members = teams[team];
      if (members.length !== 2) continue;
      const genders = members.map(genderOf);
      if (genders.some((gender) => !gender)) {
        throw new Error("Lengkapi jenis kelamin kedua pemain untuk kategori ganda campuran.");
      }
      if (genders.includes("male") && genders.includes("female")) continue;
      throw new Error("Setiap tim ganda campuran wajib terdiri dari 1 pemain putra dan 1 pemain putri.");
    }
    return;
  }

  const requiredGender = category.startsWith("mens_")
    ? "male"
    : category.startsWith("womens_")
    ? "female"
    : null;
  if (!requiredGender) return;

  for (const participant of participants) {
    const gender = requireGender(participant.userId);
    if (gender && gender !== requiredGender) {
      throw new Error(
        requiredGender === "male"
          ? "Kategori putra hanya dapat diisi pemain putra."
          : "Kategori putri hanya dapat diisi pemain putri."
      );
    }
  }
}

async function getProfilesForUsers(userIds: string[]) {
  const supabase = createClient();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const profileMap = new Map<
    string,
    { full_name: string | null; avatar_url: string | null; gender: string | null; rating: number }
  >();
  if (unique.length === 0) return profileMap;

  // Single batched lookup for every card: `public_players` is a view that joins
  // users + player_profiles + player_ratings, so one query returns name, avatar
  // and rating for all organizers/participants. No per-card query (no N+1).
  const { data: publicRows } = await supabase
    .from("public_players")
    .select("user_id, full_name, display_name, avatar_url, current_rating")
    .in("user_id", unique);

  (publicRows ?? []).forEach((row) => {
    profileMap.set(row.user_id, {
      full_name: row.full_name ?? row.display_name ?? "Pemain",
      avatar_url: row.avatar_url ?? null,
      gender: null,
      rating: Number(row.current_rating ?? 1),
    });
  });

  // Players who keep their profile private are not in the public view. Fill
  // those few ids with one extra batched query so names still resolve.
  const missing = unique.filter((id) => !profileMap.has(id));
  if (missing.length > 0) {
    const [{ data: usersData }, { data: ratings }] = await Promise.all([
      supabase.from("users").select("id, full_name, avatar_url").in("id", missing),
      supabase.from("player_ratings").select("user_id, current_rating").in("user_id", missing),
    ]);
    const ratingMap = new Map<string, number>();
    (ratings ?? []).forEach((r) => ratingMap.set(r.user_id, Number(r.current_rating ?? 1)));
    (usersData ?? []).forEach((u) => {
      profileMap.set(u.id, {
        full_name: u.full_name ?? "Pemain",
        avatar_url: u.avatar_url ?? null,
        gender: null,
        rating: ratingMap.get(u.id) ?? 1,
      });
    });
  }

  return profileMap;
}

/**
 * Creates a new Open Match in Supabase. Must be called from a server context.
 */
export async function createOpenMatch(
  userId: string,
  input: CreateOpenMatchInput
): Promise<string> {
  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  const organizer = auth.user;
  if (!organizer) throw new Error("Sesi Anda berakhir. Masuk kembali.");

  await ensurePlayerRecords(organizer.id, organizer.email ?? "", organizer.user_metadata?.full_name);

  const title = (input.title ?? "").trim();
  if (title.length < 3) throw new Error("Judul pertandingan minimal 3 karakter.");
  if (title.length > 100) throw new Error("Judul pertandingan maksimal 100 karakter.");
  if (!VALID_CATEGORIES.includes(input.category)) {
    throw new Error("Kategori pertandingan tidak valid.");
  }

  const duration = Number(input.durationMinutes ?? 90);
  if (!Number.isFinite(duration) || duration < 30 || duration > 300) {
    throw new Error("Durasi pertandingan harus antara 30 sampai 300 menit.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.matchDate ?? "")) {
    throw new Error("Tanggal pertandingan tidak valid.");
  }
  const startTime = (input.startTime ?? "").length === 5 ? `${input.startTime}:00` : input.startTime ?? "";
  if (!/^\d{2}:\d{2}:\d{2}$/.test(startTime)) {
    throw new Error("Jam mulai tidak valid.");
  }

  const startsAt = toPlatformIsoString(input.matchDate, startTime);
  if (!startsAt) throw new Error("Jadwal pertandingan tidak valid.");
  if (new Date(startsAt).getTime() < Date.now()) {
    throw new Error("Jadwal pertandingan harus di waktu yang akan datang.");
  }
  if (input.matchDate < todayInPlatformTimeZone()) {
    throw new Error("Tanggal pertandingan tidak boleh di masa lalu.");
  }

  const manualCourtName = (input.courtName ?? "").trim();
  const manualProvince = (input.province ?? "").trim();
  const manualCity = (input.cityName ?? "").trim();
  let resolvedCourtId: string | null = input.courtId ?? null;

  if (resolvedCourtId) {
    const { data: court } = await supabase
      .from("tennis_courts")
      .select("id, status")
      .eq("id", resolvedCourtId)
      .maybeSingle();

    if (!court) throw new Error("Lapangan tidak ditemukan.");
    if (court.status !== "available") throw new Error("Lapangan sedang tidak tersedia.");
  } else {
    if (manualCourtName.length < 2) {
      throw new Error("Nama lapangan minimal 2 karakter.");
    }
    if (!manualProvince) {
      throw new Error("Provinsi lapangan wajib dipilih.");
    }
    if (!manualCity) {
      throw new Error("Kota/Kabupaten lapangan wajib dipilih.");
    }
  }

  const tournamentId = (input.tournamentId ?? "").trim() || null;
  const explicitTeam1 = Array.isArray(input.team1UserIds)
    ? input.team1UserIds.filter((id): id is string => Boolean(id))
    : [];
  const explicitTeam2 = Array.isArray(input.team2UserIds)
    ? input.team2UserIds.filter((id): id is string => Boolean(id))
    : [];

  let roster: BuiltRoster;
  try {
    if (explicitTeam1.length > 0 || explicitTeam2.length > 0) {
      roster = buildExplicitTeamRoster({
        category: input.category,
        team1UserIds: explicitTeam1,
        team2UserIds: explicitTeam2,
      }) as BuiltRoster;
    } else {
      const isDoublesCategory = input.category.includes("doubles");
      const wantsOpenSingles = !isDoublesCategory && input.matchType === "open";
      if (!isDoublesCategory && !wantsOpenSingles && !(input.opponentUserId ?? "").trim()) {
        throw new MatchRosterError("Pilih lawan untuk pertandingan tunggal (1 vs 1).");
      }
      roster = buildMatchRoster({
        category: input.category,
        matchType: input.matchType,
        organizerId: userId,
        partnerUserId: input.partnerUserId,
        opponentUserId: input.opponentUserId,
        opponentPartnerUserId: input.opponentPartnerUserId,
      }) as BuiltRoster;
    }
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : "Susunan pemain pertandingan tidak valid."
    );
  }

  const matchType = roster.matchType;
  const playerIds = Array.from(new Set(roster.participants.map((participant) => participant.userId)));
  const referencedPlayers = playerIds.filter((id) => id !== userId);

  if (!tournamentId && referencedPlayers.length > 0) {
    const { data: foundProfiles } = await supabase
      .from("player_profiles")
      .select("user_id")
      .in("user_id", referencedPlayers);

    const found = new Set((foundProfiles ?? []).map((profile) => profile.user_id));
    for (const id of referencedPlayers) {
      if (!found.has(id)) {
        throw new Error("Pemain yang dipilih tidak ditemukan.");
      }
    }
  }

  const { data: genderRows } = await supabase
    .from("users")
    .select("id, gender")
    .in("id", playerIds);
  const genderById = new Map<string, string | null>(
    (genderRows ?? []).map((row) => [row.id, row.gender ?? null])
  );
  assertCategoryGender(input.category, roster.participants, genderById, Boolean(tournamentId));

  if (tournamentId) {
    const { data: tournament, error: tournamentError } = await supabase
      .from("tournaments")
      .select("id, name, category, is_league")
      .eq("id", tournamentId)
      .maybeSingle();

    if (tournamentError) {
      throw new Error("Data turnamen tidak dapat dibaca. Pastikan migrasi turnamen sudah dijalankan.");
    }
    if (!tournament || tournament.is_league !== true) {
      throw new Error("Turnamen tidak ditemukan.");
    }
    if (tournament.category && tournament.category !== input.category) {
      throw new Error("Kategori pertandingan tidak sesuai dengan kategori turnamen.");
    }

    const { data: registrations, error: registrationError } = await supabase
      .from("tournament_participants")
      .select("user_id, status")
      .eq("tournament_id", tournamentId)
      .eq("category", input.category)
      .in("user_id", playerIds)
      .in("status", ["accepted", "confirmed"]);

    if (registrationError) {
      throw new Error("Data pendaftar turnamen tidak dapat dibaca.");
    }

    const acceptedPlayers = new Set((registrations ?? []).map((row) => row.user_id));
    if (playerIds.some((id) => !acceptedPlayers.has(id))) {
      throw new Error("Semua pemain harus terdaftar dan sudah diterima di kategori turnamen ini.");
    }
  }

  const metadata: MatchMetadata = {
    category: input.category,
    match_type: matchType,
    tournament_id: tournamentId,
    umpire_option: input.umpireOption,
    umpire_name: input.umpireName || null,
    min_rating: input.minRating ?? 1.0,
    max_rating: input.maxRating ?? 10.0,
    level: input.level ?? "all",
    reclub_link: input.reclubLink || null,
    race_to: input.raceToScore ?? 8,
    court_switch_at: input.courtSwitchAt ?? 4,
    court_swapped: false,
    manual_court: !resolvedCourtId,
    court_name: manualCourtName || null,
    court_province: manualProvince || null,
    court_city: manualCity || null,
    court_address: manualCourtName
      ? [manualCourtName, manualCity, manualProvince].filter(Boolean).join(", ")
      : null,
  };

  const { data: matchData, error: matchError } = await supabase
    .from("matches")
    .insert({
      title,
      description: input.description?.trim() || null,
      court_id: resolvedCourtId,
      organizer_id: userId,
      match_date: input.matchDate,
      start_time: startTime,
      duration_minutes: duration,
      max_players: roster.maxPlayers,
      current_players: 0,
      status: roster.status,
      is_private: roster.isPrivate,
      tournament_id: tournamentId,
      is_league_challenge: Boolean(tournamentId),
      level: input.level ?? "all",
      metadata,
    })
    .select("id")
    .single();

  if (matchError || !matchData) {
    logError("match.create", matchError, { userId, courtId: resolvedCourtId, courtName: manualCourtName || null });
    // 23503 = organizer has no public.users row (onboarding not completed).
    if (matchError?.code === "23503") {
      throw new Error("Profil pemain belum siap. Muat ulang halaman lalu coba lagi.");
    }
    throw new Error(toUserMessage(matchError, "Pertandingan gagal dibuat."));
  }

  const participantRows = roster.participants.map((participant) => ({
    match_id: matchData.id,
    user_id: participant.userId,
    is_organizer: participant.isOrganizer,
    team: participant.team,
    metadata: {
      status: "confirmed",
      role: participant.role,
      added_by: userId,
    },
    confirmed_at: new Date().toISOString(),
  }));

  const { error: participantError } = await supabase
    .from("match_participants")
    .insert(participantRows);

  if (participantError) {
    logError("match.create.participants", participantError, {
      matchId: matchData.id,
      userId,
      playerIds,
    });
    // Roll back the match so we never leave an orphaned match behind.
    await supabase.from("match_participants").delete().eq("match_id", matchData.id);
    await supabase.from("matches").delete().eq("id", matchData.id);
    throw new Error(toUserMessage(participantError, "Pertandingan gagal dibuat."));
  }

  await resyncPlayerCount(supabase, matchData.id);

  return matchData.id;
}

/**
 * Joins an Open Match.
 *
 * Capacity, duplicate and concurrency checks all live in the `join_match`
 * database function, which takes a row lock on the match before inserting.
 * The client-side code deliberately does not re-implement them: two players
 * tapping Join at the same instant must be serialised by the database, and a
 * fourth doubles player must never be able to squeeze in.
 */
export async function requestJoinOpenMatch(
  matchId: string,
  userId: string,
  preferredTeam: 1 | 2 | null = null
): Promise<void> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("join_match", {
    p_match_id: matchId,
    p_team: preferredTeam,
  });

  if (error) {
    logError("match.join", error, { matchId, userId });
    throw new Error(toUserMessage(error, "Gagal bergabung dengan pertandingan."));
  }

  const result = (data ?? {}) as { success?: boolean; message?: string };
  if (!result.success) {
    throw new Error(result.message || "Gagal bergabung dengan pertandingan.");
  }
}

/**
 * Withdraws from a match the caller did not organise.
 */
export async function leaveMatch(matchId: string, userId: string): Promise<void> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("leave_match", { p_match_id: matchId });

  if (error) {
    logError("match.leave", error, { matchId, userId });
    throw new Error(toUserMessage(error, "Gagal keluar dari pertandingan."));
  }

  const result = (data ?? {}) as { success?: boolean; message?: string };
  if (!result.success) {
    throw new Error(result.message || "Gagal keluar dari pertandingan.");
  }
}

async function assertOrganizer(matchId: string, userId: string) {
  const supabase = createClient();
  const { data: match } = await supabase
    .from("matches")
    .select("id, organizer_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) throw new Error("Pertandingan tidak ditemukan.");
  if (match.organizer_id !== userId) {
    throw new Error("Hanya penyelenggara pertandingan yang dapat melakukan tindakan ini.");
  }
  return supabase;
}

/**
 * Counts confirmed players (organizer included) for a match.
 */
async function countConfirmedPlayers(supabase: ReturnType<typeof createClient>, matchId: string): Promise<number> {
  const { data } = await supabase
    .from("match_participants")
    .select("is_organizer, metadata")
    .eq("match_id", matchId);

  return (data ?? []).filter(
    (row) => row.is_organizer || asParticipantMetadata(row.metadata).status === "confirmed"
  ).length;
}

/**
 * Resyncs the denormalised current_players column after a status change.
 * The database trigger only reacts to row inserts/deletes, so a pending row
 * that becomes confirmed would otherwise leave the counter stale.
 */
async function resyncPlayerCount(
  supabase: ReturnType<typeof createClient>,
  matchId: string
): Promise<void> {
  const confirmed = await countConfirmedPlayers(supabase, matchId);
  await supabase.from("matches").update({ current_players: confirmed }).eq("id", matchId);
}

/**
 * Accepts a participant request into an Open Match (organizer only).
 */
export async function acceptParticipantRequest(
  matchId: string,
  organizerUserId: string,
  participantUserId: string
): Promise<void> {
  const supabase = await assertOrganizer(matchId, organizerUserId);

  const { data: match } = await supabase
    .from("matches")
    .select("max_players, status, metadata")
    .eq("id", matchId)
    .single();

  if (!match) throw new Error("Pertandingan tidak ditemukan.");
  if (match.status !== "open") throw new Error("Pendaftaran pertandingan ini sudah ditutup.");

  const category = normalizeCategory(asMetadata(match.metadata).category ?? "mens_singles");
  const confirmed = await countConfirmedPlayers(supabase, matchId);
  if (confirmed >= logicalMaxPlayers(category)) {
    throw new Error("Slot pertandingan sudah penuh.");
  }

  const { data: participant } = await supabase
    .from("match_participants")
    .select("id, metadata, team")
    .eq("match_id", matchId)
    .eq("user_id", participantUserId)
    .maybeSingle();

  if (!participant) throw new Error("Permohonan peserta tidak ditemukan.");
  if (asParticipantMetadata(participant.metadata).status !== "pending") {
    throw new Error("Permohonan ini sudah diproses.");
  }

  const { data: roster } = await supabase
    .from("match_participants")
    .select("is_organizer, metadata, team")
    .eq("match_id", matchId);

  const teamOf = (value: unknown) => (value === 2 ? 2 : 1);
  const confirmedRoster = (roster ?? []).filter(
    (entry) => entry.is_organizer || asParticipantMetadata(entry.metadata).status === "confirmed"
  );
  const logicalPlayers = logicalMaxPlayers(category);
  const playersPerTeam = Math.ceil(logicalPlayers / 2);
  const team1Count = confirmedRoster.filter((entry) => teamOf(entry.team) === 1).length;
  const team2Count = confirmedRoster.filter((entry) => teamOf(entry.team) === 2).length;
  const preferredTeam =
    participant.team === 1 ? 1 : participant.team === 2 ? 2 : null;
  let team: 1 | 2;
  if (logicalPlayers <= 2) {
    team = 2;
  } else if (preferredTeam) {
    const teamCount = preferredTeam === 1 ? team1Count : team2Count;
    if (teamCount >= playersPerTeam) {
      throw new Error(
        preferredTeam === 1 ? "Tim host sudah penuh." : "Tim lawan sudah penuh."
      );
    }
    team = preferredTeam;
  } else {
    team =
      team1Count < playersPerTeam && team1Count <= team2Count ? 1 : 2;
  }

  const { error: updateError } = await supabase
    .from("match_participants")
    .update({
      metadata: { status: "confirmed" },
      confirmed_at: new Date().toISOString(),
      team,
    })
    .eq("id", participant.id);

  if (updateError) throw updateError;

  const newStatus: MatchStatus = confirmed + 1 >= logicalMaxPlayers(category) ? "full" : "open";

  const { error: matchUpdateError } = await supabase
    .from("matches")
    .update({
      current_players: confirmed + 1,
      status: newStatus,
    })
    .eq("id", matchId);

  if (matchUpdateError) throw matchUpdateError;
}

/**
 * Rejects a participant request (organizer only).
 */
export async function rejectParticipantRequest(
  matchId: string,
  organizerUserId: string,
  participantUserId: string
): Promise<void> {
  const supabase = await assertOrganizer(matchId, organizerUserId);

  // Locate the participant row first: RLS has no DELETE policy for
  // match_participants, so a rejection is recorded as a status change instead.
  const { data: row } = await supabase
    .from("match_participants")
    .select("id, metadata")
    .eq("match_id", matchId)
    .eq("user_id", participantUserId)
    .eq("is_organizer", false)
    .maybeSingle();

  if (!row) throw new Error("Peserta tidak ditemukan.");

  const { error } = await supabase
    .from("match_participants")
    .update({ metadata: { ...asParticipantMetadata(row.metadata), status: "rejected" } })
    .eq("id", row.id);

  if (error) {
    logError("match.reject", error, { matchId, participantUserId });
    throw new Error(toUserMessage(error, "Gagal menolak peserta."));
  }

  await resyncPlayerCount(supabase, matchId);
}

/**
 * Cancels an Open Match (organizer only).
 */
export async function cancelOpenMatch(
  matchId: string,
  organizerUserId: string,
  reason?: string
): Promise<void> {
  const supabase = await assertOrganizer(matchId, organizerUserId);

  const { data, error } = await supabase
    .from("matches")
    .update({
      status: "cancelled",
      cancellation_reason: reason?.trim() || "Dibatalkan oleh penyelenggara pertandingan.",
      cancelled_at: new Date().toISOString(),
      cancelled_by: organizerUserId,
    })
    .eq("id", matchId)
    .select("id");

  if (error) {
    logError("match.cancel", error, { matchId, organizerUserId });
    throw new Error(toUserMessage(error, "Pertandingan gagal dibatalkan."));
  }
  if (!data || data.length === 0) {
    throw new Error("Pertandingan tidak dapat dibatalkan.");
  }
}

export async function cancelTournamentMatchAsAdmin(
  matchId: string,
  adminUserId: string,
  reason?: string
): Promise<void> {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new Error("Supabase service role is not configured.");
  }

  const { data, error } = await supabase
    .from("matches")
    .update({
      status: "cancelled",
      cancellation_reason: reason?.trim() || "Dibatalkan oleh admin turnamen.",
      cancelled_at: new Date().toISOString(),
      cancelled_by: adminUserId,
    })
    .eq("id", matchId)
    .not("tournament_id", "is", null)
    .select("id");

  if (error) {
    logError("match.cancel.admin", error, { matchId, adminUserId });
    throw new Error(toUserMessage(error, "Pertandingan gagal dibatalkan."));
  }
  if (!data || data.length === 0) {
    throw new Error("Pertandingan turnamen tidak ditemukan atau tidak dapat dibatalkan.");
  }
}

const MATCH_SELECT =
  "id, title, description, court_id, organizer_id, match_date, start_time, duration_minutes, max_players, current_players, status, metadata, created_at, tennis_courts(name, address), match_participants(id, match_id, user_id, is_organizer, team, metadata, joined_at, confirmed_at)";

async function hydrateMatches(matches: MatchRow[]): Promise<OpenMatchDetail[]> {
  if (matches.length === 0) return [];

  // Participants arrive embedded in the match query (single round trip). Group
  // them per match so a card only counts and shows its own roster.
  const participantsByMatch = new Map<string, ParticipantRow[]>();
  const allParticipants: ParticipantRow[] = [];

  for (const match of matches) {
    const roster = ((match.match_participants ?? []) as ParticipantRow[]).filter(
      (participant) => participant.match_id === match.id
    );
    participantsByMatch.set(match.id, roster);
    allParticipants.push(...roster);
  }

  const profileIds = [
    ...allParticipants.map((p) => p.user_id),
    ...matches.map((m) => m.organizer_id),
  ];
  const profileMap = await getProfilesForUsers(profileIds);

  return matches.map((m) =>
    buildMatchDetail(m, participantsByMatch.get(m.id) ?? [], profileMap)
  );
}

/**
 * Returns open/full matches for the match list.
 */
export async function getOpenMatches(limit = 50): Promise<OpenMatchDetail[]> {
  const supabase = createClient();

  const { data: matches, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .in("status", ["open", "full"])
    .gte("match_date", todayInPlatformTimeZone())
    .order("match_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(limit);

  if (error) {
    logError("match.list", error);
    throw new Error(toUserMessage(error, "Gagal memuat pertandingan."));
  }

  return hydrateMatches((matches ?? []) as unknown as MatchRow[]);
}

/**
 * Returns upcoming matches the given player is confirmed for (organizer or accepted player).
 */
export async function getMyMatches(userId: string, limit = 10): Promise<OpenMatchDetail[]> {
  const supabase = createClient();

  const { data: participations, error: participationError } = await supabase
    .from("match_participants")
    .select("match_id, metadata")
    .eq("user_id", userId)
    .limit(200);

  if (participationError) {
    logError("match.mine.participants", participationError, { userId });
    throw new Error(toUserMessage(participationError, "Gagal memuat pertandingan Anda."));
  }

  const matchIds = Array.from(
    new Set(
      (participations ?? [])
        .filter((row) => {
          const status = asParticipantMetadata(row.metadata).status;
          return status !== "pending" && status !== "invited" && status !== "rejected";
        })
        .map((row) => row.match_id)
    )
  );
  if (matchIds.length === 0) return [];

  const { data: matches, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .in("id", matchIds)
    .in("status", ["open", "full", "in_progress"])
    .gte("match_date", todayInPlatformTimeZone())
    .order("match_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(limit);

  if (error) {
    logError("match.mine", error, { userId });
    throw new Error(toUserMessage(error, "Gagal memuat pertandingan Anda."));
  }

  return hydrateMatches((matches ?? []) as unknown as MatchRow[]);
}

/**
 * Returns one match detail. Must be called from a server context.
 */
export async function getMatchDetail(matchId: string): Promise<OpenMatchDetail | null> {
  const supabase = createClient();

  const { data: match, error } = await supabase
    .from("matches")
    .select(MATCH_SELECT)
    .eq("id", matchId)
    .maybeSingle();

  if (error) {
    logError("match.detail", error, { matchId });
    throw new Error(toUserMessage(error, "Gagal memuat pertandingan."));
  }
  if (!match) return null;

  const participants = ((match as unknown as MatchRow).match_participants ??
    []) as ParticipantRow[];

  const profileIds = [...participants.map((p) => p.user_id), match.organizer_id];
  const profileMap = await getProfilesForUsers(profileIds);

  return buildMatchDetail(match, participants, profileMap);
}

type MatchRow = {
  id: string;
  title: string;
  description: string | null;
  court_id: string | null;
  organizer_id: string;
  match_date: string;
  start_time: string;
  duration_minutes: number | null;
  max_players: number | null;
  current_players: number | null;
  status: string | null;
  metadata: unknown;
  created_at: string;
  tennis_courts: { name: string; address: string } | { name: string; address: string }[] | null;
  match_participants?: ParticipantRow[] | null;
};

type ParticipantRow = {
  id: string;
  match_id: string;
  user_id: string;
  is_organizer: boolean | null;
  team: number | null;
  metadata: unknown;
  joined_at: string | null;
  confirmed_at: string | null;
};

type ProfileMap = Map<string, { full_name: string | null; avatar_url: string | null; gender: string | null; rating: number }>;

function buildMatchDetail(
  match: MatchRow,
  participants: ParticipantRow[],
  profileMap: ProfileMap
): OpenMatchDetail {
  const meta = asMetadata(match.metadata);
  const category = normalizeCategory(meta.category ?? "mens_singles");
  const court = Array.isArray(match.tennis_courts) ? match.tennis_courts[0] : match.tennis_courts;
  const maxPlayers = logicalMaxPlayers(category);

  const rawAll = participants
    .filter((p) => p.is_organizer || isActiveParticipantStatus(asParticipantMetadata(p.metadata).status))
    .map((p) => {
      const profile = profileMap.get(p.user_id);
      const participantMeta = asParticipantMetadata(p.metadata);
      const isOrganizer = Boolean(p.is_organizer) || p.user_id === match.organizer_id;
      return {
        id: p.id,
        userId: p.user_id,
        fullName: profile?.full_name || "Pemain",
        avatarUrl: profile?.avatar_url ?? null,
        gender: profile?.gender ?? null,
        rating: profile?.rating ?? 1,
        isOrganizer,
        status:
          participantMeta.status === "pending"
            ? "pending"
            : participantMeta.status === "rejected"
            ? "rejected"
            : participantMeta.status === "invited"
            ? "invited"
            : "confirmed",
        team: (isOrganizer ? 1 : p.team === 2 ? 2 : p.team === 1 ? 1 : 2) as 1 | 2,
      } satisfies MatchParticipantInfo;
    });

  // Singles: when the organizer plays, they are side 1 and the opponent is
  // side 2. Tournament matches created by an admin have no organizer
  // participant, so the stored team assignment is authoritative.
  const organizerPlays = participants.some(
    (participant) => participant.is_organizer || participant.user_id === match.organizer_id
  );
  const all = rawAll.map((p) => {
    if (
      organizerPlays &&
      maxPlayers <= 2 &&
      p.status === "confirmed" &&
      !p.isOrganizer &&
      p.userId !== match.organizer_id
    ) {
      return { ...p, team: 2 as 1 | 2 };
    }
    if (p.isOrganizer || p.userId === match.organizer_id) {
      return { ...p, isOrganizer: true, team: 1 as 1 | 2 };
    }
    return p;
  });

  const confirmed = all.filter((p) => p.status === "confirmed");
  const pending = all.filter((p) => p.status === "pending");
  const invited = all.filter((p) => p.status === "invited");
  // The host shown on the card must be the match creator, never a participant
  // from another match or a player who merely joined.
  const organizerParticipant =
    all.find((p) => p.userId === match.organizer_id) ??
    confirmed.find((p) => p.userId === match.organizer_id);
  const organizerProfile = profileMap.get(match.organizer_id);
  const resolvedOrganizerName =
    (organizerParticipant?.fullName && organizerParticipant.fullName !== "Pemain"
      ? organizerParticipant.fullName
      : organizerProfile?.full_name && organizerProfile.full_name !== "Pemain"
      ? organizerProfile.full_name
      : null) || "Pemain";
  const organizerName = resolvedOrganizerName;
  const organizerAvatarUrl =
    organizerParticipant?.avatarUrl ?? organizerProfile?.avatar_url ?? null;

  // Host/organizer must always be Side 1 (Team A). Normalize display order for clarity.
  const sideSorted = [...confirmed].sort((a, b) => {
    const aSide = a.userId === match.organizer_id || a.isOrganizer ? 1 : a.team;
    const bSide = b.userId === match.organizer_id || b.isOrganizer ? 1 : b.team;
    if (aSide !== bSide) return aSide - bSide;
    return a.fullName.localeCompare(b.fullName);
  });

  // Counts are derived from confirmed participant rows so that a player who
  // accepts their own invite is reflected immediately.
  const currentPlayers = participants.length > 0 ? confirmed.length : match.current_players ?? 0;
  const availableSlots = Math.max(0, maxPlayers - currentPlayers);
  const storedStatus = normalizeStatus(match.status);
  const status: MatchStatus =
    storedStatus === "open" && availableSlots === 0 ? "full" : storedStatus;

  return {
    id: match.id,
    title: match.title,
    description: match.description,
    courtId: match.court_id,
    courtName:
      court?.name ||
      (typeof meta.court_name === "string" && meta.court_name.trim()) ||
      "Lapangan tidak diketahui",
    courtAddress:
      court?.address ||
      (typeof meta.court_address === "string" && meta.court_address.trim()) ||
      [typeof meta.court_city === "string" ? meta.court_city : null, typeof meta.court_province === "string" ? meta.court_province : null]
        .filter(Boolean)
        .join(", "),
    province: typeof meta.court_province === "string" ? meta.court_province : null,
    cityName: typeof meta.court_city === "string" ? meta.court_city : null,
    organizerId: match.organizer_id,
    organizerName,
    organizerAvatarUrl,
    matchDate: match.match_date,
    startTime: match.start_time,
    durationMinutes: match.duration_minutes ?? 90,
    category,
    categoryLabel: MATCH_CATEGORY_LABELS[category],
    umpireOption: meta.umpire_option === "dengan_wasit" ? "dengan_wasit" : "tanpa_wasit",
    umpireName: meta.umpire_name ?? null,
    minRating: Number(meta.min_rating ?? 1),
    maxRating: Number(meta.max_rating ?? 10),
    maxPlayers,
    currentPlayers,
    availableSlots,
    status,
    raceToScore: Number(meta.race_to ?? 8),
    courtSwitchAt: Number(meta.court_switch_at ?? 4),
    courtSwapped: Boolean(meta.court_swapped),
    participants: sideSorted,
    pendingRequests: pending,
    invitedPlayers: invited,
    createdAt: match.created_at,
  };
}
