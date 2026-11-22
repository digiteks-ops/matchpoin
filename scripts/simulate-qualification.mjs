// Simulasi kualifikasi Main Event — Single Putra (Liga Tennis IKA17).
// Peringkat berbasis rating (menang/kalah memengaruhi rating). Tidak menulis ke database.
// Versi UI ada di /admin/simulasi. Jalankan: node scripts/simulate-qualification.mjs

const MIN_MATCHES = 17;
const QUOTA_PER_LEVEL = 2;

const players = [
  { name: "Andi Pratama", level: "beginner", start: 3.2, wins: 15, losses: 5 },
  { name: "Budi Santoso", level: "beginner", start: 3.1, wins: 13, losses: 5 },
  { name: "Cakra Wijaya", level: "beginner", start: 3.0, wins: 12, losses: 5 },
  { name: "Dedi Kurnia", level: "beginner", start: 2.9, wins: 10, losses: 9 },
  { name: "Eko Saputra", level: "beginner", start: 2.8, wins: 8, losses: 4 },
  { name: "Fajar Ramadhan", level: "beginner", start: 2.7, wins: 6, losses: 3 },
  { name: "Gilang Permana", level: "intermediate", start: 4.5, wins: 17, losses: 5 },
  { name: "Hadi Susanto", level: "intermediate", start: 4.4, wins: 14, losses: 5 },
  { name: "Irfan Maulana", level: "intermediate", start: 4.3, wins: 13, losses: 5 },
  { name: "Joko Prasetyo", level: "intermediate", start: 4.2, wins: 11, losses: 6 },
  { name: "Kiki Ardiansyah", level: "intermediate", start: 4.1, wins: 9, losses: 6 },
  { name: "Lukman Hakim", level: "intermediate", start: 4.0, wins: 5, losses: 3 },
];

const round2 = (value) => Math.round(value * 100) / 100;
const finalRating = (player) =>
  round2(Math.max(1, player.start + player.wins * 0.04 - player.losses * 0.035));
const matches = (player) => player.wins + player.losses;

const rankedByLevel = (level) =>
  players
    .filter((player) => player.level === level)
    .map((player) => ({ ...player, rating: finalRating(player), played: matches(player) }))
    .sort(
      (a, b) =>
        b.rating - a.rating || b.wins - a.wins || b.played - a.played || a.name.localeCompare(b.name)
    );

const pad = (value, width) => String(value).padEnd(width);
const padStart = (value, width) => String(value).padStart(width);

function printGroup(level) {
  const label = level === "beginner" ? "BEGINNER" : "INTERMEDIATE";
  const ranked = rankedByLevel(level);
  console.log(`\n${label}`);
  console.log(
    `${pad("#", 3)}${pad("Pemain", 20)}${padStart("Main", 6)}${padStart("W", 4)}${padStart("L", 4)}${padStart("Awal", 7)}${padStart("Akhir", 7)}  Status`
  );
  console.log("-".repeat(88));

  ranked.forEach((player, index) => {
    const rank = index + 1;
    const remaining = Math.max(0, MIN_MATCHES - player.played);
    let status;
    if (rank <= QUOTA_PER_LEVEL && player.played >= MIN_MATCHES) {
      status = `Juara ${rank} ${label} — LOLOS`;
    } else if (rank <= QUOTA_PER_LEVEL) {
      status = `Kandidat Juara ${rank} — butuh ${remaining} match lagi`;
    } else if (player.played < MIN_MATCHES) {
      status = `Belum lolos — butuh ${remaining} match lagi`;
    } else {
      status = "Belum lolos — di luar kuota";
    }
    console.log(
      `${pad(rank, 3)}${pad(player.name, 20)}${padStart(player.played, 6)}${padStart(
        player.wins,
        4
      )}${padStart(player.losses, 4)}${padStart(player.start.toFixed(2), 7)}${padStart(
        player.rating.toFixed(2),
        7
      )}  ${status}`
    );
  });

  return ranked
    .filter((player) => player.played >= MIN_MATCHES)
    .slice(0, QUOTA_PER_LEVEL)
    .map((player, index) => ({ ...player, juara: index + 1 }));
}

console.log("SIMULASI KUALIFIKASI MAIN EVENT — SINGLE PUTRA");
console.log("Liga Tennis IKA17 · Musim 1 2027");
console.log(
  `Aturan: peringkat berdasarkan rating; menang/kalah memengaruhi rating; minimal ${MIN_MATCHES} pertandingan.`
);
console.log("Data SINTETIS. Versi UI: /admin/simulasi.");

const beginnerWinners = printGroup("beginner");
const intermediateWinners = printGroup("intermediate");

console.log("\nRINGKASAN LOLOS KE MAIN EVENT");
for (const winner of beginnerWinners) {
  console.log(
    `- Juara ${winner.juara} Beginner: ${winner.name} (rating ${winner.start.toFixed(2)} → ${winner.rating.toFixed(2)}, ${winner.played} match)`
  );
}
for (const winner of intermediateWinners) {
  console.log(
    `- Juara ${winner.juara} Intermediate: ${winner.name} (rating ${winner.start.toFixed(2)} → ${winner.rating.toFixed(2)}, ${winner.played} match)`
  );
}
console.log(`\nTotal lolos: ${beginnerWinners.length + intermediateWinners.length} pemain.`);