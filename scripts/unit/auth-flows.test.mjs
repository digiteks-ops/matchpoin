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
