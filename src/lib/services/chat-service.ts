import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logError, toUserMessage } from "@/lib/errors";

/**
 * Chat sederhana.
 *
 * Dua jenis percakapan, keduanya memakai tabel chat yang sudah ada sejak 00010
 * (`conversations`, `conversation_members`, `messages`) beserta RLS-nya:
 *
 *  - `match`: percakapan grup satu pertandingan (`conversations.match_id`),
 *    berisi seluruh peserta aktif — host, partner, lawan, dan penantang yang
 *    sudah diterima.
 *  - `dm`: percakapan pribadi host ↔ penantang lewat RPC `get_or_create_dm`.
 *
 * Service ini tidak membuka akses baru: setiap query tetap tunduk pada RLS,
 * sehingga percakapan orang lain tidak pernah terbaca.
 */

export type ChatConversationKind = "match" | "dm";

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  content: string;
  type: string;
  createdAt: string;
}

export interface ChatMember {
  userId: string;
  name: string;
  avatarUrl: string | null;
  isOrganizer: boolean;
}

export interface ChatConversationSummary {
  conversationId: string;
  kind: ChatConversationKind;
  title: string;
  /** Keterangan pendek di bawah judul: tanggal pertandingan atau "Chat pribadi". */
  subtitle: string | null;
  matchId: string | null;
  matchDate: string | null;
  startTime: string | null;
  otherUserId: string | null;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  memberCount: number;
}

export interface ChatConversationDetail extends ChatConversationSummary {
  members: ChatMember[];
  messages: ChatMessage[];
}

const CONVERSATION_COLUMNS = "id, is_group, match_id, title, last_message_at, last_message_preview";

type ConversationRow = {
  id: string;
  is_group: boolean | null;
  match_id: string | null;
  title: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};

/**
 * True bila `userId` peserta aktif pertandingan: host, atau baris peserta
 * berstatus `confirmed`. Penantang yang masih `pending` belum peserta, jadi
 * belum masuk chat grup — mereka memakai chat pribadi ke host.
 */
export async function isMatchChatParticipant(matchId: string, userId: string): Promise<boolean> {
  const supabase = createClient();

  const { data: match } = await supabase
    .from("matches")
    .select("id, organizer_id")
    .eq("id", matchId)
    .maybeSingle();

  if (!match) return false;
  if (match.organizer_id === userId) return true;

  const { data: row } = await supabase
    .from("match_participants")
    .select("is_organizer, metadata")
    .eq("match_id", matchId)
    .eq("user_id", userId)
    .is("left_at", null)
    .maybeSingle();

  if (!row) return false;

  const metadata =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as { status?: string })
      : {};

  return Boolean(row.is_organizer) || (metadata.status ?? "confirmed") === "confirmed";
}

/**
 * Membuka (atau membuat) percakapan grup pertandingan.
 *
 * Prioritas RPC `get_or_create_match_chat` (00044) yang atomik. Bila migrasi
 * belum dijalankan di database, jalur cadangan di bawah tetap menyelesaikan
 * hal yang sama memakai tabel yang sudah ada sejak 00010 — dengan konsekuensi
 * duplikasi sangat kecil bila dua orang membuka chat pada milidetik yang sama,
 * yang ditutup oleh index unik begitu 00044 diterapkan.
 */
export async function openMatchChat(matchId: string): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_or_create_match_chat", {
    p_match_id: matchId,
  });

  if (!error) {
    const result = (data ?? {}) as { success?: boolean; message?: string; conversationId?: string };
    if (!result.success || !result.conversationId) {
      throw new Error(result.message || "Gagal membuka chat pertandingan.");
    }
    return result.conversationId;
  }

  // PGRST202 = fungsi belum ada (migrasi 00044 belum dijalankan).
  if (error.code !== "PGRST202") {
    logError("chat.open_match", error, { matchId });
    throw new Error(toUserMessage(error, "Gagal membuka chat pertandingan."));
  }

  return openMatchChatWithoutRpc(supabase, matchId);
}

