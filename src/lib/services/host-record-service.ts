import "server-only";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getHostCommunity, listCommunityMembers } from "@/lib/supabase/community-service";
import { createNotificationsForUsers } from "@/lib/notifications/notification-service";
import { logError } from "@/lib/errors";
import { normalizeImageUrl } from "@/lib/utils/image-url-core.mjs";
import { todayInPlatformTimeZone } from "@/lib/utils";
import {
  MATCH_CATEGORY_LABELS,
  VALID_CATEGORIES,
  logicalMaxPlayers,
  type MatchCategory,
} from "@/lib/matches/constants";

const RESULTS_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_RESULTS_BUCKET || "match-results";
const RACE_TO = 8;
const CONFIRM_WINDOW_HOURS = 24;

export interface HostRecordInput {
  matchDate: string;
  category: MatchCategory;
  team1UserIds: string[];
  team2UserIds: string[];
  team1Score: number;
  team2Score: number;
  winnerTeam: 1 | 2;
  photos: File[];
}

export interface HostRecordResult {
  matchId: string;
  title: string;
  confirmDeadline: string;
  notifiedPlayers: number;
}

export class HostRecordError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "HostRecordError";
    this.status = status;
  }
}

function cleanIds(value: string[]): string[] {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter((id) => id.length > 0)
    )
  );
}

function sameSet(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const set = new Set(left);
  return right.every((id) => set.has(id));
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function uploadPhotos(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  matchId: string,
  userId: string,
  photos: File[],
  uploadedPaths: string[]
): Promise<string[]> {
  const urls: string[] = [];

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index];
    if (photo.size <= 0) continue;
    if (photo.size > 1024 * 1024) {
      throw new HostRecordError("Foto bukti maksimal 1 MB setelah dikompres.");
    }

    const extension =
      photo.type === "image/webp" ? "webp" : photo.type === "image/png" ? "png" : "jpg";
    const path = `matches/${matchId}/${userId}/${Date.now()}-${index}.${extension}`;
    const { error } = await admin.storage
      .from(RESULTS_BUCKET)
      .upload(path, Buffer.from(await photo.arrayBuffer()), {
        cacheControl: "3600",
        upsert: false,
        contentType: photo.type || "image/webp",
      });

    if (error) {
      throw new HostRecordError(`Gagal mengunggah foto bukti: ${error.message}`, 500);
    }

    uploadedPaths.push(path);
    const {
      data: { publicUrl },
    } = admin.storage.from(RESULTS_BUCKET).getPublicUrl(path);
    urls.push(normalizeImageUrl(publicUrl));
  }

  return urls;
}

