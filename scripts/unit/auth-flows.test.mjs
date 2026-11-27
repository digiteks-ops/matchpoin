import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { mapSignInError, mapSignUpError } from "../../src/lib/auth/auth-errors-core.mjs";
import {
  PASSWORD_RECOVERY_PATH,
  buildAuthCallbackUrl,
} from "../../src/lib/auth/callback-url.mjs";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

test("signup errors are Indonesian and distinguish existing accounts", () => {
  const already = mapSignUpError("User already registered");
  assert.match(already, /sudah terdaftar/i);
  assert.match(already, /Lupa Kata Sandi/i);

  const dbError = mapSignUpError("Database error saving new user");
  assert.match(dbError, /server/i);
  assert.match(dbError, /admin/i);
  // Pesan mentah berbahasa Inggris tidak boleh tampil apa adanya.
  assert.doesNotMatch(dbError, /Database error saving new user/);

  assert.match(mapSignUpError("Password should be at least 6 characters"), /6 karakter/);
  assert.match(mapSignUpError("Unable to validate email address: invalid format"), /tidak valid/i);
});

test("sign-in errors point to sign-up but never pretend to be sign-up", () => {
  const invalid = mapSignInError("Invalid login credentials");
  assert.match(invalid, /salah/i);
  assert.match(invalid, /daftar/i);
  assert.match(mapSignInError("Email not confirmed"), /verifikasi/i);
  assert.doesNotMatch(mapSignInError("Invalid login credentials"), /Pendaftaran gagal/);
});

test("password recovery goes through the auth callback so a session exists", async () => {
  const url = buildAuthCallbackUrl("https://matchpoin.id", PASSWORD_RECOVERY_PATH);
  assert.equal(url, "https://matchpoin.id/auth/callback?next=%2Freset-password");

  // Hanya path internal; percobaan open-redirect ditolak.
  assert.match(buildAuthCallbackUrl("https://x.id", "//evil.com"), /next=%2Fdashboard/);
  assert.match(buildAuthCallbackUrl("https://x.id", "https://evil.com"), /next=%2Fdashboard/);

  const forgot = await read("src/app/(auth)/forgot-password/page.tsx");
  assert.match(forgot, /buildAuthCallbackUrl/);
  assert.match(forgot, /resetPasswordForEmail/);
  // redirectTo tidak boleh langsung ke /reset-password (tanpa penukaran code).
  assert.doesNotMatch(forgot, /redirectTo: `\$\{window\.location\.origin\}\/reset-password`/);
});

test("middleware keeps /reset-password reachable while the recovery session exists", async () => {
  const middleware = await read("src/lib/supabase/middleware.ts");
  assert.match(middleware, /pathname !== PASSWORD_RECOVERY_PATH/);

  const page = await read("src/app/(auth)/reset-password/page.tsx");
  assert.match(page, /PASSWORD_RECOVERY/);
  assert.match(page, /Minta Tautan Baru/);
  assert.match(page, /updateUser/);
});

test("signup trigger never fails the whole signUp", async () => {
  const sql = await read("supabase/migrations/00037_signup_trigger_safe.sql");
  // Nama dipotong ke batas kolom (VARCHAR(50)).
  assert.match(sql, /left\(v_display_name, 50\)/);
  // Setiap INSERT dilindungi penanganan error sendiri.
  const guards = sql.match(/EXCEPTION WHEN/g) ?? [];
  assert.ok(guards.length >= 4, `expected >=4 EXCEPTION blocks, got ${guards.length}`);
  // Email bentrok tidak memblokir pendaftaran.
  assert.match(sql, /WHEN unique_violation THEN/);
  // Trigger tetap dipasang ulang.
  assert.match(sql, /CREATE TRIGGER on_auth_user_created/);
});

test("register and login are clearly separate flows", async () => {
  const register = await read("src/app/(auth)/register/page.tsx");
  const login = await read("src/app/(auth)/login/page.tsx");
  // Daftar memakai signUp + konfirmasi sandi + self rating.
  assert.match(register, /auth\.signUp/);
  assert.doesNotMatch(register, /auth\.signInWithPassword/);
  // Masuk memakai signInWithPassword saja.
  assert.match(login, /auth\.signInWithPassword/);
  assert.doesNotMatch(login, /auth\.signUp/);
  // Tautan silang antar kedua halaman.
  assert.match(register, /href="\/login"/);
  assert.match(login, /href="\/register"/);
});

test("recovery links use the fragment, so the callback must not treat them as errors", async () => {
  const callback = await read("src/app/auth/callback/route.ts");

  // Supabase mengirim #access_token=...&type=recovery; fragment tidak pernah
  // sampai ke server sehingga `code` kosong. Tanpa pengecualian ini pengguna
  // melihat "gagal masuk dengan penyedia" padahal sedang reset kata sandi.
  assert.match(callback, /PASSWORD_RECOVERY_PATH/);
  assert.match(callback, /if \(!code\)/);
  assert.match(callback, /searchParams\.get\("type"\) === "recovery"/);
  assert.match(callback, /\$\{origin\}\$\{PASSWORD_RECOVERY_PATH\}\?error=expired/);

  const page = await read("src/app/(auth)/reset-password/page.tsx");
  // Token di fragment ditukar di browser; halaman harus menunggu, bukan
  // langsung menyatakan tautan tidak valid.
  assert.match(page, /hasFragmentToken/);
  assert.match(page, /"waiting"/);
  assert.match(page, /window\.location\.hash/);
});

test("Google sign-up tidak lagi meminta kategori awal", async () => {
  const callback = await read("src/app/auth/callback/route.ts");

  // Fitur penilaian level sendiri dihapus: callback tidak memeriksa penanda
  // kategori awal dan langsung membuat profil + rating 1000.
  assert.doesNotMatch(callback, /needsStartingRating/);
  assert.doesNotMatch(callback, /pilih-kategori/);
  assert.match(callback, /ensurePlayerRecordsServer/);
  assert.match(callback, /Tidak ada kategori awal yang perlu dipilih/);

  // Route kategori awal tetap ada dan tetap menolak pilihan kedua.
  const route = await read("src/app/api/profile/starting-level/route.ts");
  assert.match(route, /Kategori awal sudah pernah ditetapkan/);
  assert.match(route, /\.is\("starting_rating_set_at", null\)/);
  assert.match(route, /\.eq\("matches_played", 0\)/);
});

test("OAuth redirect goes through the server callback so `next` is honoured", async () => {
  const buttons = await read("src/components/auth/oauth-buttons.tsx");
  assert.match(buttons, /skipBrowserRedirect: true/);
  assert.match(buttons, /window\.location\.assign\(oauthData\.url\)/);
});