/** Jalur cadangan `openMatchChat` untuk database yang belum menjalankan 00044. */
async function openMatchChatWithoutRpc(
  supabase: SupabaseClient,
  matchId: string
): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Anda harus masuk untuk membuka chat pertandingan.");
  if (!(await isMatchChatParticipant(matchId, user.id))) {
    throw new Error("Hanya peserta pertandingan yang dapat membuka chat ini.");
  }

  const { data: match } = await supabase
    .from("matches")
    .select("id, title")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) throw new Error("Pertandingan tidak ditemukan.");

  const { data: existing } = await supabase
    .from("conversations")
    .select("id")
    .eq("match_id", matchId)
    .eq("is_group", true)
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    // Pemanggil sudah peserta yang terverifikasi di atas, jadi ia juga anggota
    // percakapan; tidak perlu menyentuh service role untuk membacanya.
    const admin = createAdminClient();
    if (admin) {
      await upsertMembers(admin, existing.id, await activeParticipantIds(admin, matchId, user.id), matchId);
    }
    return existing.id;
  }

  // Percakapan grup berisi banyak pemain, sedangkan policy INSERT
  // conversation_members hanya mengizinkan penambahan anggota oleh pembuat
  // percakapan. Jalur cadangan memakai service role SETELAH keanggotaan
  // pemanggil diverifikasi di atas.
  const admin = createAdminClient();
  if (!admin) {
    logError(
      "chat.open_match.no_admin",
      new Error("SUPABASE_SERVICE_ROLE_KEY tidak tersedia"),
      { matchId }
    );
    throw new Error(
      "Chat pertandingan belum siap di server ini. Minta admin menjalankan migrasi 00044."
    );
  }

  const { data: inserted, error: createError } = await admin
    .from("conversations")
    .insert({ created_by: user.id, is_group: true, title: match.title, match_id: matchId })
    .select("id");

  let conversationId = inserted?.[0]?.id ?? null;

  if (createError || !conversationId) {
    // Index unik 00044 menolak percakapan kedua untuk pertandingan yang sama:
    // pakai percakapan yang sudah menang balapan.
    const { data: raced } = await admin
      .from("conversations")
      .select("id")
      .eq("match_id", matchId)
      .eq("is_group", true)
      .limit(1)
      .maybeSingle();
    if (!raced) {
      logError("chat.open_match.fallback.create", createError, { matchId });
      throw new Error("Gagal membuka chat pertandingan.");
    }
    conversationId = raced.id;
  }

  await upsertMembers(admin, conversationId, await activeParticipantIds(admin, matchId, user.id), matchId);

  return conversationId;
}

/** Tambahkan peserta pertandingan sebagai anggota percakapan (idempoten). */
async function upsertMembers(
  admin: SupabaseClient,
  conversationId: string,
  memberIds: string[],
  matchId: string
): Promise<void> {
  if (memberIds.length === 0) return;
  const { error } = await admin.from("conversation_members").upsert(
    memberIds.map((memberId) => ({
      conversation_id: conversationId,
      user_id: memberId,
      role: "member",
    })),
    { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
  );
  if (error) logError("chat.open_match.members", error, { matchId });
}

/** Peserta aktif pertandingan (host + baris confirmed) plus pemanggil. */
async function activeParticipantIds(
  reader: SupabaseClient,
  matchId: string,
  callerId: string
): Promise<string[]> {
  const { data: rows } = await reader
    .from("match_participants")
    .select("user_id, is_organizer, metadata, left_at")
    .eq("match_id", matchId);

  const participantIds = (rows ?? [])
    .filter((row) => {
      if (row.left_at) return false;
      if (row.is_organizer) return true;
      const metadata =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as { status?: string })
          : {};
      return (metadata.status ?? "confirmed") === "confirmed";
    })
    .map((row) => row.user_id);

  return Array.from(new Set([...participantIds, callerId]));
}

/**
 * Membuka percakapan pribadi dengan pemain lain (dipakai penantang untuk
 * menghubungi host sebelum permohonannya diterima).
 */
export async function openDirectChat(otherUserId: string): Promise<string> {
  const supabase = createClient();

  const { data, error } = await supabase.rpc("get_or_create_dm", {
    p_other_user_id: otherUserId,
  });

  if (error) {
    logError("chat.open_dm", error, { otherUserId });
    throw new Error(toUserMessage(error, "Gagal membuka chat pribadi."));
  }

  const result = (data ?? {}) as { success?: boolean; message?: string; conversationId?: string };
  if (!result.success || !result.conversationId) {
    throw new Error(result.message || "Gagal membuka chat pribadi.");
  }
  return result.conversationId;
}

/**
 * Mendaftarkan peserta yang baru diterima ke percakapan grup. Best effort:
 * kegagalan TIDAK boleh menggagalkan penerimaan peserta.
 */
