import assert from "node:assert/strict";
import test from "node:test";

import { buildCommunityRankings } from "../../src/lib/community/community-ranking-core.mjs";

const communities = [
  { id: "c1", name: "Alpha", city: "Makassar" },
  { id: "c2", name: "Beta", city: "Gowa" },
  { id: "c3", name: "Empty", city: null },
];

const members = [
  { community_id: "c1", user_id: "u1" },
  { community_id: "c1", user_id: "u2" },
  { community_id: "c2", user_id: "u3" },
  { community_id: "c2", user_id: "u4" },
];

const players = [
  { user_id: "u1", current_rating: 1600, wins: 5 },
  { user_id: "u2", current_rating: 1400, wins: 3 },
  { user_id: "u3", current_rating: 1700, wins: 2 },
  { user_id: "u4", current_rating: 1200, wins: 1 },
];

test("ranks communities by average member rating", () => {
  const rankings = buildCommunityRankings(communities, members, players);
  assert.deepEqual(
    rankings.map((entry) => entry.id),
    ["c1", "c2"]
  );
  assert.equal(rankings[0].averageRating, 1500);
  assert.equal(rankings[1].averageRating, 1450);
});

test("sorts by average rating before total wins", () => {
  const rankings = buildCommunityRankings(
    [{ id: "a", name: "A" }, { id: "b", name: "B" }],
    [
      { community_id: "a", user_id: "ua" },
      { community_id: "b", user_id: "ub" },
    ],
    [
      { user_id: "ua", current_rating: 1200, wins: 20 },
      { user_id: "ub", current_rating: 1300, wins: 1 },
    ]
  );
  assert.deepEqual(rankings.map((entry) => entry.id), ["b", "a"]);
});

test("counts members, wins, and skips empty communities", () => {
  const rankings = buildCommunityRankings(communities, members, players);
  const alpha = rankings.find((entry) => entry.id === "c1");
  assert.equal(alpha.memberCount, 2);
  assert.equal(alpha.totalWins, 8);
  assert.equal(rankings.some((entry) => entry.id === "c3"), false);
});

test("members without a rating still count toward member total", () => {
  const rankings = buildCommunityRankings(
    [{ id: "c1", name: "Alpha" }],
    [
      { community_id: "c1", user_id: "u1" },
      { community_id: "c1", user_id: "u2" },
    ],
    [{ user_id: "u1", current_rating: 1000, wins: 1 }]
  );
  assert.equal(rankings[0].memberCount, 2);
  assert.equal(rankings[0].averageRating, 1000);
});