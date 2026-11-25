import {
  simulateCategory,
  SIMULATION_QUALIFIERS,
  SIMULATION_ROUNDS,
  SIMULATION_START_RATING,
} from "../src/lib/tournaments/simulation-core.mjs";

const players = simulateCategory(24);
const qualified = players.filter((player) => player.qualified);

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);

console.log("Simulasi Kualifikasi Single Man — 24 pemain (MPR)");
console.log(
  `Rating awal ${Math.round(SIMULATION_START_RATING)} untuk semua pemain · ${SIMULATION_ROUNDS} ronde Swiss · ${SIMULATION_QUALIFIERS} besar lolos`
);
console.log("");
console.log(
  `${pad("#", 3)}${pad("Pemain", 20)}${padStart("Main", 6)}${padStart("M-K", 7)}${padStart(
    "Awal",
    9
  )}${padStart("Akhir", 9)}${padStart("Δ", 9)}${padStart("ΔMenang", 10)}${padStart(
    "ΔKalah",
    9
  )}  Status`
);
console.log("-".repeat(112));

for (const player of players) {
  const status = player.qualified ? "LOLOS 8 BESAR" : "-";
  console.log(
    `${pad(player.rank, 3)}${pad(player.name, 20)}${padStart(player.matchesPlayed, 6)}${padStart(
      `${player.wins}-${player.losses}`,
      7
    )}${padStart(String(Math.round(player.startRating)), 9)}${padStart(
      String(Math.round(player.finalRating)),
      9
    )}${padStart(`${player.ratingChange >= 0 ? "+" : ""}${Math.round(player.ratingChange)}`, 9)}${padStart(
      `+${player.avgWinGain.toFixed(1)}`,
      10
    )}${padStart(player.avgLossDrop.toFixed(1), 9)}  ${status}`
  );
}

console.log("");
console.log(`Lolos 8 besar (${qualified.length} pemain):`);
for (const player of qualified) {
  console.log(
    `- #${player.rank} ${player.name} — rating ${Math.round(player.finalRating)} (${player.wins}-${player.losses})`
  );
}

const biggestWin = [...players]
  .flatMap((player) =>
    player.matches
      .filter((match) => match.result === "win")
      .map((match) => ({ player, match }))
  )
  .sort((a, b) => b.match.delta - a.match.delta)[0];

const biggestLoss = [...players]
  .flatMap((player) =>
    player.matches
      .filter((match) => match.result === "loss")
      .map((match) => ({ player, match }))
  )
  .sort((a, b) => a.match.delta - b.match.delta)[0];

console.log("");
console.log("Contoh perubahan rating dinamis:");
if (biggestWin) {
  console.log(
    `- Kenaikan terbesar: ${biggestWin.player.name} mengalahkan ${biggestWin.match.opponent} (rating lawan ${Math.round(
      biggestWin.match.opponentRatingBefore
    )}) → +${Math.round(biggestWin.match.delta)}`
  );
}
if (biggestLoss) {
  console.log(
    `- Pengurangan terbesar: ${biggestLoss.player.name} kalah dari ${biggestLoss.match.opponent} (rating lawan ${Math.round(
      biggestLoss.match.opponentRatingBefore
    )}) → ${Math.round(biggestLoss.match.delta)}`
  );
}

console.log("");
console.log("Catatan: data sintetis dan deterministik; tidak menyentuh data production.");