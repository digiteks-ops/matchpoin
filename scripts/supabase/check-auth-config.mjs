/**
 * Cek konfigurasi Authentication Supabase dari sisi luar (read-only).
 *
 * Tidak perlu akses dashboard: script ini memanggil endpoint publik Supabase
 * Auth dan Google OAuth untuk membuktikan bahwa provider benar-benar aktif,
 * callback Google memang terdaftar, dan daftar Redirect URLs tidak terlalu
 * terbuka.
 *
 * Jalankan: node --env-file=.env.local scripts/supabase/check-auth-config.mjs
 */
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const APP_URL = (process.env.AUTH_CHECK_APP_URL ?? "https://matchpoin.vercel.app").replace(/\/$/, "");

if (!SUPABASE_URL || !ANON_KEY) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  process.exit(1);
}

const ref = SUPABASE_URL.replace(/^https:\/\//, "").replace(/\.supabase\.co$/, "");
const supabaseCallback = `${SUPABASE_URL}/auth/v1/callback`;

const results = [];
const record = (level, title, detail) => results.push({ level, title, detail });
const ok = (t, d) => record("OK", t, d);
const warn = (t, d) => record("WARN", t, d);
const fail = (t, d) => record("FAIL", t, d);

/** Ambil nilai `redirect_to` yang benar-benar dikirim Supabase ke provider. */
async function probeRedirectTo(redirectTo) {
  const url = new URL(`${SUPABASE_URL}/auth/v1/authorize`);
  url.searchParams.set("provider", "google");
  if (redirectTo) url.searchParams.set("redirect_to", redirectTo);

  const res = await fetch(url, { headers: { apikey: ANON_KEY }, redirect: "manual" });
  const location = res.headers.get("location") ?? "";
  const match = /[?&]redirect_to=([^&]*)/.exec(location);
  return {
    status: res.status,
    location,
    redirectTo: match ? decodeURIComponent(match[1]) : null,
    clientId: /[?&]client_id=([^&]*)/.exec(location)?.[1] ?? null,
    googleRedirectUri: /[?&]redirect_uri=([^&]*)/.exec(location)
      ? decodeURIComponent(/[?&]redirect_uri=([^&]*)/.exec(location)[1])
      : null,
  };
}

async function checkSettings() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: ANON_KEY } });
  if (!res.ok) return fail("Baca /auth/v1/settings", `HTTP ${res.status}`);
  const json = await res.json();
  const external = json.external ?? {};

  if (external.google) ok("Provider Google", "aktif");
  else fail("Provider Google", "NONAKTIF — aktifkan di Authentication -> Providers -> Google");

  if (external.email) ok("Provider email/password", "aktif");
  else fail("Provider email/password", "NONAKTIF — pemain tidak bisa daftar dengan email");

  if (external.facebook) {
    warn("Provider Facebook", "masih aktif padahal aplikasi tidak lagi memakai Facebook — matikan agar rapi");
  } else {
    ok("Provider Facebook", "nonaktif (sesuai aplikasi)");
  }

  if (external.anonymous_users) {
    warn("Sign-in anonim", "aktif; aplikasi tidak memakai fitur ini — matikan untuk mengurangi permukaan serangan");
  } else {
    ok("Sign-in anonim", "nonaktif");
  }

  if (json.disable_signup) {
    warn("Pendaftaran", "disable_signup = true; pemain baru tidak bisa mendaftar");
  } else {
    ok("Pendaftaran", "terbuka");
  }

  ok(
    "Konfirmasi email",
    json.mailer_autoconfirm
      ? "tidak wajib (mailer_autoconfirm = true)"
      : "wajib — pastikan SMTP terisi supaya email verifikasi benar-benar terkirim"
  );
}

async function checkGoogle() {
  const known = `${APP_URL}/auth/callback`;
  const probe = await probeRedirectTo(known);

  if (probe.status !== 302 || !probe.location.includes("accounts.google.com")) {
    return fail("Mulai OAuth Google", `Supabase tidak mengalihkan ke Google (HTTP ${probe.status})`);
  }

  if (!probe.clientId?.endsWith(".apps.googleusercontent.com")) {
    fail("Client ID Google", "tidak terbaca dari redirect Supabase — periksa Authentication -> Providers -> Google");
  } else {
    ok("Client ID Google", probe.clientId);
  }

  if (probe.googleRedirectUri !== supabaseCallback) {
    fail("Callback Google", `Supabase mengirim ${probe.googleRedirectUri}, seharusnya ${supabaseCallback}`);
  } else {
    ok("Callback Google", supabaseCallback);
  }

  // Google menolak redirect_uri yang tidak terdaftar, jadi ini membuktikan
  // alamat Supabase memang sudah ada di Authorized redirect URIs.
  const good = await fetch(probe.location, { redirect: "manual" });
  const goodLocation = good.headers.get("location") ?? "";
  if (good.status >= 400 || /redirect_uri_mismatch|invalid_client/.test(goodLocation)) {
    fail(
      "Izin redirect di Google Cloud",
      `Google menolak callback Supabase — tambahkan ${supabaseCallback} di Authorized redirect URIs`
    );
  } else {
    ok("Izin redirect di Google Cloud", "callback Supabase diterima Google");
  }

  // Google membalas halaman "Error 400: redirect_uri_mismatch" untuk alamat
  // yang tidak terdaftar, dan halaman pilih akun untuk yang terdaftar.
  const bogus = new URL(probe.location);
  bogus.searchParams.set("redirect_uri", "https://contoh-salah.example.org/callback");
  const bad = await fetch(bogus, { redirect: "follow" });
  const badBody = await bad.text();
  const rejected = /redirect_uri_mismatch|invalid_request/i.test(badBody) || bad.status >= 400;
  const reachedSignin = /id="identifierId"|Sign in|Masuk/i.test(badBody) && !rejected;

  if (rejected && !reachedSignin) {
    ok("Validasi Google", "redirect_uri asing ditolak (sesuai harapan)");
  } else if (reachedSignin) {
    warn(
      "Validasi Google",
      "tidak bisa diuji otomatis (Google mengarahkan ke halaman masuk); " +
        "uji manual: buka URL OAuth dengan redirect_uri asing, harus muncul redirect_uri_mismatch"
    );
  } else {
    warn("Validasi Google", `tidak bisa disimpulkan otomatis (HTTP ${bad.status})`);
  }
}

