import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateLeagueRegistration,
  isValidId,
  parseRegistrationPayload,
} from "../../src/lib/mysql/competition-registration-core.mjs";

const USER = "11111111-1111-4111-8111-111111111111";
const PARTNER = "22222222-2222-4222-8222-222222222222";
const TODAY = "2026-11-19";

const singlesLeague = {
  name: "LIGA TENNIS IKA 17",
  category: "mens_singles",
  status: "registration_open",
  max_participants: 24,
  registration_deadline: "2026-12-31",
};
const doublesLeague = { ...singlesLeague, category: "mens_doubles" };
const mixedLeague = { ...singlesLeague, category: "mixed_doubles" };

function evaluate(overrides = {}) {
  return evaluateLeagueRegistration({
    tournament: singlesLeague,
    userId: USER,
    partnerUserId: null,
    registeredUserIds: [],
    entryCount: 0,
    today: TODAY,
    ...overrides,
  });
}

test("accepts the seeded slug league identifiers", () => {
  const parsed = parseRegistrationPayload({
    tournamentId: "ika17-mens-singles",
    eligibilityConfirmed: true,
    whatsappNumber: "08123456789",
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.leagueId, "ika17-mens-singles");
  assert.equal(parsed.partnerUserId, null);
});

test("accepts UUID league identifiers and trims input", () => {
  const parsed = parseRegistrationPayload({
    tournamentId: "  ika17-mixed-doubles  ",
    partnerUserId: `  ${PARTNER}  `,
    eligibilityConfirmed: true,
    whatsappNumber: "08123456789",
  });

  assert.equal(parsed.ok, true);
  assert.equal(parsed.leagueId, "ika17-mixed-doubles");
  assert.equal(parsed.partnerUserId, PARTNER);

  const uuid = parseRegistrationPayload({
    tournamentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    eligibilityConfirmed: true,
    whatsappNumber: "08123456789",
  });
  assert.equal(uuid.ok, true);
});

test("rejects a missing league id without silently dropping validation", () => {
  assert.deepEqual(parseRegistrationPayload({}), {
    ok: false,
    message: "ID Liga wajib diisi.",
  });
  assert.deepEqual(parseRegistrationPayload({ tournamentId: "   " }), {
    ok: false,
    message: "ID Liga wajib diisi.",
  });
  assert.deepEqual(parseRegistrationPayload({ tournamentId: 42 }), {
    ok: false,
    message: "ID Liga wajib diisi.",
  });
});

test("rejects league ids that cannot be stored in CHAR(36)", () => {
  assert.equal(isValidId("ika17-mens-singles"), true);
  assert.equal(isValidId("x".repeat(36)), true);
  assert.equal(isValidId("x".repeat(37)), false);
  assert.equal(isValidId("ika17 mens singles"), false);
  assert.equal(isValidId("ika17/mens"), false);
  assert.equal(isValidId(""), false);

  assert.deepEqual(parseRegistrationPayload({ tournamentId: "x".repeat(37) }), {
    ok: false,
    message: "ID Liga tidak valid.",
  });
});

test("rejects malformed payloads and partners", () => {
  assert.deepEqual(parseRegistrationPayload(null), {
    ok: false,
    message: "Data tidak valid.",
  });
  assert.deepEqual(parseRegistrationPayload([]), {
    ok: false,
    message: "Data tidak valid.",
  });
  assert.deepEqual(
    parseRegistrationPayload({ tournamentId: "ika17-mens-doubles", partnerUserId: 7 }),
    { ok: false, message: "Partner tidak valid." }
  );
  assert.deepEqual(
    parseRegistrationPayload({
      tournamentId: "ika17-mens-doubles",
      partnerUserId: "not a valid partner",
    }),
    { ok: false, message: "Partner tidak valid." }
  );
});

test("valid singles registration passes every business rule", () => {
  const result = evaluate();

  assert.deepEqual(result, { ok: true, category: "mens_singles", doubles: false });
});

test("valid doubles registration with a partner passes", () => {
  const result = evaluate({
    tournament: doublesLeague,
    partnerUserId: PARTNER,
    partnerExists: true,
  });

  assert.deepEqual(result, { ok: true, category: "mens_doubles", doubles: true });
});

test("unknown league is rejected by existence verification", () => {
  const result = evaluate({ tournament: null });

  assert.deepEqual(result, { ok: false, message: "Liga tidak ditemukan." });
});

test("duplicate player registration is rejected", () => {
  const result = evaluate({ registeredUserIds: [USER] });

  assert.deepEqual(result, {
    ok: false,
    message: "Anda sudah terdaftar pada kategori ini.",
  });
});

test("duplicate partner registration is rejected", () => {
  const result = evaluate({
    tournament: doublesLeague,
    partnerUserId: PARTNER,
    registeredUserIds: [PARTNER],
  });

  assert.deepEqual(result, {
    ok: false,
    message: "Partner yang dipilih sudah terdaftar di kategori ini.",
  });
});

test("registration is no longer capped by a quota", () => {
  // Batas 24 peserta sudah dihapus: pendaftaran hanya ditutup oleh periode dan
  // status liga, bukan oleh jumlah pendaftar.
  const result = evaluate({ entryCount: 24 });

  assert.equal(result.ok, true);
  assert.equal(result.category, "mens_singles");
  assert.equal(result.doubles, false);
});

test("closed registration status and deadline are rejected", () => {
  assert.deepEqual(
    evaluate({ tournament: { ...singlesLeague, status: "registration_closed" } }),
    { ok: false, message: "Pendaftaran untuk kategori ini sudah ditutup." }
  );
  assert.deepEqual(
    evaluate({ tournament: { ...singlesLeague, registration_deadline: "2026-11-01" } }),
    { ok: false, message: "Pendaftaran untuk kategori ini sudah ditutup." }
  );
});

test("doubles requires a partner and singles forbids one", () => {
  assert.deepEqual(evaluate({ tournament: doublesLeague }), {
    ok: false,
    message: "Kategori ganda wajib memilih partner.",
  });
  assert.deepEqual(evaluate({ partnerUserId: PARTNER }), {
    ok: false,
    message: "Kategori tunggal tidak dapat memilih partner.",
  });
});

test("a player cannot partner with themselves", () => {
  const result = evaluate({
    tournament: doublesLeague,
    partnerUserId: USER,
  });

  assert.deepEqual(result, {
    ok: false,
    message: "Partner tidak boleh sama dengan diri sendiri.",
  });
});

test("missing partner row and mixed doubles gender rule are enforced", () => {
  assert.deepEqual(
    evaluate({
      tournament: doublesLeague,
      partnerUserId: PARTNER,
      partnerExists: false,
    }),
    { ok: false, message: "Partner tidak ditemukan." }
  );

  assert.deepEqual(
    evaluate({
      tournament: mixedLeague,
      partnerUserId: PARTNER,
      userGender: "male",
      partnerGender: "male",
    }),
    {
      ok: false,
      message: "Ganda Campuran wajib terdiri dari 1 pemain putra dan 1 pemain putri.",
    }
  );

  assert.deepEqual(
    evaluate({
      tournament: mixedLeague,
      partnerUserId: PARTNER,
      userGender: "male",
      partnerGender: "female",
    }),
    { ok: true, category: "mixed_doubles", doubles: true }
  );
});

test("registration service verifies league existence and league flag in MySQL", async () => {
  const source = await readFile(
    new URL("../../src/lib/mysql/competition-service.ts", import.meta.url),
    "utf8"
  );

  assert.match(source, /FROM tournaments[\s\S]*?WHERE id = \? AND is_league = TRUE[\s\S]*?FOR UPDATE/);
});
