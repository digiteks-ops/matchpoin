import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const publicClient = await read("src/lib/supabase/public.ts");
const publicPlayers = await read("src/lib/supabase/public-player-service.ts");
const competition = await read("src/lib/supabase/competition-service.ts");
const foundation = await read("supabase/migrations/00001_initial_foundation.sql");

test("public reads fall back to the anon client when the service key is absent", () => {
  assert.match(publicClient, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.match(publicClient, /persistSession: false/);
  const executable = publicClient.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(executable, /cookies|next\/headers/);
  assert.match(publicPlayers, /createAdminClient\(\) \?\? createPublicClient\(\)/);
});

test("cities remain publicly readable so the fallback works under RLS", () => {
  assert.match(foundation, /Allow public read access to active cities/);
  assert.match(foundation, /USING \(is_active = true\)/);
});

test("tournament quota falls back to a bounded count when the RPC is missing", () => {
  assert.match(competition, /error: countError/);
  assert.match(competition, /if \(!countError && Array\.isArray\(countRows\)\)/);
  assert.match(competition, /\.limit\(5000\)/);
  assert.match(competition, /row\.status === "pending" && row\.entry_role === "captain"/);
});