/**
 * Uji allowlist Redirect URLs memakai /auth/v1/verify, bukan /authorize.
 *
 * /authorize hanya MENYALIN redirect_to ke URL provider tanpa memvalidasinya,
 * jadi memakainya sebagai bukti membuat kesimpulan palsu "wildcard terbuka".
 * /auth/v1/verify-lah yang benar-benar mencocokkan redirect_to dengan daftar
 * Redirect URLs: alamat asing diganti menjadi Site URL, alamat terdaftar
 * dipertahankan apa adanya.
 */
async function probeVerifyRedirect(redirectTo) {
  const url = new URL(`${SUPABASE_URL}/auth/v1/verify`);
  url.searchParams.set("token", "token-palsu-uji-konfigurasi");
  url.searchParams.set("type", "recovery");
  url.searchParams.set("redirect_to", redirectTo);

  const res = await fetch(url, { redirect: "manual" });
  return res.headers.get("location") ?? "";
}

async function checkRedirectAllowlist() {
  const required = [`${APP_URL}/auth/callback`, `${APP_URL}/reset-password`];
  const foreign = [
    "https://contoh-asing.example.org/auth/callback",
    "http://random.test/auth/callback",
  ];

  const rejectedRequired = [];
  for (const target of required) {
    const location = await probeVerifyRedirect(target);
    if (!location.startsWith(target)) rejectedRequired.push(target);
  }

  const leaked = [];
  for (const target of foreign) {
    const location = await probeVerifyRedirect(target);
    if (location.startsWith(target)) leaked.push(target);
  }

  if (rejectedRequired.length > 0) {
    warn(
      "Redirect URLs",
      `belum terdaftar di Supabase: ${rejectedRequired.join(", ")}. ` +
        "Tambahkan di Authentication -> URL Configuration."
    );
  }

  if (leaked.length > 0) {
    warn(
      "Redirect URLs terlalu terbuka",
      `domain asing diterima apa adanya (${leaked[0]}). Kemungkinan ada entri ` +
        "wildcard (`**`) di Authentication -> URL Configuration. Hapus wildcard dan " +
        "sisakan URL spesifik."
    );
    return;
  }

  if (rejectedRequired.length === 0) {
    ok(
      "Redirect URLs",
      "URL aplikasi diterima, domain asing diganti menjadi Site URL (allowlist tertutup)"
    );
  }
}

/**
 * Site URL menentukan tujuan akhir saat Supabase menolak permintaan. Kalau
 * masih localhost, tautan reset password akan mendarat di laptop pemilik.
 */
async function checkSiteUrl() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/callback?code=kode-palsu&state=x`, {
    redirect: "manual",
  });
  const location = res.headers.get("location");
  if (!location) {
    warn("Site URL", "tidak bisa dibaca dari uji callback");
    return;
  }
  if (location.includes("localhost") || location.includes("127.0.0.1")) {
    fail(
      "Site URL",
      `masih mengarah ke lokal (${location.slice(0, 60)}...) — ubah ke ${APP_URL} di URL Configuration`
    );
    return;
  }
  ok("Site URL", `mengarah ke ${new URL(location).origin}`);
}

async function checkProduction() {
  if (!APP_URL.startsWith("http")) return;
  const res = await fetch(`${APP_URL}/login`, { redirect: "manual" });
  if (res.status !== 200) return warn("Halaman /login", `HTTP ${res.status}`);

  const html = await res.text();
  const hasGoogle = /Lanjutkan dengan Google|dengan Google/.test(html);
  const hasFacebook = /Facebook/.test(html);
  const refMatch = html.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);

  if (hasGoogle) ok("Tombol Google di produksi", "tampil di /login");
  else fail("Tombol Google di produksi", "tidak ditemukan di /login");

  if (hasFacebook) warn("Tombol Facebook", "masih muncul di produksi — deploy belum memakai kode terbaru");
  else ok("Tombol Facebook", "sudah tidak ada");

  if (refMatch && refMatch[1] !== ref) {
    fail("Project Supabase di produksi", `build memakai ${refMatch[1]}, .env.local memakai ${ref}`);
  } else if (refMatch) {
    ok("Project Supabase di produksi", `${ref} (sama dengan .env.local)`);
  }
}

await checkSettings();
await checkGoogle();
await checkSiteUrl();
await checkRedirectAllowlist();
await checkProduction();

const icon = { OK: "OK  ", WARN: "WARN", FAIL: "FAIL" };
console.log(`\nCek konfigurasi auth — project ${ref}\n`);
for (const row of results) {
  console.log(`[${icon[row.level]}] ${row.title}: ${row.detail}`);
}

const failed = results.filter((row) => row.level === "FAIL").length;
const warned = results.filter((row) => row.level === "WARN").length;
console.log(`\n${failed} gagal, ${warned} peringatan.\n`);
process.exitCode = failed > 0 ? 1 : 0;