import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nextConfig = await readFile(new URL("../../next.config.mjs", import.meta.url), "utf8");
const middleware = await readFile(new URL("../../src/middleware.ts", import.meta.url), "utf8");
const authError = await readFile(new URL("../../src/app/(auth)/error.tsx", import.meta.url), "utf8");
const loginPage = await readFile(new URL("../../src/app/(auth)/login/page.tsx", import.meta.url), "utf8");
const envExample = await readFile(new URL("../../.env.example", import.meta.url), "utf8");
const authErrors = await readFile(
  new URL("../../src/lib/auth/auth-errors-core.mjs", import.meta.url),
  "utf8"
);
const registerPage = await readFile(
  new URL("../../src/app/(auth)/register/page.tsx", import.meta.url),
  "utf8"
);

test("/auth/login redirects to the real /login route", () => {
  assert.match(
    nextConfig,
    /\{ source: "\/auth\/login", destination: "\/login", permanent: false \}/
  );
  assert.match(nextConfig, /\{ source: "\/auth\/register", destination: "\/register"/);
});

test("middleware lets /auth paths through so no redirect loop forms", () => {
  assert.match(middleware, /pathname\.startsWith\("\/auth"\)/);
});

test("auth group has a friendly Indonesian error boundary", () => {
  assert.match(authError, /Gagal memuat halaman login/);
  assert.match(authError, /Coba Lagi/);
  assert.match(authError, /reset\(\)/);
});

test("login page maps auth failures to Indonesian and never leaves a blank screen", () => {
  // Pesan Indonesia sekarang berasal dari satu modul (auth-errors-core) supaya
  // halaman Daftar dan Masuk tidak menampilkan teks mentah Supabase.
  assert.match(loginPage, /mapSignInError/);
  const errors = authErrors;
  assert.match(errors, /Email atau kata sandi salah/);
  assert.match(errors, /Email Anda belum diverifikasi/);
  assert.match(errors, /Gagal masuk:/);
  // Halaman Daftar memakai pemetaan terpisah, bukan pesan masuk.
  assert.match(registerPage, /mapSignUpError/);
});

test("required Vercel environment variables are documented", () => {
  for (const name of [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_APP_URL",
  ]) {
    assert.ok(envExample.includes(`${name}=`), `${name} documented in .env.example`);
  }
});
