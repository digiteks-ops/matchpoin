import test from "node:test";
import assert from "node:assert/strict";
import {
  simulateCategory,
  SIMULATION_QUALIFIERS,
  SIMULATION_ROUNDS,
  SIMULATION_START_RATING,
} from "../../src/lib/tournaments/simulation-core.mjs";

const players = simulateCategory(24);

test("simulation uses 24 players starting at rating 1000", () => {
  assert.equal(players.length, 24);
  assert.equal(SIMULATION_START_RATING, 1000);
  for (const player of players) {
    assert.equal(player.startRating, 1000);
    assert.equal(player.matchesPlayed, SIMULATION_ROUNDS);
  }
});

test("every player meets a different opponent each round", () => {
  for (const player of players) {
    const opponents = new Set(player.matches.map((match) => match.opponent));
    const rounds = new Set(player.matches.map((match) => match.round));
    assert.equal(opponents.size, SIMULATION_ROUNDS);
    assert.equal(rounds.size, SIMULATION_ROUNDS);
    assert.ok(player.matches.every((match) => match.opponent !== player.name));
  }
});

test("the top 8 by rating qualify and the table is sorted by rating", () => {
  assert.equal(SIMULATION_QUALIFIERS, 8);
  assert.equal(players.filter((player) => player.qualified).length, 8);
  for (let index = 1; index < players.length; index += 1) {
    assert.ok(players[index - 1].finalRating >= players[index].finalRating);
  }
});

test("rating changes depend on opponent strength", () => {
  const wins = players.flatMap((player) =>
    player.matches
      .filter((match) => match.result === "win")
      .map((match) => ({ player, match }))
  );
  const losses = players.flatMap((player) =>
    player.matches
      .filter((match) => match.result === "loss")
      .map((match) => ({ player, match }))
  );

  assert.ok(wins.length > 0);
  assert.ok(wins.some(({ match }) => match.delta > 0));
  assert.ok(losses.length > 0);
  assert.ok(losses.some(({ match }) => match.delta < 0));
  assert.ok(wins.every(({ match }) => match.delta >= 0));
  assert.ok(losses.every(({ match }) => match.delta <= 0));

  const upsetWin = wins.find(({ match }) => match.opponentRatingBefore > match.ratingBefore);
  const expectedWin = wins.find(({ match }) => match.opponentRatingBefore < match.ratingBefore);
  const badLoss = losses.find(({ match }) => match.opponentRatingBefore < match.ratingBefore);

  assert.ok(upsetWin, "expected at least one win over a higher-rated opponent");
  assert.ok(expectedWin, "expected at least one win over a lower-rated opponent");
  assert.ok(badLoss, "expected at least one loss to a lower-rated opponent");

  assert.ok(upsetWin.match.expected < 0.5);
  assert.ok(expectedWin.match.expected > 0.5);
  assert.ok(badLoss.match.expected > 0.5);
});