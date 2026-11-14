import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/errors";
import {
  MATCH_CATEGORY_LABELS,
  logicalMaxPlayers,
  type MatchCategory,
} from "@/lib/matches/constants";
import { hasPlayedBefore } from "@/lib/services/match-service";

export type InviteStatus = "invited" | "confirmed" | "declined" | "revoked";

export interface PendingInvite {
  /** match_participants row id — the invite itself */
  id: string;
  matchId: string;
  title: string;
  matchDate: string;
  startTime: string;
  courtName: string;
  category: MatchCategory;
  categoryLabel: string;
  maxPlayers: number;
  invitedBy: string;
  invitedByName: string;
  createdAt: string;
}

type ParticipantMeta = {
  status?: string;
  invited_by?: string;
  invited_at?: string;
  [key: string]: unknown;
};

type MatchRow = {
  id: string;
  title: string;
  match_date: string;
  start_time: string;
  max_players: number | null;
  status: string | null;
  organizer_id: string;
  metadata: unknown;
  tennis_courts: { name: string } | { name: string }[] | null;
};

type ParticipantRow = {
  id: string;
  match_id: string;
  user_id: string;
  is_organizer: boolean | null;
  metadata: unknown;
  joined_at: string | null;
  matches: MatchRow | null;
};

function meta(value: unknown): ParticipantMeta {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ParticipantMeta) : {};
}

function matchMeta(value: unknown): { category?: string } {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as { category?: string }) : {};
}

function categoryLabel(category: string): string {
  return MATCH_CATEGORY_LABELS[category as MatchCategory] ?? "Pertandingan";
}

const INVITE_SELECT = `
  id,
  match_id,
  user_id,
  is_organizer,
  metadata,
  joined_at,
  matches (
    id,
    title,
    match_date,
    start_time,
    max_players,
    status,
    organizer_id,
    metadata,
    tennis_courts ( name )
  )
`;

/**
 * Invites a player to an existing match. Caller must be the organizer.
 * The invite is stored as a match_participants row with status "invited".
 */
export async function invitePlayerToMatch(
  matchId: string,
  organizerId: string,
  inviteeId: string
): Promise<string> {
  if (organizerId === inviteeId) {
    throw new Error("Tidak dapat mengundang diri sendiri.");
  }

  const supabase = createClient();

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("id, organizer_id, status, metadata")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError) throw matchError;
  if (!match) throw new Error("Pertandingan tidak ditemukan.");
  if (match.organizer_id !== organizerId) {
    throw new Error("Hanya penyelenggara yang dapat mengundang pemain.");
  }

  const alreadyPlayed = await hasPlayedBefore(supabase, organizerId, inviteeId);
  if (alreadyPlayed) {
    throw new Error("Anda sudah pernah bertanding dengan pemain ini. Anti-rematch aktif.");
  }
  if (match.status !== "open") {
    throw new Error("Undangan hanya dapat dikirim untuk pertandingan yang masih dibuka.");
  }

  const { data: existing } = await supabase
    .from("match_participants")
    .select("id, metadata")
    .eq("match_id", matchId)
    .eq("user_id", inviteeId)
    .maybeSingle();

  if (existing) {
    const status = meta(existing.metadata).status;
    if (status === "invited") throw new Error("Pemain ini sudah diundang.");
    if (status === "confirmed") throw new Error("Pemain ini sudah menjadi peserta.");
    throw new Error("Pemain ini sudah pernah diundang.");
  }

  const { data: profile } = await supabase
    .from("player_profiles")
    .select("user_id, allow_invites, is_profile_public")
    .eq("user_id", inviteeId)
    .maybeSingle();

  if (!profile) throw new Error("Pemain tidak ditemukan.");
  if (profile.is_profile_public === false || profile.allow_invites === false) {
    throw new Error("Pemain ini tidak menerima undangan.");
  }

  const category = (matchMeta(match.metadata).category ?? "mens_singles") as MatchCategory;
  const maxPlayers = logicalMaxPlayers(category);

  const { data: roster } = await supabase
    .from("match_participants")
    .select("is_organizer, metadata, team")
    .eq("match_id", matchId);

  const confirmedRoster = (roster ?? []).filter(
    (entry) => entry.is_organizer || meta(entry.metadata).status === "confirmed"
  );
  const confirmedCount = confirmedRoster.length;
  const invitedCount = (roster ?? []).filter((entry) => meta(entry.metadata).status === "invited").length;

  if (confirmedCount + invitedCount >= maxPlayers) {
    throw new Error("Slot pertandingan sudah penuh.");
  }

  // Singles: the invitee is always the opposing side. Doubles: fill the smaller team.
  const teamOf = (value: unknown) => (value === 2 ? 2 : 1);
  let team: 1 | 2 = 2;
  if (maxPlayers > 2) {
    const team1 = confirmedRoster.filter((entry) => teamOf(entry.team) === 1).length;
    const team2 = confirmedRoster.filter((entry) => teamOf(entry.team) === 2).length;
    team = team1 <= team2 ? 1 : 2;
  }

  const { data: row, error: insertError } = await supabase
    .from("match_participants")
    .insert({
      match_id: matchId,
      user_id: inviteeId,
      is_organizer: false,
      team,
      metadata: { status: "invited", invited_by: organizerId, invited_at: new Date().toISOString() },
    })
    .select("id")
    .single();

  if (insertError || !row) {
    logError("invite.insert", insertError, { matchId, inviteeId });
    throw insertError ?? new Error("Undangan gagal dikirim.");
  }

  // The insert trigger bumps matches.current_players for the invite row; put the
  // counter back to the number of confirmed players.
  const { error: resyncError } = await supabase
    .from("matches")
    .update({ current_players: confirmedCount })
    .eq("id", matchId)
    .eq("organizer_id", organizerId);

  if (resyncError) {
    logError("invite.resync", resyncError, { matchId, inviteeId });
  }

  return row.id;
}

