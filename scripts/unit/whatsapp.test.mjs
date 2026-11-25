import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ADMIN_WHATSAPP_NUMBER,
  LEAGUE_WHATSAPP_GROUP_URL,
  adminWhatsappUrl,
  buildChallengeMessage,
  buildLeagueWelcomeMessage,
  isValidWhatsappNumber,
  normalizeWhatsappNumber,
  whatsappChatUrl,
} from "../../src/lib/notifications/whatsapp-core.mjs";
import {
  parseRegistrationPayload,
  normalizeWhatsapp,
  isValidWhatsapp,
} from "../../src/lib/mysql/competition-registration-core.mjs";
import { normalizeImageUrl } from "../../src/lib/utils/image-url-core.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const LEAGUE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

test("nomor WhatsApp Indonesia dinormalkan ke awalan 62", () => {
  assert.equal(normalizeWhatsappNumber("0812-3456-7890"), "6281234567890");
  assert.equal(normalizeWhatsappNumber("+62 812 3456 7890"), "6281234567890");
  assert.equal(normalizeWhatsappNumber("6281234567890"), "6281234567890");
  assert.equal(normalizeWhatsappNumber("81234567890"), "6281234567890");
  // Salah tulis awalan 620... tetap diperbaiki.
  assert.equal(normalizeWhatsappNumber("6208123456789"), "628123456789");
});

test("nomor tidak masuk akal ditolak, bukan ditebak", () => {
  assert.equal(normalizeWhatsappNumber(""), "");
  assert.equal(normalizeWhatsappNumber(null), "");
  assert.equal(normalizeWhatsappNumber(undefined), "");
  assert.equal(normalizeWhatsappNumber("abc"), "");
  assert.equal(normalizeWhatsappNumber("021-555-1234"), ""); // nomor rumah, bukan seluler
  assert.equal(normalizeWhatsappNumber("62812"), ""); // terlalu pendek
  assert.equal(isValidWhatsappNumber("08123456789"), true);
  assert.equal(isValidWhatsappNumber("12345"), false);
});

test("tautan wa.me memakai nomor yang sudah dinormalkan", () => {
  assert.equal(whatsappChatUrl("0812-3456-7890"), "https://wa.me/6281234567890");
  assert.equal(whatsappChatUrl("tidak-valid"), "");
  const withText = whatsappChatUrl("08123456789", "Halo admin");
  assert.match(withText, /^https:\/\/wa\.me\/628123456789\?text=Halo%20admin$/);
});

test("tombol floating memakai nomor admin yang diminta", () => {
  assert.equal(ADMIN_WHATSAPP_NUMBER, "625128066022");
  const url = adminWhatsappUrl("Halo Admin MATCHPOIN");
  // wa.me butuh awalan 62 tanpa tanda plus; nomor admin sudah dalam bentuk itu.
  assert.match(url, /^https:\/\/wa\.me\/625128066022/);
  // Nomor admin bukan seluler 8xx, jadi normalisasi ketat tidak boleh
  // mengosongkannya.
  assert.ok(url.length > "https://wa.me/".length);
});

test("grup WhatsApp liga memakai tautan yang diminta", () => {
  assert.equal(LEAGUE_WHATSAPP_GROUP_URL, "https://chat.whatsapp.com/Lea6qDW5yuNAU5YruHALTV");
});

test("pesan tantangan memuat lawan, jadwal, dan tautan match", () => {
  const message = buildChallengeMessage({
    hostName: "Andi Pratama",
    matchTitle: "Sparring Sabtu Pagi",
    matchDate: "2027-01-09",
    startTime: "07:30:00",
    courtName: "Lapangan Banteng",
    categoryLabel: "Tunggal Putra",
    appUrl: "https://matchpoin.vercel.app/",
    matchId: "m-123",
    groupUrl: LEAGUE_WHATSAPP_GROUP_URL,
  });

  assert.match(message, /Andi Pratama menantang Anda/);
  assert.match(message, /Sparring Sabtu Pagi/);
  assert.match(message, /2027-01-09 pukul 07:30/);
  assert.match(message, /Lapangan Banteng/);
  assert.match(message, /https:\/\/matchpoin\.vercel\.app\/matches\/m-123/);
  assert.match(message, /chat\.whatsapp\.com/);
  // Tanpa garis miring ganda dari appUrl.
  assert.doesNotMatch(message, /vercel\.app\/\/matches/);
});

test("pesan sambutan liga mengarahkan ke grup", () => {
  const message = buildLeagueWelcomeMessage({
    playerName: "Andi",
    categoryLabel: "Ganda Putra",
    groupUrl: LEAGUE_WHATSAPP_GROUP_URL,
  });
  assert.match(message, /Andi/);
  assert.match(message, /Ganda Putra/);
  assert.match(message, /https:\/\/chat\.whatsapp\.com\/Lea6qDW5yuNAU5YruHALTV/);
});

