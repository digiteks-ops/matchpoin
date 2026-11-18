import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { connectToMySql } from "../../src/lib/mysql/db.mjs";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const ts = require("typescript");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalResolve = Module._resolveFilename;
const competitionStubPath = path.join(root, "scripts", "mysql", "__competition_stub__.js");
Module._cache[competitionStubPath] = {
  id: competitionStubPath,
  filename: competitionStubPath,
  loaded: true,
  exports: { recomputeLeagueStandings: async () => 0 },
};
const notificationStubPath = path.join(root, "scripts", "mysql", "__notification_stub__.js");
Module._cache[notificationStubPath] = {
  id: notificationStubPath,
  filename: notificationStubPath,
  loaded: true,
  exports: {
    notifyMatchChallenge: async () => {},
    notifyChallengeResponse: async () => {},
    notifyPlayerJoined: async () => {},
    notifyMatchCancelled: async () => {},
    notifyResultConfirmed: async () => {},
    notifyResultDisputed: async () => {},
    notifyTournamentRegistration: async () => {},
    notifySuperAdminsPendingRegistration: async () => {},
  },
};

Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === "@/lib/mysql/competition-service") return competitionStubPath;
  if (request === "@/lib/notifications/notification-service") return notificationStubPath;
  if (request.startsWith("@/")) {
    return originalResolve.call(
      this,
      path.join(root, "src", `${request.slice(2)}.ts`),
      parent,
      isMain,
      options
    );
  }
  return originalResolve.call(this, request, parent, isMain, options);
};
Module._extensions[".ts"] = (module, filename) => {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(compiled, filename);
};

const {
  submitMySqlMatchResult,
  confirmMySqlMatchResult,
  disputeMySqlMatchResult,
  syncMySqlMatchResultStatus,
  recordMySqlWalkover,
} = require(path.join(root, "src", "lib", "mysql", "result-service.ts"));
const { getMySqlPlayerStats } = require(
  path.join(root, "src", "lib", "mysql", "player-history-service.ts")
);
const {
  getMySqlTournamentList,
  getMySqlTournamentPartners,
  registerForCompetition,
} = require(path.join(root, "src", "lib", "mysql", "competition-service.ts"));
const {
  getMySqlProfile,
  updateMySqlProfile,
} = require(path.join(root, "src", "lib", "mysql", "profile-service.ts"));
const {
  getPublicPlayers,
  getPublicPlayer,
} = require(path.join(root, "src", "lib", "mysql", "public-player-service.ts"));
const { getMySqlInvitations } = require(path.join(root, "src", "lib", "mysql", "invite-service.ts"));
const { createMySqlMatch } = require(path.join(root, "src", "lib", "mysql", "match-create-service.ts"));
const { getMySqlMatchDetail } = require(path.join(root, "src", "lib", "mysql", "match-service.ts"));
const { mysqlPathForPrimaryRoute } = require(
  path.join(root, "src", "lib", "mysql", "primary-route-map.ts")
);
const {
  invitePlayerToMySqlMatch,
  respondToMySqlInvite,
} = require(path.join(root, "src", "lib", "mysql", "match-workflow-service.ts"));
const {
  consumePasswordResetToken,
  createPasswordResetToken,
  hashPasswordResetRateLimitSubject,
  hashPasswordResetToken,
  incrementPasswordResetRateLimit,
} = require(path.join(root, "src", "lib", "mysql", "password-reset-service.ts"));

const connection = await connectToMySql();
const users = Array.from({ length: 5 }, (_, index) => ({
  id: randomUUID(),
  email: `mysql-result-test-${randomUUID()}@example.test`,
  fullName: `Result Test ${index + 1}`,
}));
const matchIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const tournamentId = randomUUID();

