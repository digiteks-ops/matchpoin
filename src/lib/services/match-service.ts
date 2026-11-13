import { createClient } from "@/lib/supabase/server";
import { logError, toUserMessage } from "@/lib/errors";
import { ensurePlayerRecords } from "@/lib/services/player-sync";
import { toPlatformIsoString, todayInPlatformTimeZone } from "@/lib/utils";
import {
  MATCH_CATEGORY_LABELS,
  VALID_CATEGORIES,
  logicalMaxPlayers,
  maxParticipantRows,
  type CreateOpenMatchInput,
  type MatchCategory,
  type MatchParticipantInfo,
  type MatchStatus,
  type OpenMatchDetail,
  type UmpirePreference,
} from "@/lib/matches/constants";

export * from "@/lib/matches/constants";

const VALID_STATUSES: MatchStatus[] = ["open", "full", "in_progress", "completed", "cancelled"];

type MatchMetadata = {
  category?: string;
  umpire_option?: string;
  umpire_name?: string | null;
  min_rating?: number;
  max_rating?: number;
  level?: string;
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

async function getProfilesForUsers(userIds: string[]) {
  const supabase = createClient();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map<string, { full_name: string | null; avatar_url: string | null; gender: string | null; rating: number }>();

  const { data } = await supabase
    .from("player_profiles")
    .select("user_id, display_name, preferred_hand, backhand")
    .in("user_id", unique);

  const { data: ratings } = await supabase
    .from("player_ratings")
    .select("user_id, current_rating")
    .in("user_id", unique);

  const ratingMap = new Map<string, number>();
  (ratings ?? []).forEach((r) => ratingMap.set(r.user_id, Number(r.current_rating ?? 1)));

  const profileMap = new Map<string, { full_name: string | null; avatar_url: string | null; gender: string | null; rating: number }>();
  (data ?? []).forEach((p) => {
    profileMap.set(p.user_id, {
      full_name: p.display_name,
      avatar_url: null,
      gender: null,
      rating: ratingMap.get(p.user_id) ?? 1,
    });
  });

  // Public users table is not readable by RLS; player_profiles is the public source.
  unique.forEach((id) => {
    const existing = profileMap.get(id);
    profileMap.set(id, {
      full_name: existing?.full_name || "Pemain MATCHPOIN",
      avatar_url: existing?.avatar_url ?? null,
      gender: existing?.gender ?? null,
      rating: existing?.rating ?? ratingMap.get(id) ?? 1,
    });
  });

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

  const { data: court } = await supabase
    .from("tennis_courts")
    .select("id, status")
    .eq("id", input.courtId)
    .maybeSingle();

  if (!court) throw new Error("Lapangan tidak ditemukan.");
  if (court.status !== "available") throw new Error("Lapangan sedang tidak tersedia.");

  const metadata: MatchMetadata = {
    category: input.category,
    umpire_option: input.umpireOption,
    umpire_name: input.umpireName || null,
    min_rating: input.minRating ?? 1.0,
    max_rating: input.maxRating ?? 10.0,
    level: input.level ?? "all",
  };

  const { data: matchData, error: matchError } = await supabase
    .from("matches")
    .insert({
      title,
      description: input.description?.trim() || null,
      court_id: input.courtId,
      organizer_id: userId,
      match_date: input.matchDate,
      start_time: startTime,
      duration_minutes: duration,
      max_players: maxParticipantRows(input.category),
      current_players: 0,
      status: "open",
      level: input.level ?? "all",
      metadata,
    })
    .select("id")
    .single();

  if (matchError || !matchData) {
    logError("match.create", matchError, { userId, courtId: input.courtId });
    // 23503 = organizer has no public.users row (onboarding not completed).
    if (matchError?.code === "23503") {
      throw new Error("Profil pemain belum siap. Muat ulang halaman lalu coba lagi.");
    }
    throw new Error(toUserMessage(matchError, "Pertandingan gagal dibuat."));
  }

  const { error: participantError } = await supabase.from("match_participants").insert({
    match_id: matchData.id,
    user_id: userId,
    is_organizer: true,
    team: 1,
    metadata: { status: "confirmed" },
    confirmed_at: new Date().toISOString(),
  });

  if (participantError) {
    logError("match.create.organizer", participantError, { matchId: matchData.id, userId });
    // Roll back the match so we never leave an orphaned open match.
    await supabase.from("matches").delete().eq("id", matchData.id);
    throw new Error(toUserMessage(participantError, "Pertandingan gagal dibuat."));
  }

  return matchData.id;
}

/**
 * Submits a request to join an Open Match.
 */
export async function requestJoinOpenMatch(
  matchId: string,
  userId: string
): Promise<void> {
  const supabase = createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, organizer_id, status, metadata")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) throw new Error("Pertandingan tidak ditemukan.");
  if (match.organizer_id === userId) throw new Error("Anda adalah penyelenggara pertandingan ini.");
  if (match.status === "cancelled") throw new Error("Pertandingan ini telah dibatalkan.");
  if (match.status === "completed") throw new Error("Pertandingan ini telah selesai.");
  if (match.status !== "open") throw new Error("Pendaftaran pertandingan ini sudah ditutup.");

  const category = normalizeCategory(asMetadata(match.metadata).category ?? "mens_singles");
  const confirmed = await countConfirmedPlayers(supabase, matchId);
  if (confirmed >= logicalMaxPlayers(category)) throw new Error("Slot pertandingan sudah penuh.");

  const { data: existing } = await supabase
    .from("match_participants")
    .select("id, metadata")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const status = asParticipantMetadata(existing.metadata).status;
    if (status === "pending") {
      throw new Error("Anda sudah mengajukan permohonan bergabung pada pertandingan ini.");
    }
    if (status === "confirmed" || status === "invited") {
      throw new Error("Anda sudah terdaftar pada pertandingan ini.");
    }
    // A previous rejection can be re-requested: reuse the row instead of
    // inserting a duplicate.
    const { error: reviveError } = await supabase
      .from("match_participants")
      .update({ metadata: { ...asParticipantMetadata(existing.metadata), status: "pending" } })
      .eq("id", existing.id);

    if (reviveError) {
      logError("match.join.revive", reviveError, { matchId, userId });
      throw new Error(toUserMessage(reviveError, "Gagal mengajukan permohonan."));
    }
    return;
  }

  const { error } = await supabase.from("match_participants").insert({
    match_id: matchId,
    user_id: userId,
    is_organizer: false,
    metadata: { status: "pending" },
  });

  if (error) {
    logError("match.join", error, { matchId, userId });
    throw new Error(toUserMessage(error, "Gagal mengajukan permohonan."));
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
    .select("id, metadata")
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
  const team: 1 | 2 =
    logicalPlayers <= 2
      ? 2
      : team1Count < playersPerTeam && team1Count <= team2Count
      ? 1
      : 2;

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

const MATCH_SELECT =
  "id, title, description, court_id, organizer_id, match_date, start_time, duration_minutes, max_players, current_players, status, metadata, created_at, tennis_courts(name, address)";

async function hydrateMatches(matches: MatchRow[]): Promise<OpenMatchDetail[]> {
  if (matches.length === 0) return [];
  const supabase = createClient();
  const matchIds = matches.map((m) => m.id);

  const { data: participants } = await supabase
    .from("match_participants")
    .select("id, match_id, user_id, is_organizer, team, metadata, joined_at, confirmed_at")
    .in("match_id", matchIds);

  const profileMap = await getProfilesForUsers(
    (participants ?? []).map((p) => p.user_id)
  );

  return matches.map((m) => buildMatchDetail(m, participants ?? [], profileMap));
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

  const { data: participants } = await supabase
    .from("match_participants")
    .select("id, match_id, user_id, is_organizer, team, metadata, joined_at, confirmed_at")
    .eq("match_id", matchId);

  const profileMap = await getProfilesForUsers((participants ?? []).map((p) => p.user_id));

  return buildMatchDetail(match, participants ?? [], profileMap);
}

type MatchRow = {
  id: string;
  title: string;
  description: string | null;
  court_id: string;
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

  const toInfo = (p: ParticipantRow): MatchParticipantInfo => {
    const profile = profileMap.get(p.user_id);
    const participantMeta = asParticipantMetadata(p.metadata);
    return {
      id: p.id,
      userId: p.user_id,
      fullName: profile?.full_name || "Pemain MATCHPOIN",
      avatarUrl: profile?.avatar_url ?? null,
      gender: profile?.gender ?? null,
      rating: profile?.rating ?? 1,
      isOrganizer: Boolean(p.is_organizer),
      status:
        participantMeta.status === "pending"
          ? "pending"
          : participantMeta.status === "rejected"
          ? "rejected"
          : participantMeta.status === "invited"
          ? "invited"
          : "confirmed",
      team: p.team === 2 ? 2 : 1,
    };
  };

  const all = participants
    .filter((p) => p.is_organizer || isActiveParticipantStatus(asParticipantMetadata(p.metadata).status))
    .map(toInfo);
  const confirmed = all.filter((p) => p.status === "confirmed");
  const pending = all.filter((p) => p.status === "pending");
  const invited = all.filter((p) => p.status === "invited");
  const organizer = all.find((p) => p.isOrganizer);

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
    courtName: court?.name ?? "Lapangan tidak diketahui",
    courtAddress: court?.address ?? "",
    organizerId: match.organizer_id,
    organizerName: organizer?.fullName ?? "Pemain MATCHPOIN",
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
    participants: confirmed,
    pendingRequests: pending,
    invitedPlayers: invited,
    createdAt: match.created_at,
  };
}