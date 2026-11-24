import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/00018_oauth_profiles_trigger.sql", import.meta.url),
  "utf8"
);
const callback = await readFile(
  new URL("../../src/app/auth/callback/route.ts", import.meta.url),
  "utf8"
);
const buttons = await readFile(
  new URL("../../src/components/auth/oauth-buttons.tsx", import.meta.url),
  "utf8"
);
const loginPage = await readFile(
  new URL("../../src/app/(auth)/login/page.tsx", import.meta.url),
  "utf8"
);
const readme = await readFile(new URL("../../README.md", import.meta.url), "utf8");

test("signup trigger also fills public.profiles with provider data", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.handle_new_user\(\)/);
  assert.match(migration, /raw_user_meta_data->>'avatar_url'/);
  assert.match(migration, /raw_user_meta_data->>'picture'/);
  assert.match(migration, /INSERT INTO public\.profiles \(id, email, full_name, avatar_url\)/);
  assert.match(migration, /ON CONFLICT \(id\) DO NOTHING/);
});

test("provider accounts without email are handled without failing signup", () => {
  assert.match(migration, /@noemail\.matchpoin\.local/);
  assert.match(callback, /if \(!data\.user\.email\)/);
  assert.match(callback, /error=email_missing/);
});

test("callback handles denied consent, missing code and exchange failure in Indonesian", () => {
  assert.match(callback, /access_denied: "oauth_denied"/);
  assert.match(callback, /error=missing_code/);
  assert.match(callback, /error=oauth_failed/);
  assert.match(loginPage, /Anda membatalkan proses masuk dengan penyedia/);
  assert.match(loginPage, /Penyedia login tidak memberikan alamat email/);
});

test("OAuth buttons are always rendered and only offer Google", () => {
  assert.match(buttons, /const label = mode === "signup" \? "Daftar" : "Masuk"/);
  assert.match(buttons, /\{label\} dengan Google/);
  // Facebook dihapus: banyak akun Facebook tanpa email.
  assert.doesNotMatch(buttons, /Facebook/);
  assert.doesNotMatch(buttons, /handleOAuth\("facebook"\)/);
});

test("OAuth redirect shows a branded waiting overlay", () => {
  assert.match(buttons, /Mengalihkan ke \{PROVIDER_DISPLAY\[provider\]\}/);
  assert.match(buttons, /function GoogleLogo/);
  assert.match(buttons, /aria-live="polite"/);
});

test("README documents the Google console setup and redirect URIs", () => {
  assert.match(readme, /Google login \(Supabase OAuth\)/);
  assert.match(readme, /auth\/v1\/callback/);
  assert.match(readme, /GOOGLE_CLIENT_ID/);
});
