import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/00017_admin_role_and_registration_rls.sql", import.meta.url),
  "utf8"
);
const layout = await readFile(new URL("../../src/app/admin/layout.tsx", import.meta.url), "utf8");
const tournamentsPage = await readFile(
  new URL("../../src/app/admin/tournaments/page.tsx", import.meta.url),
  "utf8"
);
const approveRoute = await readFile(
  new URL("../../src/app/api/admin/tournaments/registrations/[id]/approve/route.ts", import.meta.url),
  "utf8"
);
const rejectRoute = await readFile(
  new URL("../../src/app/api/admin/tournaments/registrations/[id]/reject/route.ts", import.meta.url),
  "utf8"
);
const competitionService = await readFile(
  new URL("../../src/lib/supabase/competition-service.ts", import.meta.url),
  "utf8"
);

test("role column is constrained to player/admin", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player'/);
  assert.match(migration, /CHECK \(role IN \('player', 'admin'\)\)/);
});

test("self-escalation is blocked by an invoker trigger and column revoke", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.guard_role_column\(\)/);
  assert.doesNotMatch(
    migration.match(/guard_role_column\(\)[\s\S]*?RETURN NEW;/)?.at(0) ?? "",
    /SECURITY DEFINER/
  );
  assert.match(migration, /current_user NOT IN \('postgres', 'supabase_admin', 'service_role'\)/);
  assert.match(migration, /REVOKE UPDATE \(role\) ON public\.users FROM anon, authenticated/);
});

test("is_admin is a SECURITY DEFINER helper with a pinned search_path", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.is_admin\(p_user_id UUID\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/
  );
});

test("is_admin has explicit 0-arg and 1-arg overloads (no ambiguous default)", () => {
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.is_admin\(\)/);
  assert.doesNotMatch(migration, /p_user_id UUID DEFAULT/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.is_admin\(\) TO authenticated, service_role/);
});

test("players read only their own registrations and only admins update", () => {
  assert.match(
    migration,
    /CREATE POLICY "players read own registrations" ON public\.tournament_participants\s+FOR SELECT TO authenticated\s+USING \(user_id = auth\.uid\(\) OR public\.is_admin\(\)\)/
  );
  assert.match(
    migration,
    /CREATE POLICY "admins update registrations" ON public\.tournament_participants\s+FOR UPDATE TO authenticated\s+USING \(public\.is_admin\(\)\)/
  );
});

test("quota counts only accepted registrations", () => {
  assert.match(migration, /'accepted', \([\s\S]*?status IN \('accepted', 'confirmed'\)/);
});

test("decline reason is optional in the RPC", () => {
  assert.match(migration, /p_reason TEXT DEFAULT NULL/);
  assert.match(migration, /COALESCE\(v_reason, 'Ditolak oleh admin'\)/);
});

test("admin area has its own guarded layout and server-side page check", () => {
  assert.match(layout, /requirePageRole\("admin", "\/admin"\)/);
  assert.match(layout, /MatchPoin Admin/);
  assert.match(tournamentsPage, /requirePageRole\("admin", "\/admin\/tournaments"\)/);
});

test("admin accept/decline endpoints require the admin role server-side", () => {
  assert.match(approveRoute, /requireApiRole\("admin"\)/);
  assert.match(rejectRoute, /requireApiRole\("admin"\)/);
});

test("tournament list reads quota counts from the aggregate RPC, not raw rows", () => {
  assert.match(competitionService, /rpc\("league_registration_counts"\)/);
  assert.match(competitionService, /registration_count: Number\(counts\.get\(row\.id\)\?\.accepted/);
});