async function insertMatch(matchId, organizerId, participants) {
  await connection.execute(
    `INSERT INTO matches
       (id, title, organizer_id, match_date, start_time, duration_minutes,
        max_players, current_players, status, metadata)
     VALUES (?, 'Result workflow test', ?, '2026-01-01', '10:00:00', 90, 2, 2, 'open', ?)`,
    [matchId, organizerId, JSON.stringify({ category: "mens_singles", race_to: 8 })]
  );
  for (const [userId, team, isOrganizer] of participants) {
    await connection.execute(
      `INSERT INTO match_participants
       (id, match_id, user_id, is_organizer, team, metadata)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [randomUUID(), matchId, userId, isOrganizer, team, JSON.stringify({ status: "confirmed" })]
    );
  }
}

try {
  assert.equal(mysqlPathForPrimaryRoute("/login"), "/mysql/auth/login");
  assert.equal(mysqlPathForPrimaryRoute("/matches/new"), "/mysql/matches/new");
  assert.equal(
    mysqlPathForPrimaryRoute("/matches/123e4567-e89b-12d3-a456-426614174000/result"),
    "/mysql/matches/123e4567-e89b-12d3-a456-426614174000/result"
  );
  assert.equal(mysqlPathForPrimaryRoute("/players/example-user"), "/mysql/players/example-user");
  assert.equal(mysqlPathForPrimaryRoute("/auth/callback"), null);
  await connection.beginTransaction();
  for (const user of users) {
    await connection.execute(
      "INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, 'test-only', ?)",
      [user.id, user.email, user.fullName]
    );
  }
  await connection.execute(
    `INSERT INTO tournaments
     (id, name, slug, category, season, start_date, end_date, registration_deadline,
      status, max_participants, is_league)
     VALUES (?, 'MySQL integration league', ?, 'mens_singles', 'Test season',
      '2026-01-01', '2026-12-31', '2026-12-01', 'registration_open', 12, TRUE)`,
    [tournamentId, `mysql-integration-${tournamentId}`]
  );
  for (const user of users.slice(1)) {
    await connection.execute(
      `INSERT INTO player_profiles (id, user_id, display_name)
       VALUES (?, ?, ?)`,
      [randomUUID(), user.id, user.fullName]
    );
  }
  const profileInput = {
    fullName: "Updated Result Test",
    phone: "5550100",
    gender: "male",
    cityId: null,
    bio: "A test profile for MySQL verification.",
    playingSince: "2020",
    preferredHand: "right",
    backhand: "two_handed",
    playFrequency: "weekly",
    selfAssessedLevel: "beginner",
    profileVisibility: "public",
    preferredCategories: ["mens_singles"],
    preferredTimes: ["weekends"],
  };
  await updateMySqlProfile(connection, users[0].id, profileInput);
  const profileData = await getMySqlProfile(connection, users[0].id);
  assert.equal(profileData.user.full_name, profileInput.fullName);
  assert.equal(profileData.profile.bio, profileInput.bio);
  assert.equal(profileData.profile.preferred_categories[0], "mens_singles");
  assert.equal(profileData.rating, null);
  await connection.execute(
    "UPDATE player_profiles SET show_rating = FALSE, is_verified_player = TRUE WHERE user_id = ?",
    [users[1].id]
  );
  const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const baseMatchInput = {
    title: "MySQL match UI integration",
    courtName: "Integration Court",
    province: "South Sulawesi",
    cityName: "Makassar",
    matchDate: futureDate,
    startTime: "23:00:00",
    durationMinutes: 90,
    umpireOption: "tanpa_wasit",
    minRating: 1,
    maxRating: 10,
  };
  await assert.rejects(
    createMySqlMatch(connection, users[4].id, {
      ...baseMatchInput,
      category: "mens_singles",
      matchType: "open",
    }),
    /Tipe pertandingan tidak valid/
  );
  const privateSinglesId = await createMySqlMatch(connection, users[4].id, {
    ...baseMatchInput,
    category: "mens_singles",
    matchType: "private",
  });
  assert.equal((await getMySqlMatchDetail(connection, privateSinglesId, users[4].id)).isPrivate, true);
  assert.equal(await getMySqlMatchDetail(connection, privateSinglesId, users[0].id), null);
  const openDoublesId = await createMySqlMatch(connection, users[4].id, {
    ...baseMatchInput,
    category: "mens_doubles",
    matchType: "open",
  });
  const inviteId = await invitePlayerToMySqlMatch(connection, openDoublesId, users[4].id, users[1].id);
  const invitations = await getMySqlInvitations(connection, users[1].id);
  assert.equal(invitations.some((invitation) => invitation.participantId === inviteId), true);
  await respondToMySqlInvite(connection, inviteId, users[1].id, "accept");
  const acceptedInviteMatch = await getMySqlMatchDetail(connection, openDoublesId, users[1].id);
  const acceptedInviteParticipant = acceptedInviteMatch.participants.find(
    (participant) => participant.userId === users[1].id
  );
  assert.equal(acceptedInviteParticipant.showRating, false);
  assert.equal(acceptedInviteParticipant.rating, 1);
  const privateDoublesId = await createMySqlMatch(connection, users[4].id, {
    ...baseMatchInput,
    category: "mixed_doubles",
    matchType: "private",
    partnerUserId: users[1].id,
    opponentUserId: users[2].id,
    opponentPartnerUserId: users[3].id,
  });
  const privateDoubles = await getMySqlMatchDetail(connection, privateDoublesId, users[1].id);
  assert.equal(privateDoubles.isPrivate, true);
  assert.equal(privateDoubles.participants.length, 4);
  const tournamentList = await getMySqlTournamentList(connection, users[0].id);
  const testTournaments = tournamentList.filter((t) => t.name === "MySQL integration league");
  assert.equal(testTournaments.length, 1);
  assert.equal(testTournaments[0].registration_count, 0);
  assert.equal(testTournaments[0].is_registered, false);
  const availablePartners = await getMySqlTournamentPartners(connection, tournamentId, users[0].id);
  // Filter to only test users (users[1] through users[4]) since DB may contain other public users
  const testUserIds = new Set(users.slice(1).map(u => u.id));
  const testPartners = availablePartners.filter(p => testUserIds.has(p.id));
  assert.ok(testPartners.length >= 3, `Expected at least 3 test partners, got ${testPartners.length}`);
  const registration = await registerForCompetition(
    connection,
    users[0].id,
    tournamentId,
    null
  );
  assert.equal(registration.success, true);
  const registeredList = await getMySqlTournamentList(connection, users[0].id);
  assert.equal(registeredList[0].registration_count, 1);
  assert.equal(registeredList[0].is_registered, true);
  const [hiddenRatingRows] = await connection.execute(
    "SELECT * FROM public_players WHERE user_id = ?",
    [users[1].id]
  );
  assert.equal(hiddenRatingRows.length, 1);
  assert.equal(hiddenRatingRows[0].current_rating, null);
  assert.equal(hiddenRatingRows[0].matches_played, null);
  assert.equal(Object.prototype.hasOwnProperty.call(hiddenRatingRows[0], "email"), false);
  await connection.execute(
    "UPDATE player_profiles SET is_profile_public = FALSE WHERE user_id = ?",
    [users[2].id]
  );
  const [privateProfileRows] = await connection.execute(
    "SELECT user_id FROM public_players WHERE user_id = ?",
    [users[2].id]
  );
  assert.equal(privateProfileRows.length, 0);
  const hiddenPublicPlayer = await getPublicPlayer(connection, users[1].id);
  assert.equal(hiddenPublicPlayer.currentRating, null);
  assert.equal(hiddenPublicPlayer.matchesPlayed, null);
  assert.equal(hiddenPublicPlayer.wins, null);
  assert.equal(hiddenPublicPlayer.losses, null);
  assert.equal(hiddenPublicPlayer.showRating, false);
  assert.equal(hiddenPublicPlayer.isVerifiedPlayer, true);
  assert.equal(Object.prototype.hasOwnProperty.call(hiddenPublicPlayer, "email"), true);
  assert.equal(hiddenPublicPlayer.email, null);
  const publicPlayers = await getPublicPlayers(connection, 100);
  assert.equal(publicPlayers.some((player) => player.userId === users[2].id), false);

  await insertMatch(matchIds[0], users[0].id, [
    [users[0].id, 1, true],
    [users[1].id, 2, false],
  ]);
  const submitted = await submitMySqlMatchResult(
    connection,
    users[0].id,
    matchIds[0],
    8,
    5,
    1,
    ["https://example.test/evidence.jpg"]
  );
  assert.equal(submitted.status, "pending");
  assert.equal(submitted.disputeDeadline !== null, true);

  const confirmed = await confirmMySqlMatchResult(connection, users[1].id, matchIds[0]);
  assert.equal(confirmed.success, true);
  assert.equal(confirmed.isDuplicate, false);
  assert.equal(confirmed.results.length, 2);
  const [ratings] = await connection.execute(
    "SELECT user_id, matches_played, wins, losses FROM player_ratings WHERE user_id IN (?, ?)",
    [users[0].id, users[1].id]
  );
  assert.equal(ratings.length, 2);
  assert.equal(ratings.every((rating) => rating.matches_played === 1), true);
  assert.equal(ratings.find((rating) => rating.user_id === users[0].id).wins, 1);
  assert.equal(ratings.find((rating) => rating.user_id === users[1].id).losses, 1);
  const duplicateConfirmation = await confirmMySqlMatchResult(connection, users[1].id, matchIds[0]);
  assert.equal(duplicateConfirmation.isDuplicate, true);
  const [history] = await connection.execute(
    "SELECT id FROM rating_history WHERE match_id = ?",
    [matchIds[0]]
  );
  assert.equal(history.length, 2);

  await insertMatch(matchIds[1], users[0].id, [
    [users[0].id, 1, true],
    [users[2].id, 2, false],
  ]);
  await submitMySqlMatchResult(
    connection,
    users[0].id,
    matchIds[1],
    8,
    6,
    1,
    ["https://example.test/evidence.jpg"]
  );
  const disputed = await disputeMySqlMatchResult(
    connection,
    users[2].id,
    matchIds[1],
    "The submitted score is incorrect."
  );
  assert.equal(disputed.status, "under_review");
  assert.equal(disputed.disputeReason, "The submitted score is incorrect.");

  await insertMatch(matchIds[2], users[0].id, [
    [users[0].id, 1, true],
    [users[1].id, 2, false],
  ]);
  await submitMySqlMatchResult(
    connection,
    users[0].id,
    matchIds[2],
    8,
    3,
    1,
    ["https://example.test/evidence.jpg"]
  );
  await connection.execute(
    `UPDATE match_results
     SET metadata = JSON_SET(metadata, '$.dispute_deadline', '2000-01-01T00:00:00.000Z')
     WHERE match_id = ?`,
    [matchIds[2]]
  );
  assert.equal(await syncMySqlMatchResultStatus(connection, matchIds[2]), true);
  const [autoConfirmed] = await connection.execute(
    "SELECT status, confirmed_at FROM match_results WHERE match_id = ?",
    [matchIds[2]]
  );
  assert.equal(autoConfirmed[0].status, "confirmed");
  assert.notEqual(autoConfirmed[0].confirmed_at, null);
  const [walkedRatings] = await connection.execute(
    "SELECT COUNT(*) AS count FROM rating_history WHERE match_id = ?",
    [matchIds[2]]
  );
  assert.equal(walkedRatings[0].count, 2);

  await insertMatch(matchIds[3], users[0].id, [
    [users[0].id, 1, true],
    [users[2].id, 2, false],
  ]);
  await assert.rejects(
    recordMySqlWalkover(connection, users[1].id, matchIds[3], 1),
    /Hanya peserta pertandingan/
  );
  const walkover = await recordMySqlWalkover(
    connection,
    users[0].id,
    matchIds[3],
    1,
    "Opponent did not attend."
  );
  assert.equal(walkover.success, true);
  const [walkoverRows] = await connection.execute(
    "SELECT status, is_walkover, walkover_by, walkover_reason FROM match_results WHERE match_id = ?",
    [matchIds[3]]
  );
  assert.equal(walkoverRows[0].status, "confirmed");
  assert.equal(walkoverRows[0].is_walkover, 1);
  assert.equal(walkoverRows[0].walkover_by, users[0].id);
  assert.equal(walkoverRows[0].walkover_reason, "Opponent did not attend.");
  const stats = await getMySqlPlayerStats(connection, users[0].id);
  assert.equal(stats.totalMatches, 3);
  assert.equal(stats.wins, 3);
  assert.equal(stats.singlesMatches, 4);
  assert.equal(stats.recentMatches.length, 4);
  assert.equal(stats.recentMatches.some((match) => match.resultStatus === "under_review"), true);

  if (!process.env.AUTH_SECRET) {
    process.env.AUTH_SECRET = "password-reset-integration-secret-32-bytes-minimum";
  }
  const resetToken = await createPasswordResetToken(connection, users[0].id);
  assert.match(resetToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(
    await incrementPasswordResetRateLimit(
      connection,
      hashPasswordResetRateLimitSubject("email", users[0].email)
    ),
    1
  );
  assert.equal(
    await incrementPasswordResetRateLimit(
      connection,
      hashPasswordResetRateLimitSubject("email", users[0].email)
    ),
    2
  );
  assert.equal(
    await incrementPasswordResetRateLimit(
      connection,
      hashPasswordResetRateLimitSubject("email", users[0].email)
    ),
    3
  );
  assert.equal(
    await incrementPasswordResetRateLimit(
      connection,
      hashPasswordResetRateLimitSubject("email", users[0].email)
    ),
    4
  );
  assert.equal(
    await consumePasswordResetToken(connection, resetToken, "test-reset-hash"),
    true
  );
  const [resetUsers] = await connection.execute(
    "SELECT password_hash, auth_version FROM users WHERE id = ?",
    [users[0].id]
  );
  assert.equal(resetUsers[0].password_hash, "test-reset-hash");
  assert.equal(Number(resetUsers[0].auth_version), 1);
  assert.equal(
    await consumePasswordResetToken(connection, resetToken, "replay-must-not-apply"),
    false
  );

  const expiredToken = await createPasswordResetToken(connection, users[0].id);
  await connection.execute(
    "UPDATE password_reset_tokens SET expires_at = DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE) WHERE token_hash = ?",
    [hashPasswordResetToken(expiredToken)]
  );
  assert.equal(
    await consumePasswordResetToken(connection, expiredToken, "expired-must-not-apply"),
    false
  );

  console.log("MySQL match creation, invitations, result, history, profile, tournament, public-player, and password-recovery checks passed; all test rows will be rolled back.");
} finally {
  await connection.rollback();
  await connection.end();
  Module._resolveFilename = originalResolve;
}
