import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const matchService = await readFile(
  new URL("../../src/lib/services/match-service.ts", import.meta.url),
  "utf8"
);
const publicPlayer = await readFile(
  new URL("../../src/lib/supabase/public-player-service.ts", import.meta.url),
  "utf8"
);
const adminService = await readFile(
  new URL("../../src/lib/supabase/admin-service.ts", import.meta.url),
  "utf8"
);
const tournamentAdmin = await readFile(
  new URL("../../src/lib/supabase/tournament-admin-service.ts", import.meta.url),
  "utf8"
);
const realtime = await readFile(
  new URL("../../src/hooks/use-realtime-notifications.ts", import.meta.url),
  "utf8"
);
const indexes = await readFile(
  new URL("../../supabase/migrations/00021_perf_indexes_and_rls.sql", import.meta.url),
  "utf8"
);
const explain = await readFile(
  new URL("../../supabase/migrations/00020_query_explain_tool.sql", import.meta.url),
  "utf8"
);

test("match lists embed participants instead of a second participants query", () => {
  assert.match(matchService, /match_participants\(id, match_id, user_id, is_organizer/);
  assert.match(matchService, /match\.match_participants \?\?/);
  assert.doesNotMatch(
    matchService.match(/async function hydrateMatches[\s\S]*?\n\}/)?.[0] ?? "",
    /\.from\("match_participants"\)/
  );
});

test("public player lists select explicit columns", () => {
  assert.match(publicPlayer, /const PUBLIC_PLAYER_COLUMNS =/);
  assert.match(publicPlayer, /\.select\(PUBLIC_PLAYER_COLUMNS\)/);
  assert.doesNotMatch(publicPlayer, /from\("public_players"\)\.select\("\*"\)/);
});

test("admin list queries have explicit columns and limits", () => {
  assert.match(adminService, /\.from\("public_players"\)[\s\S]*?select\(\s*"user_id, full_name, display_name/);
  assert.match(adminService, /\.eq\("is_league", true\)[\s\S]*?\.limit\(200\)/);
  assert.match(tournamentAdmin, /\.order\("joined_at", \{ ascending: true \}\)[\s\S]*?\.limit\(1000\)/);
});

test("realtime channel is removed on unmount and polling only runs while disconnected", () => {
  assert.match(realtime, /removeChannel\(channelRef\.current\)/);
  assert.match(realtime, /if \(!connectedRef\.current\) void fetchNotifications\(\)/);
  assert.match(realtime, /\}, 60000\);/);
});

test("migration 00021 adds the hot-path indexes", () => {
  for (const name of [
    "idx_matches_status_date",
    "idx_matches_organizer",
    "idx_match_participants_user_active",
    "idx_messages_conversation_created",
    "idx_conversation_members_user",
    "idx_tournament_participants_user",
    "idx_notifications_user_created",
  ]) {
    assert.ok(indexes.includes(name), `missing index ${name}`);
  }
});

test("RLS policies wrap auth.uid() and use definer helpers", () => {
  assert.match(indexes, /\(SELECT auth\.uid\(\)\)/);
  assert.match(indexes, /FUNCTION public\.is_match_member/);
  assert.match(indexes, /FUNCTION public\.is_match_organizer/);
  assert.match(indexes, /SECURITY DEFINER[\s\S]*?SET search_path = public/);
  // The same policy names must remain, so access rules do not drift.
  for (const policy of [
    "matches are publicly readable",
    "organizers can update their matches",
    "participants and organizers can update",
    "notifications_own_read",
    "members read messages",
    "players read own registrations",
  ]) {
    assert.ok(indexes.includes(`CREATE POLICY "${policy}"`) || indexes.includes(`CREATE POLICY ${policy}`), policy);
  }
});

test("explain tool is service-role only and read-only", () => {
  assert.match(explain, /REVOKE ALL ON FUNCTION public\.admin_explain\(TEXT, BOOLEAN\)/);
  assert.match(explain, /GRANT EXECUTE ON FUNCTION public\.admin_explain\(TEXT, BOOLEAN\) TO service_role/);
  assert.match(explain, /p_sql !~\* '\^\\s\*select\\b'/);
});