export async function recordHostMatch(
  hostId: string,
  input: HostRecordInput
): Promise<HostRecordResult> {
  const admin = createAdminClient();
  if (!admin) {
    throw new HostRecordError("Konfigurasi server belum lengkap.", 500);
  }

  if (!VALID_CATEGORIES.includes(input.category)) {
    throw new HostRecordError("Kategori pertandingan tidak valid.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.matchDate ?? "")) {
    throw new HostRecordError("Tanggal pertandingan tidak valid.");
  }
  if (input.matchDate > todayInPlatformTimeZone()) {
    throw new HostRecordError("Tanggal pertandingan tidak boleh di masa depan.");
  }

  const playersPerTeam = input.category.includes("singles") ? 1 : 2;
  const team1 = cleanIds(input.team1UserIds);
  const team2 = cleanIds(input.team2UserIds);
  if (team1.length !== playersPerTeam || team2.length !== playersPerTeam) {
    throw new HostRecordError(
      playersPerTeam === 1
        ? "Pertandingan tunggal wajib memiliki 1 pemain di setiap tim."
        : "Pertandingan ganda wajib memiliki 2 pemain di setiap tim."
    );
  }

  const allPlayers = [...team1, ...team2];
  if (new Set(allPlayers).size !== allPlayers.length) {
    throw new HostRecordError("Setiap pemain hanya boleh mengisi satu posisi.");
  }
  if (allPlayers.includes(hostId) && !team1.includes(hostId)) {
    throw new HostRecordError("Host yang ikut bermain harus berada di Tim 1.");
  }

  if (
    !Number.isInteger(input.team1Score) ||
    !Number.isInteger(input.team2Score) ||
    input.team1Score < 0 ||
    input.team2Score < 0
  ) {
    throw new HostRecordError("Skor harus berupa bilangan bulat dan tidak negatif.");
  }
  if (input.team1Score === input.team2Score) {
    throw new HostRecordError("Pertandingan tenis tidak boleh berakhir seri.");
  }

  const expectedWinner = input.team1Score > input.team2Score ? 1 : 2;
  if (input.winnerTeam !== expectedWinner) {
    throw new HostRecordError("Pemenang tidak sesuai dengan skor yang dimasukkan.");
  }
  if (Math.max(input.team1Score, input.team2Score) !== RACE_TO) {
    throw new HostRecordError(
      `Skor tidak valid. Format pertandingan Race to ${RACE_TO}: pemenang harus mencapai ${RACE_TO} poin.`
    );
  }

  const community = await getHostCommunity(hostId);
  if (!community) {
    throw new HostRecordError("Buat komunitas terlebih dahulu sebelum mencatat hasil.");
  }

  const members = await listCommunityMembers(community.id);
  const memberNames = new Map(
    members.map((member) => [
      member.user_id,
      member.full_name || member.email || "Pemain",
    ])
  );
  const allowedPlayers = new Set([hostId, ...members.map((member) => member.user_id)]);
  for (const playerId of allPlayers) {
    if (!allowedPlayers.has(playerId)) {
      throw new HostRecordError(
        "Semua pemain harus menjadi anggota komunitas Anda.",
        403
      );
    }
  }

  const nameOf = (playerId: string) =>
    playerId === hostId ? community.admin_name || "Host" : memberNames.get(playerId) || "Pemain";
  const title = `Catatan Host: ${team1.map(nameOf).join(" & ")} vs ${team2
    .map(nameOf)
    .join(" & ")}`.slice(0, 100);

  // Duplicate guard: the same host cannot record the same teams twice on the
  // same date for the same category. A double click or a retried request is
  // rejected before any new match row is written.
  const { data: existingMatches, error: existingError } = await admin
    .from("matches")
    .select("id, metadata, match_participants(user_id, team), match_results(id)")
    .eq("organizer_id", hostId)
    .eq("match_date", input.matchDate)
    .neq("status", "cancelled");

  if (existingError) {
    logError("host.record.duplicate_check", existingError, { hostId });
    throw new HostRecordError("Gagal memeriksa duplikasi hasil pertandingan.", 500);
  }

  const duplicate = (existingMatches ?? []).find((match) => {
    const metadata = (match.metadata ?? {}) as Record<string, unknown>;
    if (metadata.category !== input.category) return false;
    const resultRows = match.match_results;
    const hasResult = Array.isArray(resultRows)
      ? resultRows.length > 0
      : Boolean(resultRows);
    if (!hasResult) return false;
    const participants = (match.match_participants ?? []) as {
      user_id: string;
      team: number | null;
    }[];
    const existingTeam1 = participants
      .filter((participant) => (participant.team ?? 1) === 1)
      .map((participant) => participant.user_id);
    const existingTeam2 = participants
      .filter((participant) => participant.team === 2)
      .map((participant) => participant.user_id);
    return sameSet(existingTeam1, team1) && sameSet(existingTeam2, team2);
  });

  if (duplicate) {
    throw new HostRecordError(
      "Hasil pertandingan untuk susunan pemain ini pada tanggal tersebut sudah dicatat.",
      409
    );
  }

  const now = new Date();
  const confirmDeadline = addHours(now, CONFIRM_WINDOW_HOURS).toISOString();
  const matchId = randomUUID();
  const uploadedPaths: string[] = [];

  try {
    const { error: matchError } = await admin.from("matches").insert({
      id: matchId,
      title,
      description: null,
      court_id: null,
      organizer_id: hostId,
      community_id: community.id,
      match_date: input.matchDate,
      start_time: "00:00:00",
      duration_minutes: 90,
      max_players: logicalMaxPlayers(input.category),
      current_players: 0,
      status: "pending",
      is_private: true,
      submitted_by: hostId,
      submitted_at: now.toISOString(),
      confirm_deadline: confirmDeadline,
      metadata: {
        category: input.category,
        category_label: MATCH_CATEGORY_LABELS[input.category],
        match_type: "private",
        tournament_id: null,
        umpire_option: "tanpa_wasit",
        umpire_name: null,
        race_to: RACE_TO,
        court_switch_at: 4,
        court_swapped: false,
        manual_court: true,
        court_name: "Catatan Host",
        court_province: null,
        court_city: null,
        court_address: null,
        recorded_by_host: true,
        submitted_by: hostId,
        status_actor: hostId,
        confirm_deadline: confirmDeadline,
      },
    });

    if (matchError) {
      throw new HostRecordError(
        `Pertandingan gagal dibuat: ${matchError.message}`,
        500
      );
    }

    const participantRows = [
      ...team1.map((playerId, index) => ({
        match_id: matchId,
        user_id: playerId,
        is_organizer: playerId === hostId,
        team: 1,
        metadata: {
          status: "confirmed",
          role: index === 0 ? "team1_captain" : "team1_partner",
          added_by: hostId,
        },
        confirmed_at: now.toISOString(),
      })),
      ...team2.map((playerId, index) => ({
        match_id: matchId,
        user_id: playerId,
        is_organizer: false,
        team: 2,
        metadata: {
          status: "confirmed",
          role: index === 0 ? "team2_captain" : "team2_partner",
          added_by: hostId,
        },
        confirmed_at: now.toISOString(),
      })),
    ];

    const { error: participantError } = await admin
      .from("match_participants")
      .insert(participantRows);
    if (participantError) {
      throw new HostRecordError(
        `Pemain gagal disimpan: ${participantError.message}`,
        500
      );
    }

    const photoUrls = await uploadPhotos(admin, matchId, hostId, input.photos ?? [], uploadedPaths);

    const { error: resultError } = await admin.from("match_results").insert({
      match_id: matchId,
      team1_score: input.team1Score,
      team2_score: input.team2Score,
      winner_team: input.winnerTeam,
      submitted_by: hostId,
      status: "pending",
      submitted_at: now.toISOString(),
      metadata: {
        photo_urls: photoUrls,
        dispute_deadline: confirmDeadline,
        submitted_via: "host_record",
        status_actor: hostId,
      },
    });

    if (resultError) {
      throw new HostRecordError(`Hasil gagal disimpan: ${resultError.message}`, 500);
    }
  } catch (error) {
    await admin.from("matches").delete().eq("id", matchId);
    if (uploadedPaths.length > 0) {
      try {
        await admin.storage.from(RESULTS_BUCKET).remove(uploadedPaths);
      } catch {
        // Best effort cleanup; the failed submission must still surface.
      }
    }
    if (error instanceof HostRecordError) throw error;
    logError("host.record.create", error, { hostId, matchId });
    throw new HostRecordError("Hasil pertandingan gagal dicatat.", 500);
  }

  const recipients = Array.from(new Set(allPlayers.filter((playerId) => playerId !== hostId)));
  try {
    await createNotificationsForUsers(recipients, {
      type: "match_challenge",
      title: "Hasil Pertandingan Menunggu Konfirmasi",
      message: `Hasil "${title}" menunggu konfirmasi Anda. Terima atau sanggah dalam 24 jam.`,
      data: { matchId, matchTitle: title, resultStatus: "pending" },
      referenceId: matchId,
    });
  } catch (error) {
    logError("host.record.notify", error, { hostId, matchId });
  }

  return {
    matchId,
    title,
    confirmDeadline,
    notifiedPlayers: recipients.length,
  };
}
