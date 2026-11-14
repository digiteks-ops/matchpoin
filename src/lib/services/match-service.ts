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

async function getProfilesForUsers(userIds: string[]) {
  const supabase = createClient();
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return new Map<string, { full_name: string | null; avatar_url: string | null; gender: string | null; rating: number }>();

  // 1. Read user account names from public.users (authoritative source for full_name)
  const { data: usersData } = await supabase
    .from("users")
    .select("id, full_name, avatar_url")
    .in("id", unique);

  const userMap = new Map<string, { full_name: string | null; avatar_url: string | null }>();
  (usersData ?? []).forEach((u) => {
    userMap.set(u.id, { full_name: u.full_name, avatar_url: u.avatar_url ?? null });
  });

  // 2. Read player profile details from player_profiles (for rating, etc.)
  const { data: profilesData } = await supabase
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
  unique.forEach((id) => {
    const userInfo = userMap.get(id);
    const profile = profilesData?.find((p) => p.user_id === id);

    // Prefer users.full_name (account name) over player_profiles.display_name (tennis profile name)
    // This ensures the organizer/host name always matches the account that created the match.
    const fullName = userInfo?.full_name ?? profile?.display_name ?? null;

    profileMap.set(id, {
      full_name: fullName || "Pemain",
      avatar_url: userInfo?.avatar_url ?? null,
      gender: null,
      rating: ratingMap.get(id) ?? 1,
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

  const isDoublesCategory = input.category.includes("doubles");
  const matchType = input.matchType ?? "private";
  const partnerUserId = (input.partnerUserId ?? "").trim() || null;
  const opponentUserId = (input.opponentUserId ?? "").trim() || null;
  const opponentPartnerUserId = (input.opponentPartnerUserId ?? "").trim() || null;
  if (isDoublesCategory) {
    if (!partnerUserId) {
      throw new Error("Pilih partner Anda untuk pertandingan ganda.");
    }
    if (partnerUserId === userId) {
      throw new Error("Anda tidak dapat memilih diri sendiri sebagai partner.");
    }
    // Open doubles: opponent positions are optional and filled by joiners.
    // Private doubles: all 4 positions must be selected up front.
    if (matchType === "private") {
      if (!opponentUserId) {
        throw new Error("Pilih lawan untuk tim lawan (Team B).");
      }
      if (!opponentPartnerUserId) {
        throw new Error("Pilih partner lawan untuk tim lawan (Team B).");
      }
      if (opponentUserId === userId) {
        throw new Error("Lawan tidak boleh sama dengan Host.");
      }
      if (opponentPartnerUserId === userId) {
        throw new Error("Partner lawan tidak boleh sama dengan Host.");
      }
      if (opponentUserId === partnerUserId) {
        throw new Error("Lawan dan partner Host tidak boleh sama.");
      }
      if (opponentPartnerUserId === partnerUserId) {
        throw new Error("Partner lawan dan partner Host tidak boleh sama.");
      }
      if (opponentPartnerUserId === opponentUserId) {
        throw new Error("Lawan dan partner lawan tidak boleh sama.");
      }
      const { data: opponentProfile } = await supabase
        .from("player_profiles")
        .select("user_id")
        .eq("user_id", opponentUserId)
        .maybeSingle();
      if (!opponentProfile) {
        throw new Error("Lawan yang dipilih tidak ditemukan.");
      }
      const { data: opponentPartnerProfile } = await supabase
        .from("player_profiles")
        .select("user_id")
        .eq("user_id", opponentPartnerUserId)
        .maybeSingle();
      if (!opponentPartnerProfile) {
        throw new Error("Partner lawan yang dipilih tidak ditemukan.");
      }
    }
    const { data: partnerProfile } = await supabase
      .from("player_profiles")
      .select("user_id")
      .eq("user_id", partnerUserId)
      .maybeSingle();
    if (!partnerProfile) {
      throw new Error("Partner yang dipilih tidak ditemukan.");
    }
  } else if (partnerUserId) {
    throw new Error("Partner hanya diperlukan untuk pertandingan ganda.");
  }

  const metadata: MatchMetadata = {
    category: input.category,
    match_type: matchType,
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
      max_players: maxParticipantRows(input.category),
      current_players: 0,
      status: "open",
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

  if (isDoublesCategory && partnerUserId) {
    const { error: partnerError } = await supabase.from("match_participants").insert({
      match_id: matchData.id,
      user_id: partnerUserId,
      is_organizer: false,
      team: 1,
      metadata: { status: "confirmed", added_by: userId, role: "host_partner" },
      confirmed_at: new Date().toISOString(),
    });

    if (partnerError) {
      logError("match.create.partner", partnerError, { matchId: matchData.id, userId, partnerUserId });
      await supabase.from("match_participants").delete().eq("match_id", matchData.id);
      await supabase.from("matches").delete().eq("id", matchData.id);
      throw new Error(toUserMessage(partnerError, "Gagal menambahkan partner. Pertandingan dibatalkan."));
    }

    // Private doubles: also create opponent team positions up front.
    if (matchType === "private") {
      if (opponentUserId) {
        const { error: opponentError } = await supabase.from("match_participants").insert({
          match_id: matchData.id,
          user_id: opponentUserId,
          is_organizer: false,
          team: 2,
          metadata: { status: "confirmed", added_by: userId, role: "opponent" },
          confirmed_at: new Date().toISOString(),
        });

        if (opponentError) {
          logError("match.create.opponent", opponentError, { matchId: matchData.id, userId, opponentUserId });
          await supabase.from("match_participants").delete().eq("match_id", matchData.id);
          await supabase.from("matches").delete().eq("id", matchData.id);
          throw new Error(toUserMessage(opponentError, "Gagal menambahkan lawan. Pertandingan dibatalkan."));
        }
      }

      if (opponentPartnerUserId) {
        const { error: opponentPartnerError } = await supabase.from("match_participants").insert({
          match_id: matchData.id,
          user_id: opponentPartnerUserId,
          is_organizer: false,
          team: 2,
          metadata: { status: "confirmed", added_by: userId, role: "opponent_partner" },
          confirmed_at: new Date().toISOString(),
        });

        if (opponentPartnerError) {
          logError("match.create.opponentPartner", opponentPartnerError, { matchId: matchData.id, userId, opponentPartnerUserId });
          await supabase.from("match_participants").delete().eq("match_id", matchData.id);
          await supabase.from("matches").delete().eq("id", matchData.id);
          throw new Error(toUserMessage(opponentPartnerError, "Gagal menambahkan partner lawan. Pertandingan dibatalkan."));
        }
      }
    }

    await resyncPlayerCount(supabase, matchData.id);
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
    .select("id, organizer_id, status, metadata, max_players")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) throw new Error("Pertandingan tidak ditemukan.");
  if (match.organizer_id === userId) throw new Error("Anda adalah penyelenggara pertandingan ini.");
  if (match.status === "cancelled") throw new Error("Pertandingan ini telah dibatalkan.");
  if (match.status === "completed") throw new Error("Pertandingan ini telah selesai.");
  if (match.status !== "open") throw new Error("Pendaftaran pertandingan ini sudah ditutup.");

  const category = normalizeCategory(asMetadata(match.metadata).category ?? "mens_singles");
  const isDoublesCategory = category.includes("doubles");
  const matchType = asMetadata(match.metadata).match_type as MatchType ?? "private";
  const playersPerTeam = Math.ceil(logicalMaxPlayers(category) / 2);

  // Count confirmed players per team for doubles open matches.
  const { data: roster } = await supabase
    .from("match_participants")
    .select("id, user_id, team, metadata")
    .eq("match_id", matchId);

  const confirmedByTeam: Record<1 | 2, string[]> = { 1: [], 2: [] };
  (roster ?? []).forEach((p: any) => {
    const status = asParticipantMetadata(p.metadata).status;
    const team = (p.team === 2 ? 2 : 1) as 1 | 2;
    if (status === "confirmed" || status === "invited") {
      confirmedByTeam[team].push(p.user_id);
    }
  });

  // Prevent duplicate participation.
  const alreadyInTeam1 = confirmedByTeam[1].includes(userId);
  const alreadyInTeam2 = confirmedByTeam[2].includes(userId);
  if (alreadyInTeam1 || alreadyInTeam2) {
    const existing = (roster ?? []).find((p: any) => p.user_id === userId);
    if (existing) {
      const status = asParticipantMetadata(existing.metadata).status;
      if (status === "pending") {
        throw new Error("Anda sudah mengajukan permohonan bergabung pada pertandingan ini.");
      }
      throw new Error("Anda sudah terdaftar pada pertandingan ini.");
    }
    throw new Error("Anda sudah terdaftar pada pertandingan ini.");
  }

  // Determine which team the joiner should be assigned to.
  // For doubles open matches: fill Team B (challengers) first, then Team A partner slot.
  let assignedTeam: 1 | 2 = 2;
  if (isDoublesCategory && matchType === "open") {
    const teamBOpen = confirmedByTeam[2].length < playersPerTeam;
    const teamAOpen = confirmedByTeam[1].length < playersPerTeam;
    if (!teamBOpen && !teamAOpen) {
      throw new Error("Slot pertandingan sudah penuh.");
    }
    assignedTeam = teamBOpen ? 2 : 1;
  } else {
    // Singles or private doubles: check total capacity.
    const totalConfirmed = confirmedByTeam[1].length + confirmedByTeam[2].length;
    if (totalConfirmed >= logicalMaxPlayers(category)) throw new Error("Slot pertandingan sudah penuh.");
    assignedTeam = isDoublesCategory ? 2 : 2;
  }

  // Double-check capacity for the assigned team (race condition guard).
  if (confirmedByTeam[assignedTeam].length >= playersPerTeam) {
    throw new Error("Slot pertandingan sudah penuh.");
  }

  const { error } = await supabase.from("match_participants").insert({
    match_id: matchId,
    user_id: userId,
    is_organizer: false,
    team: assignedTeam,
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

  const profileIds = [
    ...(participants ?? []).map((p) => p.user_id),
    ...matches.map((m) => m.organizer_id),
  ];
  const profileMap = await getProfilesForUsers(profileIds);

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

  const profileIds = [
    ...(participants ?? []).map((p) => p.user_id),
    match.organizer_id,
  ];
  const profileMap = await getProfilesForUsers(profileIds);

  return buildMatchDetail(match, participants ?? [], profileMap);
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

  // Singles: host is always side 1, the other confirmed player is always side 2.
  const all = rawAll.map((p) => {
    if (maxPlayers <= 2 && p.status === "confirmed" && !p.isOrganizer && p.userId !== match.organizer_id) {
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
  const organizerParticipant = all.find((p) => p.isOrganizer) ?? confirmed.find((p) => p.userId === match.organizer_id);
  const organizerProfile = profileMap.get(match.organizer_id);
  const resolvedOrganizerName =
    (organizerParticipant?.fullName && organizerParticipant.fullName !== "Pemain"
      ? organizerParticipant.fullName
      : organizerProfile?.full_name && organizerProfile.full_name !== "Pemain"
      ? organizerProfile.full_name
      : null) || "Host";
  const organizerName = resolvedOrganizerName;

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