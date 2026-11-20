import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

const supabaseAuth = await read("src/lib/auth/supabase-auth.ts");
const rbac = await read("src/lib/supabase/rbac-service.ts");
const publicPlayer = await read("src/lib/supabase/public-player-service.ts");
const notificationBell = await read("src/components/notifications/notification-bell.tsx");
const matchPage = await read("src/app/matches/[id]/page.tsx");
const adminSettings = await read("src/app/admin/settings/page.tsx");
const adminTournament = await read("src/app/admin/tournaments/[id]/page.tsx");
const vercel = await read("vercel.json");

async function walk(dir) {
  const entries = await readdir(new URL(dir, root), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(child)));
    else files.push(child);
  }
  return files;
}

const appFiles = await walk("src/app");
const srcFiles = await walk("src");

test("every list/detail route has a loading skeleton", async () => {
  const loadingRoutes = appFiles.filter((file) => file.endsWith("loading.tsx"));
  for (const route of [
    "src/app/matches/loading.tsx",
    "src/app/matches/[id]/loading.tsx",
    "src/app/tournaments/loading.tsx",
    "src/app/players/loading.tsx",
    "src/app/leaderboard/loading.tsx",
    "src/app/admin/loading.tsx",
  ]) {
    assert.ok(loadingRoutes.includes(route), `missing ${route}`);
  }
  assert.ok(loadingRoutes.length >= 12, `expected >= 12 loading files, got ${loadingRoutes.length}`);
});

test("session and roles are resolved once per request via React cache", () => {
  assert.match(supabaseAuth, /import \{ cache \} from "react"/);
  assert.match(supabaseAuth, /export const getSupabaseSession = cache\(/);
  assert.match(rbac, /export const getUserRoles = cache\(/);
});

test("heavy client views are code-split with next/dynamic", () => {
  assert.match(matchPage, /nextDynamic\(/);
  assert.match(adminSettings, /nextDynamic\(/);
  assert.match(adminTournament, /nextDynamic\(/);
  // Pages keep `export const dynamic = "force-dynamic"`; the import is renamed.
  assert.match(matchPage, /export const dynamic = "force-dynamic"/);
});

test("internal navigation uses the router, not full page reloads", () => {
  assert.match(notificationBell, /router\.push\(`\/matches\/\$\{notification\.referenceId\}`\)/);
  assert.match(notificationBell, /router\.push\("\/tournaments"\)/);
  assert.doesNotMatch(notificationBell, /window\.location\.href = /);
});

test("no raw <img> tags in the app", async () => {
  const offenders = [];
  for (const file of srcFiles.filter((name) => /\.(tsx|ts)$/.test(name))) {
    const contents = await read(file);
    if (/<img\s/.test(contents)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("rarely changing cities are cached", () => {
  assert.match(publicPlayer, /import \{ unstable_cache \} from "next\/cache"/);
  assert.match(publicPlayer, /unstable_cache\(/);
  assert.match(publicPlayer, /revalidate: 3600/);
});

test("Vercel functions run in the Singapore region next to Supabase", () => {
  const parsed = JSON.parse(vercel);
  assert.deepEqual(parsed.regions, ["sin1"]);
});
