/**
 * Measures wall-clock timings of the hot MATCHPOIN read paths over PostgREST.
 *
 * Uses the service-role client, so it works before/after indexes are applied
 * and does not depend on migration 00020. Run:
 *   node --env-file=.env.local scripts/supabase/time-hot-endpoints.mjs [--json]
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

for (const file of [".env", ".env.local"]) {
  if (file === ".env" && process.env.MATCHPOIN_SKIP_BASE === "1") continue;
  if (file === ".env.local" && process.env.MATCHPOIN_SKIP_LOCAL === "1") continue;
  if (existsSync(file)) process.loadEnvFile(file);
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { enabled: false },
});

async function timed(run) {
  const start = performance.now();
  const result = await run();
  const ms = performance.now() - start;
  if (result?.error) throw new Error(result.error.message);
  return { ms, rows: Array.isArray(result?.data) ? result.data.length : null };
}

async function median(fn, runs = 3) {
  const samples = [];
  let rows = null;
  for (let i = 0; i < runs; i += 1) {
    const result = await timed(fn);
    samples.push(result.ms);
    rows = result.rows ?? rows;
  }
  samples.sort((a, b) => a - b);
  return { ms: Number(samples[Math.floor(samples.length / 2)].toFixed(2)), rows };
}

// Pick sample keys so the queries hit realistic data.
const { data: sampleMatch } = await supabase.from("matches").select("id").limit(1).maybeSingle();
const { data: sampleConversation } = await supabase
  .from("conversations")
  .select("id")
  .limit(1)
  .maybeSingle();
const { data: sampleUser } = await supabase.from("users").select("id").limit(1).maybeSingle();
const { data: leagueIds } = await supabase
  .from("tournaments")
  .select("id")
  .eq("is_league", true)
  .limit(5);

const checks = [
  {
    label: "matches list (embedded participants, limit 50)",
    run: () =>
      supabase
        .from("matches")
        .select(
          "id, title, match_date, start_time, status, match_participants(id, match_id, user_id, is_organizer, team, metadata)"
        )
        .in("status", ["open", "full"])
        .order("match_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(50),
  },
  {
    label: "match participants by match",
    run: () =>
      supabase
        .from("match_participants")
        .select("id, match_id, user_id, is_organizer, team, joined_at")
        .eq("match_id", sampleMatch?.id ?? "00000000-0000-0000-0000-000000000000"),
  },
  {
    label: "league registrations by tournaments (limit 1000)",
    run: () =>
      supabase
        .from("tournament_participants")
        .select("id, tournament_id, user_id, category, status")
        .in("tournament_id", (leagueIds ?? []).map((row) => row.id))
        .order("joined_at", { ascending: true })
        .limit(1000),
  },
  {
    label: "notifications feed (limit 50)",
    run: () =>
      supabase
        .from("notifications")
        .select("id, type, title, message, is_read, created_at")
        .eq("user_id", sampleUser?.id ?? "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false })
        .limit(50),
  },
  {
    label: "chat messages by conversation (limit 50)",
    run: () =>
      supabase
        .from("messages")
        .select("id, conversation_id, sender_id, created_at")
        .eq("conversation_id", sampleConversation?.id ?? "00000000-0000-0000-0000-000000000000")
        .order("created_at", { ascending: false })
        .limit(50),
  },
  {
    label: "league registration counts RPC",
    run: () => supabase.rpc("league_registration_counts"),
  },
];

console.log(`MATCHPOIN REST timings — ${new Date().toISOString()}\n`);
const results = [];
let failed = 0;
for (const check of checks) {
  try {
    const { ms, rows } = await median(check.run);
    results.push({ label: check.label, medianMs: ms, rows });
    console.log(`• ${check.label}: ${ms} ms${rows === null ? "" : ` (${rows} rows)`}`);
  } catch (error) {
    failed += 1;
    results.push({ label: check.label, error: error.message });
    console.log(`âœ— ${check.label}: ${error.message}`);
  }
}

if (process.argv.includes("--json")) {
  console.log("\n" + JSON.stringify(results, null, 2));
}

process.exit(failed ? 1 : 0);


