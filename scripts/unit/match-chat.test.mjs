import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const migration = await read("supabase/migrations/00044_match_chat.sql");
const chatService = await read("src/lib/services/chat-service.ts");
const chatRoute = await read("src/app/api/chat/route.ts");
const messagesRoute = await read("src/app/api/chat/[conversationId]/messages/route.ts");
const chatListPage = await read("src/app/chat/page.tsx");
const chatDetailPage = await read("src/app/chat/[conversationId]/page.tsx");
const matchDetail = await read("src/components/matches/match-detail-client.tsx");
const matchService = await read("src/lib/services/match-service.ts");
const inviteService = await read("src/lib/services/invite-service.ts");
const protectedRoutes = await read("src/lib/auth/protected-routes.mjs");

/** Isi satu fungsi SQL, dari CREATE OR REPLACE sampai penutup `$$;`. */
function sqlFunction(name) {
  const pattern = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`
  );
  const body = migration.match(pattern)?.[0];
  assert.ok(body, `fungsi ${name} tidak ditemukan di migrasi 00044`);
  return body;
}

test("migrasi 00044 idempoten dan hanya menambah yang dibutuhkan chat pertandingan", () => {
  // Aman dijalankan berulang di SQL Editor.
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_match_group/);
  assert.match(migration, /CREATE INDEX IF NOT EXISTS idx_conversation_members_user/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_or_create_match_chat/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.sync_match_chat_members/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.match_chat_user_ids/);

  // Satu percakapan grup per pertandingan; DM (is_group = false) tidak terkena.
  assert.match(
    migration,
    /ON public\.conversations \(match_id\)\s*\n\s*WHERE is_group = true AND match_id IS NOT NULL/
  );

  // Tabel chat lama tidak dibuat ulang (sudah ada sejak 00010).
  assert.doesNotMatch(migration, /CREATE TABLE[^;]*conversations/i);
  assert.doesNotMatch(migration, /CREATE TABLE[^;]*messages/i);

  // Tidak ada policy baru: RLS chat dari 00010/00015 dipakai apa adanya.
  assert.doesNotMatch(migration, /CREATE POLICY/i);
});

test("chat grup pertandingan hanya berisi peserta aktif", () => {
  const fn = sqlFunction("match_chat_user_ids");
  assert.match(fn, /mp\.left_at IS NULL/);
  assert.match(fn, /mp\.is_organizer/);
  assert.match(fn, /COALESCE\(mp\.metadata ->> 'status', 'confirmed'\) = 'confirmed'/);
  // Penantang yang belum diterima (pending) bukan peserta chat grup.
  assert.doesNotMatch(fn, /'pending'/);
  assert.match(fn, /SECURITY DEFINER/);
});

test("get_or_create_match_chat menolak non-peserta dan tidak pernah menduplikasi percakapan", () => {
  const fn = sqlFunction("get_or_create_match_chat");

  // Tamu ditolak sebelum menyentuh tabel.
  assert.match(fn, /auth\.uid\(\)/);
  assert.match(fn, /'reason', 'unauthorized'/);

  // Hanya peserta yang boleh membuka chat pertandingan.
  assert.match(fn, /FROM public\.match_chat_user_ids\(p_match_id\) AS uid WHERE uid = v_uid/);
  assert.match(fn, /'reason', 'forbidden'/);

  // Idempoten: percakapan dicari dulu, insert hanya kalau belum ada.
  assert.match(fn, /WHERE match_id = p_match_id\s*\n\s*AND is_group = true/);
  assert.match(fn, /WHEN unique_violation THEN/);
  assert.match(fn, /ON CONFLICT DO NOTHING/);

  // RPC dieksekusi dengan hak pemilik tapi tidak terbuka untuk anon.
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_or_create_match_chat\(UUID\) FROM PUBLIC/);
  assert.match(
    migration,
    /GRANT EXECUTE ON FUNCTION public\.get_or_create_match_chat\(UUID\) TO authenticated, service_role/
  );
});

test("sync_match_chat_members tidak membuat percakapan kosong", () => {
  const fn = sqlFunction("sync_match_chat_members");
  // Tidak ada percakapan => tidak ada yang disinkronkan, bukan dibuat baru.
  assert.match(fn, /IF v_conversation_id IS NULL THEN\s*\n\s*RETURN 0;/);
  assert.doesNotMatch(fn, /INSERT INTO public\.conversations/);
  assert.match(fn, /ON CONFLICT DO NOTHING/);
});

test("pesan hanya dibaca lewat client ber-RLS, tanpa view khusus", () => {
  // Membaca pesan memakai tabel `messages`; RLS "members read messages" yang
  // menentukan siapa yang boleh melihat.
  assert.match(chatService, /from\("messages"\)/);
  assert.doesNotMatch(chatService, /chat_messages_with_sender/);
  // Nama pengirim diambil dari tabel profil, bukan dari view baru.
  assert.match(chatService, /from\("users"\)\.select\("id, full_name, avatar_url"\)/);
  assert.match(chatService, /from\("player_profiles"\)\.select\("user_id, display_name"\)/);
});

test("service chat memakai RLS dan RPC yang ada, bukan service-role untuk baca", () => {
  assert.match(chatService, /export async function getMyChats/);
  assert.match(chatService, /export async function getConversation/);
  assert.match(chatService, /export async function sendChatMessage/);
  assert.match(chatService, /from\("conversations"\)/);
  assert.match(chatService, /from\("messages"\)/);

  // Membaca percakapan & pesan tidak boleh lewat service role: RLS harus
  // tetap menjadi penentu, supaya percakapan orang lain tidak terbaca.
  for (const marker of [
    "export async function getMyChats",
    "export async function getConversation",
    "async function loadMessages",
  ]) {
    assert.ok(chatService.includes(marker), marker);
  }
  const readSection = chatService.slice(
    chatService.indexOf("export async function getMyChats"),
    chatService.indexOf("export async function sendChatMessage")
  );
  assert.doesNotMatch(readSection, /createAdminClient\(\)/);
  const messageSection = chatService.slice(
    chatService.indexOf("async function loadMessages"),
    chatService.indexOf("/** Nama + avatar pemain")
  );
  assert.doesNotMatch(messageSection, /createAdminClient\(\)/);

  // Service role hanya untuk membuat percakapan grup & menulis keanggotaan
  // (jalur cadangan 00044), tidak untuk membaca isi percakapan.
  const adminCalls = chatService.match(/createAdminClient\(\)/g) ?? [];
  assert.ok(adminCalls.length >= 2, "createAdminClient dipakai jalur tulis keanggotaan");

  // Tidak ada pesan yang dibaca lewat service role.
  assert.doesNotMatch(chatService, /admin[\s\S]{0,80}\.from\("messages"\)/);

  // SELECT percakapan lewat service role hanya mengambil kolom id (mencari id
  // percakapan yang baru dibuat); tidak pernah judul, pratinjau, atau isi.
  const adminConversationSelects =
    chatService.match(/admin\s*\n?\s*\.from\("conversations"\)\s*\n?\s*\.select\("([^"]*)"\)/g) ?? [];
  for (const call of adminConversationSelects) {
    assert.match(call, /\.select\("id"\)/, call);
  }
  const syncBody = chatService.slice(chatService.indexOf("export async function syncMatchChatMembers"));
  assert.match(syncBody, /catch \(error\)/);

  // RPC yang dipakai sudah ada sejak 00010 / 00044.
  assert.match(chatService, /rpc\("get_or_create_match_chat"/);
  assert.match(chatService, /rpc\("get_or_create_dm"/);
  assert.match(chatService, /rpc\("sync_match_chat_members"/);

  // Pesan kosong dan kepanjangan ditolak sebelum query.
  assert.match(chatService, /Pesan tidak boleh kosong/);
  assert.match(chatService, /Pesan maksimal 2000 karakter/);
});

test("peserta yang baru diterima otomatis masuk chat grup", () => {
  // Dua jalur penerimaan: permohonan slot (host menerima) dan undangan (pemain menerima).
  for (const [source, label] of [
    [matchService, "acceptParticipantRequest"],
    [inviteService, "respondToInvite"],
  ]) {
    assert.match(source, /import \{ syncMatchChatMembers \} from "@\/lib\/services\/chat-service"/, label);
    assert.match(source, /await syncMatchChatMembers\(/, label);
  }
});

test("API chat tidak bisa dipakai tanpa sesi dan memvalidasi id percakapan", () => {
  assert.match(chatRoute, /export async function GET/);
  assert.match(chatRoute, /export async function POST/);
  assert.match(chatRoute, /status: 401/);

  assert.match(messagesRoute, /const UUID_RE =/);
  assert.match(messagesRoute, /status: 401/);
  assert.match(messagesRoute, /Percakapan tidak ditemukan/);
  assert.match(messagesRoute, /typeof payload\.content !== "string"/);
});

test("UI chat: daftar percakapan menampilkan pesan terbaru dan halaman detail bisa kirim pesan", () => {
  // Daftar percakapan: judul, keterangan, dan pratinjau pesan terakhir.
  assert.match(chatListPage, /Daftar Percakapan/);
  assert.match(chatListPage, /lastMessagePreview/);
  assert.match(chatListPage, /Belum ada pesan\. Mulai percakapan\./);

  // Detail: kirim pesan + tampilkan pesan.
  assert.match(chatDetailPage, /method: "POST"/);
  assert.match(chatDetailPage, /Tulis pesan/);
  assert.match(chatDetailPage, /conversation\.messages\.map/);
  // Fitur di luar permintaan belum ditambahkan.
  assert.doesNotMatch(chatDetailPage, /type="file"/);
  assert.doesNotMatch(chatDetailPage, /\[Foto\]/);
});

test("chat dapat dibuka dari halaman pertandingan dan /chat terlindungi", () => {
  // Tombol chat grup (semua peserta) dan chat pribadi ke host.
  assert.match(matchDetail, /handleOpenChat/);
  assert.match(matchDetail, /Chat Semua Peserta/);
  assert.match(matchDetail, /Chat Host/);
  assert.match(matchDetail, /handleOpenChat\(\{ matchId: match\.id \}\)/);
  assert.match(matchDetail, /handleOpenChat\(\{ userId: hostId \}\)/);

  // Tamu tidak boleh melihat chat (halaman /chat butuh login).
  assert.match(protectedRoutes, /"\/chat",/);
});