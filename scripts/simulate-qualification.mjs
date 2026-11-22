// Simulasi kualifikasi Main Event — Single Putra (Liga Tennis IKA17).
// Data sintetis deterministik. Tidak menulis apa pun ke database.
// Jalankan: node scripts/simulate-qualification.mjs

const MIN_MATCHES = 17;
const QUOTA_PER_LEVEL = 2;

const players = [
  // Beginner
  { name: "Andi Pratama", level: "beginner", matches: 20, wins: 15, losses: 5, points: 45, rating: 3.6 },
  { name: "Budi Santoso", level: "beginner", matches: 18, wins: 13, losses: 5, points: 40, rating: 3.4 },
  { name: "Cakra Wijaya", level: "beginner", matches: 17, wins: 12, losses: 5, points: 36, rating: 3.2 },
  { name: "Dedi Kurnia", level: "beginner", matches: 19, wins: 10, losses: 9, points: 30, rating: 3.0 },
  { name: "Eko Saputra", level: "beginner", matches: 12, wins: 8, losses: 4, points: 24, rating: 2.9 },
  { name: "Fajar Ramadhan", level: "beginner", matches: 9, wins: 6, losses: 3, points: 18, rating: 2.7 },
  // Intermediate
  { name: "Gilang Permana", level: "intermediate", matches: 22, wins: 17, losses: 5, points: 51, rating: 4.9 },
  { name: "Hadi Susanto", level: "intermediate", matches: 19, wins: 14, losses: 5, points: 42, rating: 4.6 },
  { name: "Irfan Maulana", level: "intermediate", matches: 18, wins: 13, losses: 5, points: 39, rating: 4.4 },
  { name: "Joko Prasetyo", level: "intermediate", matches: 17, wins: 11, losses: 6, points: 33, rating: 4.1 },
  { name: "Kiki Ardiansyah", level: "intermediate", matches: 15, wins: 9, losses: 6, points: 27, rating: 4.0 },
  { name: "Lukman Hakim", level: "intermediate", matches: 8, wins: 5, losses: 3, points: 15, rating: 3.8 },
];

const gameDiff = (p) => p.wins - p.losses;
const compare = (a, b) =>
  b.points - a.points ||
  b.wins - a.wins ||
  gameDiff(b) - gameDiff(a) ||
  b.rating - a.rating ||
  a.name.localeCompare(b.name);

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);

function printGroup(level) {
  const label = level === "beginner" ? "BEGINNER" : "INTERMEDIATE";
  const ranked = players.filter((p) => p.level === level).sort(compare);

  console.log(`\n${label}`);
  console.log(`${pad("#", 3)}${pad("Pemain", 20)}${padStart("Main", 6)}${padStart("W", 4)}${padStart("L", 4)}${padStart("Poin", 6)}${padStart("Rating", 8)}  Status`);
  console.log("-".repeat(82));

  ranked.forEach((p, index) => {
    const rank = index + 1;
    const remaining = Math.max(0, MIN_MATCHES - p.matches);
    let status;
    if (rank <= QUOTA_PER_LEVEL && p.matches >= MIN_MATCHES) {
      status = `Juara ${rank} ${label === "BEGINNER" ? "Beginner" : "Intermediate"} — LOLOS`;
    } else if (rank <= QUOTA_PER_LEVEL) {
      status = `Kandidat Juara ${rank} — butuh ${remaining} match lagi`;
    } else if (p.matches < MIN_MATCHES) {
      status = `Belum lolos — butuh ${remaining} match lagi`;
    } else {
      status = "Belum lolos — peringkat di luar kuota";
    }
    console.log(
      `${pad(rank, 3)}${pad(p.name, 20)}${padStart(p.matches, 6)}${padStart(p.wins, 4)}${padStart(
        p.losses,
        4
      )}${padStart(p.points, 6)}${padStart(p.rating.toFixed(2), 8)}  ${status}`
    );
  });

  const winners = ranked
    .filter((p) => p.matches >= MIN_MATCHES)
    .slice(0, QUOTA_PER_LEVEL);
  return winners.map((p, index) => ({ ...p, juara: index + 1 }));
}

console.log("SIMULASI KUALIFIKASI MAIN EVENT — SINGLE PUTRA");
console.log("Liga Tennis IKA17 · Musim 1 2027");
console.log(`Aturan: minimal ${MIN_MATCHES} pertandingan; Juara 1 & 2 Beginner dan Juara 1 & 2 Intermediate lolos.`);
console.log("Data ini SINTETIS untuk simulasi. Tidak ada data production yang diubah.");

const beginnerWinners = printGroup("beginner");
const intermediateWinners = printGroup("intermediate");

console.log("\nRINGKASAN LOLOS KE MAIN EVENT");
for (const winner of beginnerWinners) {
  console.log(`- Juara ${winner.juara} Beginner: ${winner.name} (${winner.matches} match, ${winner.points} poin)`);
}
for (const winner of intermediateWinners) {
  console.log(`- Juara ${winner.juara} Intermediate: ${winner.name} (${winner.matches} match, ${winner.points} poin)`);
}
console.log(`\nTotal lolos: ${beginnerWinners.length + intermediateWinners.length} pemain.`);