export async function syncMatchChatMembers(matchId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;

    const { error } = await admin.rpc("sync_match_chat_members", { p_match_id: matchId });
    if (error && error.code !== "PGRST202") {
      logError("chat.sync_members", error, { matchId });
      return;
    }

    // PGRST202: migrasi 00044 belum dijalankan. Sinkronkan lewat tabel, dan
    // hanya bila percakapan sudah ada (jangan buat chat kosong).
    if (error) {
      const { data: conversation } = await admin
        .from("conversations")
        .select("id")
        .eq("match_id", matchId)
        .eq("is_group", true)
        .limit(1)
        .maybeSingle();
      if (!conversation) return;

      const { data: roster } = await admin
        .from("match_participants")
        .select("user_id, is_organizer, metadata, left_at")
        .eq("match_id", matchId);

      const memberIds = (roster ?? [])
        .filter((row) => {
          if (row.left_at) return false;
          if (row.is_organizer) return true;
          const metadata =
            row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
              ? (row.metadata as { status?: string })
              : {};
          return (metadata.status ?? "confirmed") === "confirmed";
        })
        .map((row) => row.user_id);

      if (memberIds.length === 0) return;

      const { error: memberError } = await admin.from("conversation_members").upsert(
        memberIds.map((memberId) => ({
          conversation_id: conversation.id,
          user_id: memberId,
          role: "member",
        })),
        { onConflict: "conversation_id,user_id", ignoreDuplicates: true }
      );
      if (memberError) logError("chat.sync_members.fallback", memberError, { matchId });
    }
  } catch (error) {
    logError("chat.sync_members.exception", error, { matchId });
  }
}

type RawMessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string | null;
  type: string | null;
  created_at: string;
};

/**
 * Membaca pesan sebuah percakapan beserta nama/avatar pengirim.
 *
 * RLS "members read messages" yang menentukan siapa boleh membaca; nama
 * pengirim diambil dari `users` + `player_profiles` (keduanya punya policy
 * baca sendiri), jadi tidak perlu view tambahan di database.
 */
async function loadMessages(
  supabase: SupabaseClient,
  conversationId: string,
  ascending: boolean,
  limit: number
): Promise<ChatMessage[]> {
  const { data: rows, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, content, type, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending })
    .limit(limit);

  if (error) {
    logError("chat.messages", error, { conversationId });
    throw new Error(toUserMessage(error, "Gagal memuat pesan."));
  }

  return mapMessageRows(supabase, (rows ?? []) as RawMessageRow[]);
}

/** Lengkapi baris pesan dengan nama & avatar pengirim. */
async function mapMessageRows(
  supabase: SupabaseClient,
  rows: RawMessageRow[]
): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];

  const senderIds = Array.from(new Set(rows.map((row) => row.sender_id)));
  const nameById = await loadPlayerNames(supabase, senderIds);

  return rows.map((row) => {
    const sender = nameById.get(row.sender_id);
    return {
      id: row.id,
      conversationId: row.conversation_id,
      senderId: row.sender_id,
      senderName: sender?.name ?? "Pemain",
      senderAvatarUrl: sender?.avatarUrl ?? null,
      content: row.content ?? "",
      type: row.type ?? "text",
      createdAt: row.created_at,
    };
  });
}

