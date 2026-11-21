/**
 * Measures the hot MATCHPOIN queries with EXPLAIN ANALYZE.
 *
 * Requires migration 00020 (admin_explain) applied and the service role key.
 * Run with: node --env-file=.env.local scripts/supabase/explain-hot-queries.mjs
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

for (const file of [".env", ".env.local"]) {
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

const QUERIES = [
  {
    label: "matches list (open/full, upcoming)",
    sql: `select id, title, match_date, start_time, status,
                 match_participants(id, match_id, user_id, is_organizer, team, metadata)
          from public.matches
          where status in ('open','full') and match_date >= current_date
          order by match_date asc, start_time asc
          limit 50`,
  },
  {
    label: "match detail participants",
    sql: `select id, match_id, user_id, is_organizer, team, joined_at
          from public.match_participants
          where match_id = (select id from public.matches limit 1)`,
  },
  {
    label: "league registrations by tournament",
    sql: `select id, tournament_id, user_id, category, status
          from public.tournament_participants
          where tournament_id in (select id from public.tournaments where is_league limit 5)
          order by joined_at asc
          limit 1000`,
  },
  {
    label: "notifications feed",
    sql: `select id, type, title, message, is_read, created_at
          from public.notifications
          order by created_at desc
          limit 50`,
  },
  {
    label: "chat messages by conversation",
    sql: `select id, conversation_id, sender_id, body, created_at
          from public.messages
          order by conversation_id, created_at desc
          limit 50`,
  },
  {
    label: "league registration counts RPC",
    sql: `select * from public.league_registration_counts()`,
  },
];

function summarize(plan) {
  const root = Array.isArray(plan) ? plan[0] : plan;
  const execution = Number(root?.["Execution Time"] ?? 0);
  const planning = Number(root?.["Planning Time"] ?? 0);
  const node = root?.Plan;
  return {
    executionMs: Number(execution.toFixed(2)),
    planningMs: Number(planning.toFixed(2)),
    topNode: node?.["Node Type"] ?? "?",
    rows: node?.["Actual Rows"] ?? null,
    seqScan: Boolean(node?.["Node Type"] === "Seq Scan"),
  };
}

console.log(`MATCHPOIN query timings â€” ${new Date().toISOString()}\n`);
const results = [];
let failed = 0;

for (const query of QUERIES) {
  const { data, error } = await supabase.rpc("admin_explain", {
    p_sql: query.sql,
    p_analyze: true,
  });
  if (error) {
    console.log(`âœ— ${query.label}: ${error.message}`);
    failed += 1;
    results.push({ label: query.label, error: error.message });
    continue;
  }
  const summary = summarize(data);
  results.push({ label: query.label, ...summary });
  console.log(
    `â€¢ ${query.label}: ${summary.executionMs} ms (plan ${summary.planningMs} ms, ` +
      `${summary.topNode}${summary.seqScan ? ", SEQ SCAN" : ""})`
  );
}

if (process.argv.includes("--json")) {
  console.log("\n" + JSON.stringify(results, null, 2));
}

process.exit(failed ? 1 : 0);


