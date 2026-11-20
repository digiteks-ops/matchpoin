import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const joinMigration = await readFile(
  new URL("../../supabase/migrations/00011_match_join.sql", import.meta.url),
  "utf8"
);
const createRoute = await readFile(
  new URL("../../src/app/api/matches/create/route.ts", import.meta.url),
  "utf8"
);
const joinRoute = await readFile(
  new URL("../../src/app/api/matches/[id]/join/route.ts", import.meta.url),
  "utf8"
);

test("join_match serialises concurrent joins with a row lock", () => {
  assert.match(joinMigration, /FROM public\.matches\s+WHERE id = p_match_id\s+FOR UPDATE/);
});

test("join_match blocks the organizer from joining their own match", () => {
  assert.match(joinMigration, /IF v_match\.organizer_id = v_uid THEN/);
  assert.match(joinMigration, /Anda adalah penyelenggara pertandingan ini/);
});

test("join_match blocks duplicate joins", () => {
  assert.match(joinMigration, /reason', 'duplicate'/);
  assert.match(joinMigration, /Anda sudah terdaftar pada pertandingan ini/);
});

test("join_match enforces capacity before inserting", () => {
  assert.match(joinMigration, /IF v_total >= v_max THEN/);
  assert.match(joinMigration, /Slot pertandingan sudah penuh/);
});

test("join_match is callable by authenticated users only", () => {
  assert.match(joinMigration, /GRANT EXECUTE ON FUNCTION public\.join_match\(UUID\) TO authenticated/);
});

test("create route allows open singles and only requires an opponent for private singles", () => {
  assert.match(createRoute, /matchType === 'private' && !payload\.opponentUserId/);
  assert.match(createRoute, /Pertandingan tunggal terbuka tidak dapat menentukan lawan manual/);
  assert.doesNotMatch(createRoute, /!isDoubles && matchType !== 'private'/);
});

test("join route rejects guests with 401 and notifies the host", () => {
  assert.match(joinRoute, /if \(authError \|\| !user\)/);
  assert.match(joinRoute, /status: 401/);
  assert.match(joinRoute, /notifyOpenMatchJoined/);
});