/** Nama + avatar pemain, toleran terhadap profil yang tidak publik. */
async function loadPlayerNames(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, { name: string; avatarUrl: string | null }>> {
  const result = new Map<string, { name: string; avatarUrl: string | null }>();
  if (userIds.length === 0) return result;

  const [{ data: userRows }, { data: profileRows }] = await Promise.all([
    supabase.from("users").select("id, full_name, avatar_url").in("id", userIds),
    supabase.from("player_profiles").select("user_id, display_name").in("user_id", userIds),
  ]);

  const displayNameById = new Map(
    (profileRows ?? []).map((row) => [row.user_id, row.display_name as string | null])
  );

  for (const row of userRows ?? []) {
    result.set(row.id, {
      name: displayNameById.get(row.id) || row.full_name || "Pemain",
      avatarUrl: row.avatar_url ?? null,
    });
  }

  // Profil tanpa baris `users` tetap diberi nama default supaya UI tidak kosong.
  for (const userId of userIds) {
    if (!result.has(userId)) result.set(userId, { name: "Pemain", avatarUrl: null });
  }

  return result;
}

function formatShortDate(matchDate: string | null, startTime: string | null): string | null {
  if (!matchDate) return null;
  const iso = `${matchDate}T${(startTime ?? "00:00").slice(0, 5)}:00`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return matchDate;
  const formatted = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
  return startTime ? `${formatted} · ${startTime.slice(0, 5)}` : formatted;
}

/**
 * Daftar percakapan milik pemain (chat grup pertandingan + chat pribadi),
 * diurutkan dari pesan terbaru. `lastMessagePreview` disimpan trigger 00010.
 */
export async function getMyChats(userId: string, limit = 50): Promise<ChatConversationSummary[]> {
  const supabase = createClient();

  const { data: memberships, error: membershipError } = await supabase
    .from("conversation_members")
    .select("conversation_id")
    .eq("user_id", userId)
    .limit(200);

  if (membershipError) {
    logError("chat.list.memberships", membershipError, { userId });
    throw new Error(toUserMessage(membershipError, "Gagal memuat daftar percakapan."));
  }

  const conversationIds = (memberships ?? []).map((row) => row.conversation_id);
  if (conversationIds.length === 0) return [];

  const { data: conversationRows, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .in("id", conversationIds);

  if (error) {
    logError("chat.list.conversations", error, { userId });
    throw new Error(toUserMessage(error, "Gagal memuat daftar percakapan."));
  }

  const rows = (conversationRows ?? []) as ConversationRow[];
  const matchIds = rows
    .map((row) => row.match_id)
    .filter((value): value is string => Boolean(value));
  const dmIds = rows.filter((row) => !row.is_group).map((row) => row.id);

  const [{ data: matchRows }, { data: dmMemberRows }] = await Promise.all([
    matchIds.length
      ? supabase
          .from("matches")
          .select("id, title, match_date, start_time")
          .in("id", matchIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string | null; match_date: string | null; start_time: string | null }> }),
    dmIds.length
      ? supabase
          .from("conversation_members")
          .select("conversation_id, user_id")
          .in("conversation_id", dmIds)
      : Promise.resolve({ data: [] as Array<{ conversation_id: string; user_id: string }> }),
  ]);

  const matchById = new Map((matchRows ?? []).map((row) => [row.id, row]));

  // Lawan bicara pada tiap DM: anggota selain pemain ini.
  const dmOtherById = new Map<string, string>();
  for (const row of dmMemberRows ?? []) {
    if (row.user_id === userId) continue;
    if (!dmOtherById.has(row.conversation_id)) {
      dmOtherById.set(row.conversation_id, row.user_id);
    }
  }

  const otherIds = Array.from(new Set(dmOtherById.values()));
  const nameById = await loadPlayerNames(supabase, otherIds);

  const summaries: ChatConversationSummary[] = rows.map((row) => {
    const match = row.match_id ? matchById.get(row.match_id) : undefined;

    if (row.is_group && row.match_id) {
      const subtitle = formatShortDate(match?.match_date ?? null, match?.start_time ?? null);
      return {
        conversationId: row.id,
        kind: "match",
        title: match?.title || row.title || "Chat Pertandingan",
        subtitle: subtitle ? `Pertandingan · ${subtitle}` : "Chat pertandingan",
        matchId: row.match_id,
        matchDate: match?.match_date ?? null,
        startTime: match?.start_time ?? null,
        otherUserId: null,
        lastMessagePreview: row.last_message_preview ?? null,
        lastMessageAt: row.last_message_at ?? null,
        memberCount: 0,
      };
    }

    const otherId = dmOtherById.get(row.id) ?? null;
    return {
      conversationId: row.id,
      kind: "dm",
      title: otherId ? nameById.get(otherId)?.name ?? "Pemain" : "Chat pribadi",
      subtitle: "Chat pribadi",
      matchId: null,
      matchDate: null,
      startTime: null,
      otherUserId: otherId,
      lastMessagePreview: row.last_message_preview ?? null,
      lastMessageAt: row.last_message_at ?? null,
      memberCount: 2,
    };
  });

  return summaries
    .sort((a, b) => {
      const left = a.lastMessageAt ?? "";
      const right = b.lastMessageAt ?? "";
      if (left === right) return a.title.localeCompare(b.title);
      return right.localeCompare(left);
    })
    .slice(0, limit);
}

