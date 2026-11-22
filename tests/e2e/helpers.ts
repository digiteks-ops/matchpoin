import { expect, test as base, type Page } from "@playwright/test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/** Load .env.test.local without adding a dotenv dependency. */
function loadTestEnv() {
  const file = path.join(process.cwd(), ".env.test.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadTestEnv();

export const test = base;
export { expect };

export const env = (name: string): string => (process.env[name] ?? "").trim();

export const baseUrl = (): string =>
  env("PLAYWRIGHT_BASE_URL") || env("NEXT_PUBLIC_APP_URL") || "http://localhost:3000";

export function playerCreds() {
  return { email: env("TEST_PLAYER_EMAIL"), password: env("TEST_PLAYER_PASSWORD") };
}

export function player2Creds() {
  return { email: env("TEST_PLAYER2_EMAIL"), password: env("TEST_PLAYER2_PASSWORD") };
}

export function adminCreds() {
  return { email: env("TEST_ADMIN_EMAIL"), password: env("TEST_ADMIN_PASSWORD") };
}

export function supabaseAdminEnv() {
  return {
    url: env("NEXT_PUBLIC_SUPABASE_URL"),
    serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    anonKey: env("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  };
}

/** Skip the whole spec file with an explicit BLOCKED reason. */
export function requireEnv(testInstance: typeof base, keys: string[], reason: string) {
  const missing = keys.filter((key) => !env(key));
  testInstance.skip(
    missing.length > 0,
    `BLOCKED: ${reason} (missing: ${missing.join(", ")}). Fill .env.test.local and re-run.`
  );
}

export async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  // Stable ids: getByLabel(/kata sandi/i) also matches the show-password button.
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  // The navbar also has a "Masuk" button; submit the form inside <main>.
  await page.getByRole("main").getByRole("button", { name: /^masuk$/i }).click();
  // Wait until the session cookie is written and the app navigates away;
  // otherwise the next page.goto() can race ahead as a guest.
  await page.waitForURL(/\/(dashboard|admin)/, { timeout: 25_000 });
}

export async function serviceRest(pathname: string, init: RequestInit = {}) {
  const { url, serviceKey } = supabaseAdminEnv();
  const response = await fetch(`${url}/rest/v1/${pathname}`, {
    ...init,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null, ok: response.ok };
}

/** Deletes rows whose title/name starts with the E2E prefix. */
export async function cleanupByPrefix(prefix: string) {
  await serviceRest(`matches?title=like.${encodeURIComponent(`${prefix}%`)}`, {
    method: "DELETE",
  });
  await serviceRest(`tournaments?name=like.${encodeURIComponent(`${prefix}%`)}`, {
    method: "DELETE",
  });
  await serviceRest(`notifications?title=like.${encodeURIComponent(`${prefix}%`)}`, {
    method: "DELETE",
  });
}

/** Returns a Supabase access token for REST-level security tests. */
export async function accessToken(email: string, password: string): Promise<string> {
  const { url, anonKey } = supabaseAdminEnv();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("BLOCKED: could not obtain an access token for the test account.");
  return json.access_token;
}

export async function userIdByEmail(email: string): Promise<string | null> {
  const { body } = await serviceRest(`users?select=id&email=eq.${encodeURIComponent(email)}`);
  return Array.isArray(body) && body[0]?.id ? body[0].id : null;
}

export async function openLeagueId(category?: string): Promise<string | null> {
  const filter = category ? `&category=eq.${encodeURIComponent(category)}` : "";
  const { body } = await serviceRest(
    `tournaments?select=id,category,status,max_participants&is_league=eq.true&status=eq.registration_open${filter}&limit=1`
  );
  return Array.isArray(body) && body[0]?.id ? body[0].id : null;
}

export async function playerGender(email: string): Promise<string | null> {
  const id = await userIdByEmail(email);
  if (!id) return null;
  const { body } = await serviceRest(`users?select=gender&id=eq.${id}`);
  return Array.isArray(body) ? body[0]?.gender ?? null : null;
}

export async function acceptedEntryCount(tournamentId: string): Promise<number> {
  const { body } = await serviceRest(
    `tournament_participants?select=entry_id,status&tournament_id=eq.${tournamentId}&status=in.(accepted,confirmed)`
  );
  if (!Array.isArray(body)) return 0;
  return new Set(body.map((row: { entry_id: string | null }) => row.entry_id)).size;
}

export async function createOpenMatchViaUi(page: Page, title: string) {
  await page.goto("/matches/new");
  await page.getByRole("button", { name: /open match/i }).click();
  await page.locator("#title").fill(title);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await page.locator("#matchDate").fill(tomorrow);
  await page.locator("#startTime").fill("18:00");
  await page.locator("#courtName").fill("E2E Court");
  // Province and city are required before the submit button is enabled.
  const provinceSelect = page.locator("#province");
  await provinceSelect
    .selectOption({ label: "Sulawesi Selatan" })
    .catch(async () => provinceSelect.selectOption({ index: 1 }));
  await page
    .waitForFunction(() => document.querySelectorAll("#cityName option").length > 1)
    .catch(() => undefined);
  const citySelect = page.locator("#cityName");
  await citySelect
    .selectOption({ label: "Makassar" })
    .catch(async () => citySelect.selectOption({ index: 1 }));
  await page.getByRole("button", { name: /buat open match/i }).click();
  // Wait for the redirect to the new match so callers can read its id.
  await page.waitForURL(/\/matches\/[0-9a-f-]{36}/, { timeout: 25_000 });
}
