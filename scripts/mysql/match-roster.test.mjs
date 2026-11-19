import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMatchRoster,
  logicalRosterSize,
  MatchRosterError,
} from "../../src/lib/mysql/match-roster-core.mjs";

const HOST = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const OPPONENT = "33333333-3333-4333-8333-333333333333";
const OPPONENT_PARTNER = "44444444-4444-4444-8444-444444444444";

function privateDoubles(overrides = {}) {
  return buildMatchRoster({
    category: "mens_doubles",
    matchType: "private",
    organizerId: HOST,
    partnerUserId: PARTNER,
    opponentUserId: OPPONENT,
    opponentPartnerUserId: OPPONENT_PARTNER,
    ...overrides,
  });
}

test("singles plays with 2 players and doubles with 4", () => {
  assert.equal(logicalRosterSize("mens_singles"), 2);
  assert.equal(logicalRosterSize("womens_singles"), 2);
  assert.equal(logicalRosterSize("mens_doubles"), 4);
  assert.equal(logicalRosterSize("womens_doubles"), 4);
  assert.equal(logicalRosterSize("mixed_doubles"), 4);
});

test("singles with an opponent creates exactly two distinct players", () => {
  const roster = buildMatchRoster({
    category: "mens_singles",
    organizerId: HOST,
    opponentUserId: OPPONENT,
  });

  assert.equal(roster.maxPlayers, 2);
  assert.equal(roster.currentPlayers, 2);
  assert.equal(roster.status, "full");
  assert.equal(roster.isPrivate, true);
  assert.deepEqual(
    roster.participants.map((participant) => [
      participant.userId,
      participant.team,
      participant.isOrganizer,
    ]),
    [
      [HOST, 1, true],
      [OPPONENT, 2, false],
    ]
  );
  assert.deepEqual(roster.playerIdsToVerify, [OPPONENT]);
});

test("singles without an opponent keeps one open slot for an invite", () => {
  const roster = buildMatchRoster({
    category: "womens_singles",
    organizerId: HOST,
  });

  assert.equal(roster.maxPlayers, 2);
  assert.equal(roster.currentPlayers, 1);
  assert.equal(roster.status, "open");
  assert.equal(roster.participants.length, 1);
  assert.deepEqual(roster.playerIdsToVerify, []);
});

test("singles rejects the host as their own opponent", () => {
  assert.throws(
    () =>
      buildMatchRoster({
        category: "mens_singles",
        organizerId: HOST,
        opponentUserId: HOST,
      }),
    MatchRosterError
  );
});

test("singles rejects doubles-only partner slots", () => {
  assert.throws(
    () =>
      buildMatchRoster({
        category: "mens_singles",
        organizerId: HOST,
        partnerUserId: PARTNER,
      }),
    /Partner hanya berlaku untuk pertandingan ganda/
  );
});

test("singles cannot be created as an open match", () => {
  assert.throws(
    () =>
      buildMatchRoster({
        category: "mens_singles",
        matchType: "open",
        organizerId: HOST,
      }),
    /Tipe pertandingan tidak valid/
  );
});

test("private doubles creates exactly four unique players", () => {
  const roster = privateDoubles();

  assert.equal(roster.maxPlayers, 4);
  assert.equal(roster.currentPlayers, 4);
  assert.equal(roster.status, "full");
  assert.equal(roster.isPrivate, true);
  assert.deepEqual(
    roster.participants.map((participant) => participant.team),
    [1, 1, 2, 2]
  );
  assert.equal(
    new Set(roster.participants.map((participant) => participant.userId)).size,
    4
  );
  assert.deepEqual(
    roster.playerIdsToVerify.sort(),
    [PARTNER, OPPONENT, OPPONENT_PARTNER].sort()
  );
});

test("private doubles requires the full roster", () => {
  assert.throws(
    () => privateDoubles({ partnerUserId: null }),
    /wajib memilih partner dan 2 pemain lawan/
  );
  assert.throws(
    () => privateDoubles({ opponentUserId: null }),
    /wajib memilih partner dan 2 pemain lawan/
  );
  assert.throws(
    () => privateDoubles({ opponentPartnerUserId: null }),
    /wajib memilih partner dan 2 pemain lawan/
  );
});

test("private doubles rejects duplicated players", () => {
  assert.throws(
    () => privateDoubles({ partnerUserId: OPPONENT }),
    /harus berbeda/
  );
  assert.throws(
    () => privateDoubles({ opponentPartnerUserId: PARTNER }),
    /harus berbeda/
  );
  assert.throws(
    () => privateDoubles({ partnerUserId: HOST }),
    /harus berbeda/
  );
});

test("open doubles starts with the host and three open slots", () => {
  const roster = buildMatchRoster({
    category: "mixed_doubles",
    matchType: "open",
    organizerId: HOST,
  });

  assert.equal(roster.maxPlayers, 4);
  assert.equal(roster.currentPlayers, 1);
  assert.equal(roster.status, "open");
  assert.equal(roster.isPrivate, false);
  assert.deepEqual(roster.playerIdsToVerify, []);
});

test("open doubles rejects manual players instead of silently dropping them", () => {
  assert.throws(
    () =>
      buildMatchRoster({
        category: "mens_doubles",
        matchType: "open",
        organizerId: HOST,
        partnerUserId: PARTNER,
      }),
    /tidak dapat menentukan pemain manual/
  );
  assert.throws(
    () =>
      buildMatchRoster({
        category: "womens_doubles",
        matchType: "open",
        organizerId: HOST,
        opponentUserId: OPPONENT,
      }),
    /tidak dapat menentukan pemain manual/
  );
});

test("invalid category and match type are rejected", () => {
  assert.throws(
    () => buildMatchRoster({ category: "mixed_singles", organizerId: HOST }),
    /Kategori pertandingan tidak valid/
  );
  assert.throws(
    () =>
      buildMatchRoster({
        category: "mens_doubles",
        matchType: "public",
        organizerId: HOST,
      }),
    /Tipe pertandingan tidak valid/
  );
  assert.throws(
    () => buildMatchRoster({ category: "mens_singles", organizerId: "   " }),
    /Penyelenggara pertandingan tidak valid/
  );
});
