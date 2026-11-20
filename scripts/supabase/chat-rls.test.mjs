import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../../supabase/migrations/00015_fix_chat_rls_recursion.sql", import.meta.url),
  "utf8"
);

test("membership helper is SECURITY DEFINER with a pinned search_path", () => {
  assert.match(
    migration,
    /CREATE OR REPLACE FUNCTION public\.is_conversation_member\(p_conversation_id UUID\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = public/
  );
});

test("helper is granted to authenticated only", () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.is_conversation_member\(UUID\) FROM PUBLIC/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.is_conversation_member\(UUID\) TO authenticated/);
});

test("conversation_members SELECT policy no longer queries itself", () => {
  const policy = migration.match(
    /CREATE POLICY "members read memberships" ON public\.conversation_members[\s\S]*?;/
  )?.[0];
  assert.ok(policy, "rewritten members read memberships policy exists");
  assert.doesNotMatch(policy, /SELECT 1 FROM public\.conversation_members/);
  assert.match(policy, /public\.is_conversation_member\(conversation_id\)/);
});

test("conversations and messages policies use the helper", () => {
  assert.match(
    migration,
    /CREATE POLICY "conversation members can read" ON public\.conversations\s+FOR SELECT USING \(public\.is_conversation_member\(id\)\)/
  );
  assert.match(
    migration,
    /CREATE POLICY "members read messages" ON public\.messages\s+FOR SELECT USING \(public\.is_conversation_member\(conversation_id\)\)/
  );
  assert.match(
    migration,
    /CREATE POLICY "members send messages" ON public\.messages\s+FOR INSERT WITH CHECK \(\s*sender_id = auth\.uid\(\)\s*AND public\.is_conversation_member\(conversation_id\)\s*\)/
  );
});

test("every rewritten policy drops the old one first (re-runnable)", () => {
  for (const name of [
    "conversation members can read",
    "conversation members can update",
    "members read memberships",
    "members read messages",
    "members send messages",
  ]) {
    assert.ok(
      migration.includes(`DROP POLICY IF EXISTS "${name}"`),
      `drops policy: ${name}`
    );
  }
});
