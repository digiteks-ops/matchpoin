import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(`../../${relative}`, import.meta.url), "utf8");

const ratingService = await read("src/lib/services/rating-service.ts");
const mysqlResultService = await read("src/lib/mysql/result-service.ts");
const matchDetail = await read("src/components/matches/match-detail-client.tsx");
const rlsMigration = await read("supabase/migrations/00033_both_sides_submit_result.sql");

test("server allows the host and any confirmed opponent to submit", () => {
  const guard = ratingService.match(
    /async function assertCanSubmitResult[\s\S]*?\n\}/
  )?.[0];
  assert.ok(guard, "assertCanSubmitResult not found");
  assert.match(guard, /match\.organizer_id === userId \|\| participantIds\.includes\(userId\)/);
  // The old host-only branch must be gone.
  assert.doesNotMatch(guard, /organizerPlays/);
  assert.doesNotMatch(guard, /Hanya Host \(penyelenggara\)/);
});

test("host may confirm or dispute a result the opponent submitted", () => {
  const guard = ratingService.match(/async function assertParticipant[\s\S]*?\n\}/)?.[0];
  assert.ok(guard, "assertParticipant not found");
  assert.match(guard, /match\?\.organizer_id === userId/);
});

test("UI lets both sides submit and either side confirm", () => {
  assert.match(
    matchDetail,
    /const canSubmitResult =\s*\(viewer\.isOrganizer \|\| viewer\.isParticipant\)/
  );
  assert.match(
    matchDetail,
    /const canConfirm =\s*Boolean\(result\) &&\s*result\?\.status === "pending" &&\s*\(viewer\.isParticipant \|\| viewer\.isOrganizer\)/
  );
  // A submitter still cannot confirm their own result.
  assert.match(matchDetail, /result\?\.submittedBy !== viewer\.id/);
});

test("mysql parity path accepts a confirmed opponent too", () => {
  assert.match(mysqlResultService, /match\.organizer_id !== userId/);
  assert.match(mysqlResultService, /is_organizer = TRUE OR/);
  assert.match(mysqlResultService, /Hanya Host atau lawan terkonfirmasi/);
});

test("RLS lets the organizer insert and update results without a participant row", () => {
  assert.match(rlsMigration, /DROP POLICY IF EXISTS "participants can submit results"/);
  assert.match(rlsMigration, /DROP POLICY IF EXISTS "participants can update results"/);
  assert.match(rlsMigration, /m\.organizer_id = \(select auth\.uid\(\)\)/);
  assert.match(rlsMigration, /submitted_by = \(select auth\.uid\(\)\)/);
});