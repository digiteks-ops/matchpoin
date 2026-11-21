import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const hardening = await read("supabase/migrations/00022_rls_hardening.sql");
const m13 = await read("supabase/migrations/00013_restore_supabase_architecture.sql");
const m14b = await read("supabase/migrations/00014_match_and_league_ika17.sql");
const m19 = await read("supabase/migrations/00019_storage_buckets_and_policies.sql");

test("00022 rewrites every audited policy with (select auth.uid())", () => {
  for (const policy of [
    "Users can insert their own profile",
    "Users can update their own profile",
    "owner full access",
    "participants can submit results",
    "participants can update results",
    "participants can delete results",
    "users can read their rating history",
    "users can create their own rating",
    "Users can join leagues",
    "wo reports visible to reporter",
    "participants can report walkover",
    "cancellation requests visible to requester",
    "participants can request cancellation",
    "users read own feedback",
    "user_roles_own_read",
    "file_metadata_own_read",
  ]) {
    assert.ok(hardening.includes(`"${policy}"`) || hardening.includes(` ${policy} `), policy);
  }
  assert.match(hardening, /\(select auth\.uid\(\)\)/);
  const executable = hardening.replace(/--.*$/gm, "");
  assert.doesNotMatch(executable, /auth\.uid\(\) IS NOT NULL/);
});

test("00022 fixes the legacy leagues policy so only admins can write", () => {
  const block = hardening.match(
    /CREATE POLICY "Admins can manage leagues" ON public\.leagues[\s\S]*?\$sql\$;/
  )?.[0];
  assert.ok(block, "leagues policy rewritten");
  assert.match(block, /public\.has_role\(\(select auth\.uid\(\)\), 'admin'\)/);
});

test("00022 keeps storage writes pinned to the caller id", () => {
  assert.match(hardening, /split_part\(name, '\/', 1\) = \(select auth\.uid\(\)\)::text/);
  assert.match(
    hardening,
    /public\.is_match_participant\(split_part\(name, '\/', 2\)::uuid, \(select auth\.uid\(\)\)\)/
  );
});

test("legacy migrations are re-runnable (defaults + storage policies)", () => {
  assert.match(m13, /DROP FUNCTION IF EXISTS public\.admin_reject_registration\(UUID, UUID, TEXT\)/);
  assert.match(m14b, /DROP FUNCTION IF EXISTS public\.admin_reject_registration\(UUID, UUID, TEXT\)/);
  assert.match(m19, /FROM pg_policies[\s\S]*?DROP POLICY IF EXISTS %I ON storage\.objects/);
});

test("static RLS audit passes with zero FAIL/WARN findings", () => {
  const result = spawnSync(process.execPath, ["scripts/supabase/rls-audit.mjs"], {
    cwd: new URL("../../", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /FAIL: 0\s+WARN: 0/);
});
