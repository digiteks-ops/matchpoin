// Aturan nomor WhatsApp dan isi pesan — modul murni supaya bisa diuji tanpa
// jaringan (`npm run test:unit`). Pengiriman sebenarnya ada di
// `whatsapp-service.ts`.

/** Kontak admin MATCHPOIN untuk tombol floating "Chat Admin". */
export const ADMIN_WHATSAPP_NUMBER = "6285128066022";

/** Grup WhatsApp resmi Liga IKA17; pendaftar otomatis diarahkan ke sini. */
export const LEAGUE_WHATSAPP_GROUP_URL = "https://chat.whatsapp.com/Lea6qDW5yuNAU5YruHALTV";

/** Angka yang dianggap panjang nomor seluler Indonesia setelah awalan 62. */
const ID_MOBILE_PATTERN = /^62(8[1-9][0-9]{6,11})$/;

/**
 * Menormalkan nomor WhatsApp Indonesia ke bentuk `628xxxxxxxxx`.
 *
 * Menerima input yang lazim ditulis pengguna: `0812-3456-7890`,
 * `+62 812 3456 7890`, `62812 3456 7890`, atau `8123456789`. Mengembalikan
 * string kosong bila nomornya tidak masuk akal, supaya pemanggil bisa
 * membedakan "kosong" dari "sudah sah".
 */
export function normalizeWhatsappNumber(input) {
  if (typeof input !== "string") return "";
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return "";

  let normalized = digits;
  if (normalized.startsWith("0")) {
    // 0812... -> 62812...
    normalized = `62${normalized.slice(1)}`;
  } else if (normalized.startsWith("8")) {
    // 812... -> 62812...
    normalized = `62${normalized}`;
  } else if (normalized.startsWith("620")) {
    // 620812... (salah tulis awalan) -> 62812...
    normalized = `62${normalized.slice(3)}`;
  }

  return ID_MOBILE_PATTERN.test(normalized) ? normalized : "";
}

/**
 * Sama seperti `normalizeWhatsappNumber`, tetapi menerima nomor apa pun yang
 * sudah berawalan `62` — bukan hanya seluler `8xx`.
 *
 * Dipakai untuk nomor kontak resmi (admin) yang bisa berupa nomor fixed line,
 * sehingga validasi seluler yang ketat justru akan mengosongkannya.
 */
export function normalizeWhatsappContact(input) {
  if (typeof input !== "string") return "";
  const digits = input.replace(/[^0-9]/g, "");
  if (!digits) return "";
  const normalized = digits.startsWith("0")
    ? `62${digits.slice(1)}`
    : digits.startsWith("62")
    ? digits
    : `62${digits}`;
  // Minimal 8 digit total: cukup untuk menolak potongan nomor yang tidak lengkap.
  return /^62[0-9]{6,14}$/.test(normalized) ? normalized : "";
}

/** True bila `input` adalah nomor WhatsApp Indonesia yang sah. */
export function isValidWhatsappNumber(input) {
  return normalizeWhatsappNumber(input) !== "";
}

/** Tautan chat langsung ke sebuah nomor (`https://wa.me/62812...`). */
export function whatsappChatUrl(number, message) {
  const normalized = normalizeWhatsappNumber(number);
  if (!normalized) return "";
  const base = `https://wa.me/${normalized}`;
  const text = typeof message === "string" ? message.trim() : "";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/**
 * Tautan chat ke kontak resmi. Memakai validasi longgar supaya nomor admin
 * (yang bukan seluler) tetap bisa dihubungi.
 */
export function whatsappContactUrl(number, message) {
  const normalized = normalizeWhatsappContact(number);
  if (!normalized) return "";
  const base = `https://wa.me/${normalized}`;
  const text = typeof message === "string" ? message.trim() : "";
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

/** Tautan tombol floating ke admin. */
export function adminWhatsappUrl(message) {
  return whatsappContactUrl(ADMIN_WHATSAPP_NUMBER, message);
}

/**
 * Pesan undangan tanding yang dikirim ke lawan lewat WhatsApp.
 * Dijaga tetap pendek: satu paragraf pembuka, detail pertandingan, lalu tautan.
 */
export function buildChallengeMessage({
  hostName,
  matchTitle,
  matchDate,
  startTime,
  courtName,
  categoryLabel,
  appUrl,
  matchId,
  groupUrl,
}) {
  const lines = [];
  lines.push(`*MATCHPOIN* — Undangan Tanding`);
  lines.push("");
  lines.push(`${hostName || "Seorang pemain"} menantang Anda bertanding.`);
  lines.push("");
  if (matchTitle) lines.push(`Pertandingan: ${matchTitle}`);
  if (categoryLabel) lines.push(`Kategori: ${categoryLabel}`);
  if (matchDate) {
    const date = String(matchDate).slice(0, 10);
    lines.push(`Tanggal: ${date}${startTime ? ` pukul ${String(startTime).slice(0, 5)}` : ""}`);
  }
  if (courtName) lines.push(`Lapangan: ${courtName}`);
  lines.push("");
  if (appUrl && matchId) {
    lines.push(`Terima atau tolak undangan di: ${appUrl.replace(/\/$/, "")}/matches/${matchId}`);
  } else if (appUrl) {
    lines.push(`Buka MATCHPOIN: ${appUrl.replace(/\/$/, "")}`);
  }
  if (groupUrl) {
    lines.push("");
    lines.push(`Grup WhatsApp komunitas: ${groupUrl}`);
  }
  return lines.join("\n");
}

/**
 * Pesan penutup pendaftaran liga: mengingatkan nomor yang dipakai dan
 * memberikan tautan grup agar pemain langsung bergabung.
 */
export function buildLeagueWelcomeMessage({ playerName, categoryLabel, groupUrl }) {
  const lines = [];
  lines.push(`*MATCHPOIN* — Pendaftaran Liga Diterima`);
  lines.push("");
  lines.push(
    `Halo ${playerName || "Pemain"}, pendaftaran ${categoryLabel || "liga"} Anda sudah kami terima.`
  );
  lines.push("Pendaftaran akan ditinjau Super Admin. Statusnya bisa dilihat di halaman Liga.");
  lines.push("");
  if (groupUrl) {
    lines.push("Gabung grup WhatsApp Liga Tennis IKA17 untuk info jadwal dan lawan:");
    lines.push(groupUrl);
  }
  return lines.join("\n");
}