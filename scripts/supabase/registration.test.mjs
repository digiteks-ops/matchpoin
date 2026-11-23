import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  evaluateLeagueRegistration,
  parseRegistrationPayload,
} from "../../src/lib/mysql/competition-registration-core.mjs";

const migration = await readFile(
  new URL("../../supabase/migrations/00016_fix_registration_write_path.sql", import.meta.url),
  "utf8"
);
const routeSource = await readFile(
  new URL("../../src/app/api/tournaments/register/route.ts", import.meta.url),
  "utf8"
);

const openLeague = {
  category: "mens_singles",
  name: "Liga Tennis IKA17 — Single Man",
  status: "registration_open",
  max_participants: 24,
  registration_deadline: "2099-12-31",
};

test("migration relaxes audit action to allow submitted/approved/rejected", () => {
  assert.match(migration, /DROP CONSTRAINT IF EXISTS chk_tournament_reg_audit_action/);
  assert.match(migration, /CHECK \(action IN \('submitted', 'approved', 'rejected'\)\)/);
});

test("migration makes previous_status nullable for submissions", () => {
  assert.match(migration, /ALTER COLUMN previous_status DROP NOT NULL/);
});

test("migration accepts the accepted status used by approval", () => {
  assert.match(migration, /new_status IN \('pending', 'accepted', 'rejected', 'confirmed', 'waiting_list'\)/);
});

test("migration adds the approval bookkeeping columns", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS approved_by UUID/);
});

test("payload parser rejects a missing league id", () => {
  const parsed = parseRegistrationPayload({});
  assert.equal(parsed.ok, false);
});

test("payload parser accepts a tournament id and optional partner", () => {
  const parsed = parseRegistrationPayload({
    tournamentId: "0f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b",
    partnerUserId: null,
    playingExperience: "beginner",
    eligibilityConfirmed: true,
  });
  assert.deepEqual(parsed, {
    ok: true,
    leagueId: "0f1d2c3b-4a59-4e6f-8a7b-9c0d1e2f3a4b",
    partnerUserId: null,
    playingExperience: "beginner",
    eligibilityConfirmed: true,
  });
});

test("success: an eligible player can register", () => {
  const result = evaluateLeagueRegistration({
    tournament: openLeague,
    userId: "user-a",
    partnerUserId: null,
    registeredUserIds: [],
    entryCount: 0,
    today: "2026-11-20",
  });
  assert.equal(result.ok, true);
  assert.equal(result.category, "mens_singles");
});

test("already registered: the same player cannot register twice", () => {
  const result = evaluateLeagueRegistration({
    tournament: openLeague,
    userId: "user-a",
    partnerUserId: null,
    registeredUserIds: ["user-a"],
    entryCount: 1,
    today: "2026-11-20",
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /sudah terdaftar/i);
});

test("quota full: registration is rejected when accepted entries fill the quota", () => {
  const result = evaluateLeagueRegistration({
    tournament: { ...openLeague, max_participants: 24 },
    userId: "user-b",
    partnerUserId: null,
    registeredUserIds: [],
    entryCount: 24,
    today: "2026-11-20",
  });
  assert.equal(result.ok, false);
  assert.match(result.message, /penuh/i);
});

test("doubles require a partner and cannot use yourself", () => {
  const doubles = { ...openLeague, category: "mens_doubles" };
  const noPartner = evaluateLeagueRegistration({
    tournament: doubles,
    userId: "user-a",
    partnerUserId: null,
    today: "2026-11-20",
  });
  assert.equal(noPartner.ok, false);

  const selfPartner = evaluateLeagueRegistration({
    tournament: doubles,
    userId: "user-a",
    partnerUserId: "user-a",
    today: "2026-11-20",
  });
  assert.equal(selfPartner.ok, false);
  assert.match(selfPartner.message, /diri sendiri/i);
});

test("not logged in: the route returns 401 before touching the database", () => {
  assert.match(routeSource, /if \(authError \|\| !user\)/);
  assert.match(routeSource, /status: 401/);
  assert.match(routeSource, /Harap masuk untuk mendaftar liga/);
});
