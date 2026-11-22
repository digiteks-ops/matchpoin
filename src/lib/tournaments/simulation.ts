export type SimulationLevel = "beginner" | "intermediate";

export interface SimulatedMatch {
  id: string;
  opponent: string;
  result: "win" | "loss";
  ratingBefore: number;
  ratingAfter: number;
  delta: number;
}

export interface SimulatedPlayer {
  id: string;
  name: string;
  level: SimulationLevel;
  startRating: number;
  finalRating: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  ratingChange: number;
  winRatingGain: number;
  lossRatingDrop: number;
  avgWinGain: number;
  avgLossDrop: number;
  bestWinGain: number;
  worstLossDrop: number;
  matches: SimulatedMatch[];
}

interface PlayerSeed {
  name: string;
  level: SimulationLevel;
  startRating: number;
  wins: number;
  losses: number;
}

const SINGLES_MEN_SEEDS_12: PlayerSeed[] = [
  { name: "Andi Pratama", level: "beginner", startRating: 3.2, wins: 15, losses: 5 },
  { name: "Budi Santoso", level: "beginner", startRating: 3.1, wins: 13, losses: 5 },
  { name: "Cakra Wijaya", level: "beginner", startRating: 3.0, wins: 12, losses: 5 },
  { name: "Dedi Kurnia", level: "beginner", startRating: 2.9, wins: 10, losses: 9 },
  { name: "Eko Saputra", level: "beginner", startRating: 2.8, wins: 8, losses: 4 },
  { name: "Fajar Ramadhan", level: "beginner", startRating: 2.7, wins: 6, losses: 3 },
  { name: "Gilang Permana", level: "intermediate", startRating: 4.5, wins: 17, losses: 5 },
  { name: "Hadi Susanto", level: "intermediate", startRating: 4.4, wins: 14, losses: 5 },
  { name: "Irfan Maulana", level: "intermediate", startRating: 4.3, wins: 13, losses: 5 },
  { name: "Joko Prasetyo", level: "intermediate", startRating: 4.2, wins: 11, losses: 6 },
  { name: "Kiki Ardiansyah", level: "intermediate", startRating: 4.1, wins: 9, losses: 6 },
  { name: "Lukman Hakim", level: "intermediate", startRating: 4.0, wins: 5, losses: 3 },
];

const SINGLES_MEN_SEEDS_24: PlayerSeed[] = [
  ...SINGLES_MEN_SEEDS_12,
  { name: "Maman Sulaeman", level: "beginner", startRating: 3.15, wins: 14, losses: 6 },
  { name: "Nanda Putra", level: "beginner", startRating: 3.05, wins: 12, losses: 6 },
  { name: "Omar Fauzi", level: "beginner", startRating: 2.95, wins: 11, losses: 7 },
  { name: "Pandu Wibowo", level: "beginner", startRating: 2.85, wins: 9, losses: 5 },
  { name: "Qori Hidayat", level: "beginner", startRating: 2.75, wins: 7, losses: 4 },
  { name: "Rizky Aditya", level: "beginner", startRating: 2.65, wins: 6, losses: 4 },
  { name: "Surya Gunawan", level: "intermediate", startRating: 4.45, wins: 16, losses: 6 },
  { name: "Teguh Prakoso", level: "intermediate", startRating: 4.35, wins: 15, losses: 6 },
  { name: "Umar Faruq", level: "intermediate", startRating: 4.25, wins: 12, losses: 7 },
  { name: "Vino Setiawan", level: "intermediate", startRating: 4.15, wins: 10, losses: 7 },
  { name: "Wahyu Nugroho", level: "intermediate", startRating: 4.05, wins: 8, losses: 5 },
  { name: "Yoga Pratama", level: "intermediate", startRating: 3.95, wins: 6, losses: 4 },
];

function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function simulateSeeds(seeds: PlayerSeed[]): SimulatedPlayer[] {
  const names = seeds.map((seed) => seed.name);

  return seeds.map((seed, playerIndex) => {
    const random = makeRandom(1000 + playerIndex * 97);
    const outcomes = shuffle(
      [
        ...Array.from({ length: seed.wins }, () => "win" as const),
        ...Array.from({ length: seed.losses }, () => "loss" as const),
      ],
      random
    );

    let rating = seed.startRating;
    const matches: SimulatedMatch[] = outcomes.map((result, matchIndex) => {
      const ratingBefore = rating;
      const delta =
        result === "win"
          ? round2(0.02 + random() * 0.04)
          : -round2(0.02 + random() * 0.03);
      const ratingAfter = round2(Math.max(1, ratingBefore + delta));
      rating = ratingAfter;

      const opponent =
        names[(playerIndex + matchIndex * 3 + 1) % names.length] === seed.name
          ? names[(playerIndex + matchIndex * 3 + 2) % names.length]
          : names[(playerIndex + matchIndex * 3 + 1) % names.length];

      return {
        id: `${playerIndex + 1}-${matchIndex + 1}`,
        opponent,
        result,
        ratingBefore: round2(ratingBefore),
        ratingAfter,
        delta: round2(ratingAfter - ratingBefore),
      };
    });

    const winDeltas = matches.filter((match) => match.result === "win").map((match) => match.delta);
    const lossDeltas = matches
      .filter((match) => match.result === "loss")
      .map((match) => match.delta);
    const winRatingGain = round2(winDeltas.reduce((total, delta) => total + delta, 0));
    const lossRatingDrop = round2(lossDeltas.reduce((total, delta) => total + delta, 0));

    return {
      id: `sim-${playerIndex + 1}`,
      name: seed.name,
      level: seed.level,
      startRating: round2(seed.startRating),
      finalRating: round2(rating),
      wins: seed.wins,
      losses: seed.losses,
      matchesPlayed: outcomes.length,
      ratingChange: round2(rating - seed.startRating),
      winRatingGain,
      lossRatingDrop,
      avgWinGain: winDeltas.length ? round3(winRatingGain / winDeltas.length) : 0,
      avgLossDrop: lossDeltas.length ? round3(lossRatingDrop / lossDeltas.length) : 0,
      bestWinGain: winDeltas.length ? round2(Math.max(...winDeltas)) : 0,
      worstLossDrop: lossDeltas.length ? round2(Math.min(...lossDeltas)) : 0,
      matches,
    };
  });
}

export function simulateSinglesMen(): SimulatedPlayer[] {
  return simulateSeeds(SINGLES_MEN_SEEDS_12);
}

export function simulateSinglesMen24(): SimulatedPlayer[] {
  return simulateSeeds(SINGLES_MEN_SEEDS_24);
}