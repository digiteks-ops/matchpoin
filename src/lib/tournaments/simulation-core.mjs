// Deterministic MPR simulation shared by the admin page and the CLI.
// Players are paired against each other in a Swiss-style league; every rating
// change uses the same MPR formula as production matches.

import {
  MPR_DEFAULT_RATING,
  calculateMprSingles,
  mprCategoryLabel,
  mprExpectedScore,
} from "../rating/mpr-core.mjs";

export const SIMULATION_START_RATING = MPR_DEFAULT_RATING;
export const SIMULATION_QUALIFIERS = 8;
export const SIMULATION_ROUNDS = 7;

const PLAYER_NAMES = [
  "Andi Pratama",
  "Budi Santoso",
  "Cakra Wijaya",
  "Dedi Kurnia",
  "Eko Saputra",
  "Fajar Ramadhan",
  "Gilang Permana",
  "Hadi Susanto",
  "Irfan Maulana",
  "Joko Prasetyo",
  "Kiki Ardiansyah",
  "Lukman Hakim",
  "Maman Sulaeman",
  "Nanda Putra",
  "Omar Fauzi",
  "Pandu Wibowo",
  "Qori Hidayat",
  "Rizky Aditya",
  "Surya Gunawan",
  "Teguh Prakoso",
  "Umar Faruq",
  "Vino Setiawan",
  "Wahyu Nugroho",
  "Yoga Pratama",
];

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function createPlayer(name, index) {
  return {
    id: `sim-${index + 1}`,
    name,
    startRating: SIMULATION_START_RATING,
    rating: SIMULATION_START_RATING,
    matchesPlayed: 0,
    wins: 0,
    losses: 0,
    matches: [],
  };
}

// Swiss/Monrad pairing: sort by rating, then find a perfect matching that
// avoids rematches.
function pairRound(players, played) {
  const order = [...players].sort(
    (a, b) =>
      b.rating - a.rating ||
      b.wins - a.wins ||
      a.name.localeCompare(b.name)
  );

  const failed = new Set();

  function matchRemaining(remaining, pairs) {
    if (remaining.length === 0) return pairs;
    const key = remaining.map((player) => player.id).join(",");
    if (failed.has(key)) return null;

    const first = remaining[0];
    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      if (played.has(pairKey(first.id, candidate.id))) continue;

      const next = remaining.slice(1);
      next.splice(index - 1, 1);
      const result = matchRemaining(next, [...pairs, [first, candidate]]);
      if (result) return result;
    }

    failed.add(key);
    return null;
  }

  const perfect = matchRemaining(order, []);
  if (perfect) return perfect;

  const used = new Set();
  const pairs = [];
  for (let index = 0; index < order.length; index += 1) {
    const first = order[index];
    if (used.has(first.id)) continue;
    const candidate = order
      .slice(index + 1)
      .find((player) => !used.has(player.id) && !played.has(pairKey(first.id, player.id)));
    if (!candidate) continue;
    used.add(first.id);
    used.add(candidate.id);
    pairs.push([first, candidate]);
  }
  return pairs;
}

function applyMatch(first, second, round, played) {
  played.add(pairKey(first.id, second.id));

  const expectedFirst = mprExpectedScore(first.rating, second.rating);
  const random = seededRandom(hashSeed(`${round}:${first.id}:${second.id}`));
  const firstWins = random() < expectedFirst;

  const calc = calculateMprSingles(
    { userId: first.id, rating: first.rating, matchesPlayed: first.matchesPlayed },
    { userId: second.id, rating: second.rating, matchesPlayed: second.matchesPlayed },
    firstWins ? "A" : "B"
  );

  const firstChange = calc.playerA;
  const secondChange = calc.playerB;

  first.rating = firstChange.newRating;
  second.rating = secondChange.newRating;
  first.matchesPlayed += 1;
  second.matchesPlayed += 1;

  if (firstWins) {
    first.wins += 1;
    second.losses += 1;
  } else {
    first.losses += 1;
    second.wins += 1;
  }

  first.matches.push({
    id: `${round}-${first.id}-${second.id}`,
    round,
    opponent: second.name,
    opponentRatingBefore: secondChange.oldRating,
    result: firstWins ? "win" : "loss",
    ratingBefore: firstChange.oldRating,
    ratingAfter: firstChange.newRating,
    delta: firstChange.delta,
    expected: firstChange.expected,
    kFactor: firstChange.kFactor,
  });

  second.matches.push({
    id: `${round}-${second.id}-${first.id}`,
    round,
    opponent: first.name,
    opponentRatingBefore: firstChange.oldRating,
    result: firstWins ? "loss" : "win",
    ratingBefore: secondChange.oldRating,
    ratingAfter: secondChange.newRating,
    delta: secondChange.delta,
    expected: secondChange.expected,
    kFactor: secondChange.kFactor,
  });
}

export function simulateCategory(playerCount = 24) {
  const count = Math.max(2, Math.min(PLAYER_NAMES.length, Math.round(playerCount)));
  const players = PLAYER_NAMES.slice(0, count).map((name, index) => createPlayer(name, index));
  const played = new Set();
  const rounds = Math.min(SIMULATION_ROUNDS, count - 1);

  for (let round = 1; round <= rounds; round += 1) {
    const pairs = pairRound(players, played);
    for (const [first, second] of pairs) {
      applyMatch(first, second, round, played);
    }
  }

  function headToHead(a, b) {
    const previous = a.matches.find((match) => match.opponent === b.name);
    if (!previous) return 0;
    return previous.result === "win" ? -1 : 1;
  }

  const ranked = [...players].sort(
    (a, b) =>
      b.rating - a.rating ||
      b.wins - a.wins ||
      headToHead(a, b) ||
      a.name.localeCompare(b.name)
  );

  return ranked.map((player, index) => {
    const matches = [...player.matches].sort(
      (a, b) => a.round - b.round || a.id.localeCompare(b.id)
    );
    const winDeltas = matches
      .filter((match) => match.result === "win")
      .map((match) => match.delta);
    const lossDeltas = matches
      .filter((match) => match.result === "loss")
      .map((match) => match.delta);

    const winRatingGain = winDeltas.reduce((total, delta) => total + delta, 0);
    const lossRatingDrop = lossDeltas.reduce((total, delta) => total + delta, 0);

    return {
      id: player.id,
      name: player.name,
      rank: index + 1,
      qualified: index < SIMULATION_QUALIFIERS,
      category: mprCategoryLabel(player.rating),
      startRating: SIMULATION_START_RATING,
      finalRating: player.rating,
      wins: player.wins,
      losses: player.losses,
      matchesPlayed: matches.length,
      ratingChange: player.rating - SIMULATION_START_RATING,
      winRatingGain,
      lossRatingDrop,
      avgWinGain: winDeltas.length ? round3(winRatingGain / winDeltas.length) : 0,
      avgLossDrop: lossDeltas.length ? round3(lossRatingDrop / lossDeltas.length) : 0,
      bestWinGain: winDeltas.length ? Math.max(...winDeltas) : 0,
      worstLossDrop: lossDeltas.length ? Math.min(...lossDeltas) : 0,
      matches,
    };
  });
}