/**
 * Returns invites addressed to the given player that are still awaiting a response.
 */
export async function getPendingInvites(userId: string, limit = 10): Promise<PendingInvite[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("match_participants")
    .select(INVITE_SELECT)
    .eq("user_id", userId)
    .eq("is_organizer", false)
    .order("joined_at", { ascending: false })
    .limit(50);

  if (error) {
    logError("invite.list", error, { userId });
    throw error;
  }

  const rows = ((data ?? []) as unknown as ParticipantRow[]).filter(
    (row) => meta(row.metadata).status === "invited" && row.matches
  );

  const inviterIds = Array.from(
    new Set(rows.map((row) => meta(row.metadata).invited_by ?? row.matches?.organizer_id ?? "").filter(Boolean))
  );

  const names = await getPlayerNames(inviterIds);

  return rows.slice(0, limit).map((row) => {
    const match = row.matches as MatchRow;
    const rowMeta = meta(row.metadata);
    const category = matchMeta(match.metadata).category ?? "mens_singles";
    const inviterId = rowMeta.invited_by ?? match.organizer_id;
    const court = Array.isArray(match.tennis_courts) ? match.tennis_courts[0] : match.tennis_courts;

    return {
      id: row.id,
      matchId: row.match_id,
      title: match.title,
      matchDate: match.match_date,
      startTime: match.start_time,
      courtName: court?.name ?? "Lapangan tidak diketahui",
      category: category as MatchCategory,
      categoryLabel: categoryLabel(category),
      maxPlayers: match.max_players ?? (category.includes("singles") ? 2 : 4),
      invitedBy: inviterId,
      invitedByName: names.get(inviterId) ?? "Pemain MATCHPOIN",
      createdAt: row.joined_at ?? new Date().toISOString(),
    };
  });
}

/**
 * Accepts or declines an invite. Only the invited player may respond.
 */
export async function respondToInvite(
  participantRowId: string,
  userId: string,
  action: "accept" | "decline"
): Promise<void> {
  const supabase = createClient();

  const { data: row, error: rowError } = await supabase
    .from("match_participants")
    .select("id, match_id, user_id, team, metadata, matches(status, metadata)")
    .eq("id", participantRowId)
    .maybeSingle();

  if (rowError) throw rowError;
  if (!row) throw new Error("Undangan tidak ditemukan.");
  if (row.user_id !== userId) throw new Error("Anda tidak berhak menanggapi undangan ini.");
  if (meta(row.metadata).status !== "invited") {
    throw new Error("Undangan ini sudah ditanggapi.");
  }

  const rawMatch = row.matches as unknown;
  const match = (Array.isArray(rawMatch) ? rawMatch[0] : rawMatch) as
    | { status: string | null; metadata: unknown }
    | null
    | undefined;
  if (!match) throw new Error("Pertandingan tidak ditemukan.");

  const category = (matchMeta(match.metadata).category ?? "mens_singles") as MatchCategory;
  const maxPlayers = logicalMaxPlayers(category);

  if (action === "decline") {
    // match_participants has no DELETE policy under RLS; a declined invite is
    // recorded as a status change so the row stays auditable.
    const { error: deleteError } = await supabase
      .from("match_participants")
      .update({ metadata: { ...meta(row.metadata), status: "declined" } })
      .eq("id", participantRowId)
      .eq("user_id", userId);

    if (deleteError) {
      logError("invite.decline", deleteError, { participantRowId, userId });
      throw deleteError;
    }
    return;
  }

  if (match.status === "cancelled") throw new Error("Pertandingan telah dibatalkan.");
  if (match.status === "completed") throw new Error("Pertandingan telah selesai.");

  const { data: roster, error: rosterError } = await supabase
    .from("match_participants")
    .select("id, is_organizer, metadata")
    .eq("match_id", row.match_id);

  if (rosterError) {
    logError("invite.accept.roster", rosterError, { participantRowId, userId });
    throw rosterError;
  }

  const confirmedCount = (roster ?? []).filter(
    (entry) => entry.is_organizer || meta(entry.metadata).status === "confirmed"
  ).length;

  if (confirmedCount + 1 > maxPlayers) {
    throw new Error("Slot pertandingan sudah penuh.");
  }

  const { error: updateError } = await supabase
    .from("match_participants")
    .update({
      metadata: { ...meta(row.metadata), status: "confirmed" },
      confirmed_at: new Date().toISOString(),
      team: row.team ?? 2,
    })
    .eq("id", participantRowId)
    .eq("user_id", userId);

  if (updateError) {
    logError("invite.accept", updateError, { participantRowId, userId });
    throw updateError;
  }
}

async function getPlayerNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (userIds.length === 0) return map;

  const supabase = createClient();
  const { data } = await supabase
    .from("player_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);

  (data ?? []).forEach((profile) => {
    map.set(profile.user_id, profile.display_name || "Pemain MATCHPOIN");
  });

  return map;
}