test("pendaftaran liga menolak tanpa nomor WhatsApp", () => {
  const missing = parseRegistrationPayload({
    tournamentId: LEAGUE,
    eligibilityConfirmed: true,
  });
  assert.equal(missing.ok, false);
  assert.match(missing.message, /WhatsApp wajib/);

  const invalid = parseRegistrationPayload({
    tournamentId: LEAGUE,
    eligibilityConfirmed: true,
    whatsappNumber: "12345",
  });
  assert.equal(invalid.ok, false);
  assert.match(invalid.message, /WhatsApp wajib/);
});

test("pendaftaran liga menyimpan nomor WhatsApp yang sudah dinormalkan", () => {
  const parsed = parseRegistrationPayload({
    tournamentId: LEAGUE,
    eligibilityConfirmed: true,
    whatsappNumber: "0812-3456-7890",
  });
  assert.equal(parsed.ok, true);
  assert.equal(parsed.whatsappNumber, "6281234567890");
  // Modul core dan modul notifikasi harus sepakat soal bentuk nomor.
  assert.equal(normalizeWhatsapp("0812-3456-7890"), normalizeWhatsappNumber("0812-3456-7890"));
  assert.equal(isValidWhatsapp("0812-3456-7890"), true);
});

test("kedua formulir pendaftaran mengirim nomor WhatsApp", async () => {
  const league = await read("src/app/league/page.tsx");
  const tournaments = await read("src/app/tournaments/page.tsx");
  const route = await read("src/app/api/tournaments/register/route.ts");

  for (const page of [league, tournaments]) {
    assert.match(page, /whatsappNumber/);
    assert.match(page, /isValidWhatsapp\(/);
    assert.match(page, /LEAGUE_WHATSAPP_GROUP_URL/);
  }
  // API menolak payload tanpa nomor dan menyimpannya ke profil.
  assert.match(route, /whatsappNumber/);
  assert.match(route, /from\("users"\)\.update\(\{ phone: whatsappNumber \}\)/);
});

test("tombol submit turnamen tidak lagi mati karena checkbox di kartu", async () => {
  const tournaments = await read("src/app/tournaments/page.tsx");
  // Persetujuan harus ada di dalam modal pendaftaran.
  const modalIndex = tournaments.indexOf("<CardTitle className=\"text-lg\">Daftar");
  assert.ok(modalIndex > 0, "modal pendaftaran harus ada");
  const modal = tournaments.slice(modalIndex);
  assert.match(modal, /checked=\{eligibilityConfirmed\}/);
  assert.match(modal, /Kirim Pendaftaran/);
});

test("photo bukti memakai URL yang dirapikan sebelum <Image>", () => {
  // getPublicUrl pernah menghasilkan garis miring ganda dan optimizer Next.js
  // menolaknya dengan 400, sehingga pratinjau tampak kosong.
  assert.equal(
    normalizeImageUrl(
      "https://proyek.supabase.co//storage/v1/object/public/match-results/a/b/c.webp"
    ),
    "https://proyek.supabase.co/storage/v1/object/public/match-results/a/b/c.webp"
  );
  assert.equal(
    normalizeImageUrl("https://proyek.supabase.co/storage/v1/object/public/avatars/u/a.webp"),
    "https://proyek.supabase.co/storage/v1/object/public/avatars/u/a.webp"
  );
  assert.equal(normalizeImageUrl(null), "");
  assert.equal(normalizeImageUrl("  "), "");
  // data: dan blob: tidak boleh diubah.
  assert.equal(normalizeImageUrl("data:image/png;base64,AAAA"), "data:image/png;base64,AAAA");
});

test("upload foto bukti menyimpan URL yang sudah dirapikan", async () => {
  const upload = await read("src/components/matches/photo-upload.tsx");
  const detail = await read("src/components/matches/match-detail-client.tsx");
  assert.match(upload, /normalizeImageUrl\(publicUrl\)/);
  // Data lama dengan garis miring ganda tetap tampil.
  assert.match(detail, /normalizeImageUrl\(url\)/);
});

test("tombol floating chat admin terpasang di layout", async () => {
  const layout = await read("src/app/layout.tsx");
  const float = await read("src/components/layout/whatsapp-float.tsx");
  assert.match(layout, /<WhatsappFloat \/>/);
  assert.match(float, /adminWhatsappUrl\(/);
  assert.match(float, /fixed bottom-/);
});

test("notifikasi WhatsApp dikirim ke lawan saat host menantang", async () => {
  const service = await read("src/lib/services/match-service.ts");
  const whatsapp = await read("src/lib/notifications/whatsapp-service.ts");

  assert.match(service, /notifyChallengedOpponents\(/);
  assert.match(service, /notifyChallengeViaWhatsapp\(/);
  assert.match(service, /buildChallengeMessage\(/);
  // Gateway memakai env, bukan token yang ditulis di kode.
  assert.match(whatsapp, /WHATSAPP_API_URL/);
  assert.match(whatsapp, /WHATSAPP_API_TOKEN/);
  // Tanpa konfigurasi, pengiriman dilewati tanpa menggagalkan aksi utama.
  assert.match(whatsapp, /isWhatsappConfigured/);
  assert.match(whatsapp, /return \{ sent: false, reason: "gateway-belum-dikonfigurasi" \}/);
});