/**
 * Isi satu percakapan beserta anggotanya.
 *
 * Mengembalikan `null` bila pemanggil bukan anggota: RLS sudah menolak, jadi
 * percakapan orang lain tidak membocorkan keberadaannya.
 */
export async function getConversation(
  conversationId: string,
  userId: string
): Promise<ChatConversationDetail | null> {
  const supabase = createClient();

  const { data: conversationRow, error: conversationError } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", conversationId)
    .maybeSingle();

  if (conversationError) {
    logError("chat.detail.conversation", conversationError, { conversationId, userId });
    throw new Error(toUserMessage(conversationError, "Gagal memuat percakapan."));
  }
  if (!conversationRow) return null;

  const conversation = conversationRow as ConversationRow;

  const [{ data: memberRows }, matchResult, messageRows] = await Promise.all([
    supabase
      .from("conversation_members")
      .select("user_id")
      .eq("conversation_id", conversationId),
    conversation.match_id
      ? supabase
          .from("matches")
          .select("id, title, match_date, start_time, organizer_id")
          .eq("id", conversation.match_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    loadMessages(supabase, conversationId, true, 300),
  ]);

  const match = matchResult.data as
    | { id: string; title: string | null; match_date: string | null; start_time: string | null; organizer_id: string }
    | null;

  const memberIds = (memberRows ?? []).map((row) => row.user_id);
  const nameById = await loadPlayerNames(supabase, memberIds);

  const members: ChatMember[] = memberIds.map((memberId) => ({
    userId: memberId,
    name: nameById.get(memberId)?.name ?? "Pemain",
    avatarUrl: nameById.get(memberId)?.avatarUrl ?? null,
    isOrganizer: memberId === match?.organizer_id,
  }));

  const messages: ChatMessage[] = messageRows;

  if (conversation.is_group && conversation.match_id) {
    const subtitle = formatShortDate(match?.match_date ?? null, match?.start_time ?? null);
    return {
      conversationId: conversation.id,
      kind: "match",
      title: match?.title || conversation.title || "Chat Pertandingan",
      subtitle: subtitle ? `Pertandingan · ${subtitle}` : "Chat pertandingan",
      matchId: conversation.match_id,
      matchDate: match?.match_date ?? null,
      startTime: match?.start_time ?? null,
      otherUserId: null,
      lastMessagePreview: conversation.last_message_preview ?? null,
      lastMessageAt: conversation.last_message_at ?? null,
      memberCount: members.length,
      members,
      messages,
    };
  }

  const other = members.find((member) => member.userId !== userId) ?? null;
  return {
    conversationId: conversation.id,
    kind: "dm",
    title: other?.name ?? "Chat pribadi",
    subtitle: "Chat pribadi",
    matchId: null,
    matchDate: null,
    startTime: null,
    otherUserId: other?.userId ?? null,
    lastMessagePreview: conversation.last_message_preview ?? null,
    lastMessageAt: conversation.last_message_at ?? null,
    memberCount: members.length,
    members,
    messages,
  };
}

/**
 * Kirim pesan teks. `sender_id` selalu pemanggil; RLS menolak penyamaran.
 */
export async function sendChatMessage(
  conversationId: string,
  userId: string,
  content: string
): Promise<ChatMessage> {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("Pesan tidak boleh kosong.");
  if (trimmed.length > 2000) throw new Error("Pesan maksimal 2000 karakter.");

  const supabase = createClient();

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      content: trimmed,
      type: "text",
    })
    .select("id, conversation_id, sender_id, content, type, created_at")
    .single();

  if (error || !data) {
    logError("chat.send", error, { conversationId, userId });
    throw new Error(toUserMessage(error, "Pesan gagal dikirim."));
  }

  const nameById = await loadPlayerNames(supabase, [userId]);

  return {
    id: data.id,
    conversationId: data.conversation_id,
    senderId: data.sender_id,
    senderName: nameById.get(userId)?.name ?? "Pemain",
    senderAvatarUrl: nameById.get(userId)?.avatarUrl ?? null,
    content: data.content ?? "",
    type: data.type ?? "text",
    createdAt: data.created_at,
  };
}

/**
 * Pesan terbaru sebuah percakapan, untuk pratinjau di halaman pertandingan.
 */
export async function getLatestChatMessage(conversationId: string): Promise<ChatMessage | null> {
  const supabase = createClient();
  const messages = await loadMessages(supabase, conversationId, false, 1);
  return messages[0] ?? null;
}