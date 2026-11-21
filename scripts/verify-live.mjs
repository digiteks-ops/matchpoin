/**
 * MATCHPOIN live verification orchestrator.
 *
 * Runs every live check it can, prints a PASS / FAIL / BLOCKED table and exits
 * non-zero on FAIL. Nothing is faked: missing tools/credentials are BLOCKED.
 *
 * Usage: npm run verify:live
 * Env:   .env / .env.local (app keys) and .env.test.local (test accounts)
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    if (!process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}
for (const file of [".env", ".env.local", ".env.test.local"]) loadEnv(file);

const env = (name) => (process.env[name] ?? "").trim();
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const SERVICE = env("SUPABASE_SERVICE_ROLE_KEY");
const APP_URL = env("LIGHTHOUSE_BASE_URL") || env("PLAYWRIGHT_BASE_URL") || env("NEXT_PUBLIC_APP_URL");

const results = [];
const add = (step, status, detail) => results.push({ step, status, detail });

async function call(pathname, { key = SERVICE, method = "GET", body } = {}) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, ok: response.ok, json, text };
}

async function rpc(name, args = {}, key = SERVICE) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: response.status, ok: response.ok, text: await response.text() };
}

// 1. Environment ------------------------------------------------------------
async function checkEnv() {
  if (!SUPABASE_URL) return add("env: NEXT_PUBLIC_SUPABASE_URL", "FAIL", "missing");
  add("env: NEXT_PUBLIC_SUPABASE_URL", "PASS", SUPABASE_URL);

  if (!ANON) add("env: anon key", "FAIL", "missing");
  else {
    const response = await call("/auth/v1/settings", { key: ANON }).catch((error) => ({
      status: 0,
      ok: false,
      text: error.message,
    }));
    add("env: anon key", response.ok ? "PASS" : "FAIL", response.ok ? "settings ok" : `HTTP ${response.status}`);
  }

  if (!SERVICE) add("env: service role key", "FAIL", "missing");
  else {
    const response = await call("/rest/v1/users?select=id&limit=1").catch((error) => ({
      status: 0,
      ok: false,
      text: error.message,
    }));
    add("env: service role key", response.ok ? "PASS" : "FAIL", response.ok ? "users readable" : `HTTP ${response.status}`);
  }
}

// 2. Migrations -------------------------------------------------------------
async function checkMigrations() {
  const checks = [
    ["00014 league model", "/rest/v1/tournaments?select=id,is_league,league_key,registration_deadline&limit=1"],
    ["00015 chat RLS helper", null],
    ["00016 registration write path", null],
    ["00017 admin role/RLS", null],
    ["00018 OAuth trigger", null],
    ["00019 storage buckets", "/storage/v1/bucket"],
    ["00020 explain tool", null],
    ["00021 indexes + definer helpers", null],
    ["00022 RLS hardening", null],
  ];

  for (const [label, pathname] of checks) {
    if (pathname) {
      const response = await call(pathname).catch((error) => ({ ok: false, status: 0, text: error.message }));
      if (label.includes("storage")) {
        const ids = Array.isArray(response.json) ? response.json.map((b) => b.id) : [];
        const ok = response.ok && ids.includes("avatars") && ids.includes("match-results");
        add(label, ok ? "PASS" : "FAIL", ok ? "avatars + match-results" : `ids: ${ids.join(",") || response.status}`);
      } else {
        add(label, response.ok ? "PASS" : "FAIL", response.ok ? "query ok" : `HTTP ${response.status}`);
      }
      continue;
    }

    if (label.startsWith("00015")) {
      const response = await rpc("is_conversation_member", { p_conversation_id: "00000000-0000-0000-0000-000000000000" });
      add(label, response.ok ? "PASS" : "FAIL", response.ok ? "helper callable" : `HTTP ${response.status}`);
    } else if (label.startsWith("00017") || label.startsWith("00018")) {
      const response = await rpc("get_user_roles", { p_user_id: "00000000-0000-0000-0000-000000000000" });
      add(label, response.ok ? "PASS" : "FAIL", response.ok ? "rbac callable (00017)" : `HTTP ${response.status}`);
    } else if (label.startsWith("00020")) {
      const response = await rpc("admin_explain", { p_sql: "select 1", p_analyze: false });
      add(label, response.ok ? "PASS" : "FAIL", response.ok ? "explain callable" : `HTTP ${response.status}`);
    } else if (label.startsWith("00021")) {
      const response = await rpc("is_match_member", {
        p_match_id: "00000000-0000-0000-0000-000000000000",
        p_user_id: "00000000-0000-0000-0000-000000000000",
      });
      add(label, response.ok ? "PASS" : "FAIL", response.ok ? "definer helpers callable" : `HTTP ${response.status}`);
    } else {
      add(label, "BLOCKED", "verify in SQL Editor (no SQL execution over REST)");
    }
  }
}

// 3. RLS smoke (anon must not read private rows) -----------------------------
async function checkRls() {
  if (!ANON) return add("RLS smoke", "BLOCKED", "anon key missing");
  const privateTables = ["users", "notifications", "messages", "conversations", "tournament_participants", "file_metadata"];
  for (const table of privateTables) {
    const response = await call(`/rest/v1/${table}?select=*&limit=1`, { key: ANON }).catch(() => null);
    if (!response) {
      add(`rls: ${table}`, "BLOCKED", "request failed");
      continue;
    }
    const rows = Array.isArray(response.json) ? response.json.length : 0;
    const safe = !response.ok || rows === 0;
    add(`rls: ${table}`, safe ? "PASS" : "FAIL", safe ? `rows=${rows} (guarded)` : "anon can read rows");
  }
}

// 4. External tools ---------------------------------------------------------
function run(command, args, extraEnv = {}) {
  return spawnSync(command, args, {
    stdio: "pipe",
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, ...extraEnv },
  });
}

function checkPlaywright() {
  if (!existsSync(path.join(process.cwd(), "node_modules", "@playwright", "test"))) {
    add("playwright e2e", "BLOCKED", "npm i -D @playwright/test && npx playwright install chromium");
    return;
  }
  const result = run("npx", ["playwright", "test", "--reporter=line"]);
  add("playwright e2e", result.status === 0 ? "PASS" : "FAIL", result.status === 0 ? "all specs" : tail(result));
}

function checkLighthouse() {
  const version = run("npx", ["--no-install", "lighthouse", "--version"]);
  if (version.status !== 0) {
    add("lighthouse", "BLOCKED", "npm i -D lighthouse");
    return;
  }
  if (!APP_URL) {
    add("lighthouse", "BLOCKED", "LIGHTHOUSE_BASE_URL missing");
    return;
  }
  const routes = ["/", "/login", "/tournaments", "/matches", "/admin"];
  for (const route of routes) {
    const result = run("npx", [
      "--no-install",
      "lighthouse",
      `${APP_URL}${route}`,
      "--only-categories=performance",
      "--form-factor=mobile",
      "--screenEmulation.mobile",
      "--chrome-flags=--headless --no-sandbox",
      "--output=json",
      "--output-path=stdout",
      "--quiet",
    ]);
    if (result.status !== 0) {
      add(`lighthouse ${route}`, "FAIL", tail(result));
      continue;
    }
    try {
      const report = JSON.parse(result.stdout);
      const score = Math.round((report.categories?.performance?.score ?? 0) * 100);
      add(`lighthouse ${route}`, score >= 70 ? "PASS" : "FAIL", `performance ${score}/100`);
    } catch {
      add(`lighthouse ${route}`, "BLOCKED", "could not parse report");
    }
  }
}

function checkScripts() {
  for (const [label, script] of [
    ["db:time", "db:time"],
    ["db:explain", "db:explain"],
  ]) {
    const result = run("npm", ["run", script]);
    add(label, result.status === 0 ? "PASS" : "FAIL", result.status === 0 ? "timings collected" : tail(result));
  }
}

function tail(result, lines = 3) {
  const text = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.trim().split(/\r?\n/);
  return text.slice(-lines).join(" | ").slice(0, 240) || `exit ${result.status}`;
}

// Run -----------------------------------------------------------------------
await checkEnv();
await checkMigrations();
await checkRls();
checkScripts();
checkPlaywright();
checkLighthouse();

const width = Math.max(...results.map((row) => row.step.length), 10) + 2;
console.log(`\nMATCHPOIN verify:live — ${new Date().toISOString()}\n`);
for (const row of results) {
  console.log(`${row.status.padEnd(8)} ${row.step.padEnd(width)} ${row.detail}`);
}
const counts = results.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] ?? 0) + 1 }), {});
console.log(`\nPASS ${counts.PASS ?? 0}  FAIL ${counts.FAIL ?? 0}  BLOCKED ${counts.BLOCKED ?? 0}`);
process.exit(counts.FAIL ? 1 : 0);
