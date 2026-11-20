import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const service = await readFile(
  new URL("../../src/lib/services/match-service.ts", import.meta.url),
  "utf8"
);
const page = await readFile(new URL("../../src/app/matches/page.tsx", import.meta.url), "utf8");
const constants = await readFile(
  new URL("../../src/lib/matches/constants.ts", import.meta.url),
  "utf8"
);

test("host names are fetched in one batched query, not per card", () => {
  const batch = service.match(
    /async function getProfilesForUsers[\s\S]*?return profileMap;\s*\}/
  )?.[0];
  assert.ok(batch, "getProfilesForUsers exists");
  assert.match(batch, /\.from\("public_players"\)/);
  assert.match(batch, /\.in\("user_id", unique\)/);
  // No per-user round trip inside the batched lookup.
  assert.doesNotMatch(batch, /unique\.forEach\(async/);
  assert.doesNotMatch(batch, /for \(const id of unique\)[\s\S]*?await supabase/);
});

test("host fallback is Pemain, never the literal Host", () => {
  assert.match(service, /\|\| "Pemain";/);
  assert.doesNotMatch(service, /: null\) \|\| "Host"/);
});

test("match detail exposes the organizer avatar", () => {
  assert.match(constants, /organizerAvatarUrl\?: string \| null;/);
  assert.match(service, /const organizerAvatarUrl =/);
  assert.match(service, /organizerAvatarUrl,/);
});

test("match card renders the host avatar with a name fallback", () => {
  assert.match(page, /match\.organizerAvatarUrl/);
  assert.match(page, /match\.organizerName/);
  assert.match(page, /organizerName\.charAt\(0\)\.toUpperCase\(\)/);
});
