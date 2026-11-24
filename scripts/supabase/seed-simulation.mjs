/**
 * Seed simulasi: riwayat bermain pemain yang SUDAH ADA.
 *
 * Tujuan: direktori pemain, leaderboard, dan halaman riwayat langsung berisi
 * data nyata (bukan kosong) sehingga fitur bisa dicoba sebelum liga berjalan.
 *
 * Yang dibuat untuk tiap pemain:
 *   - `matches` berstatus completed (tanggal tersebar ke belakang)
 *   - `match_participants` terkonfirmasi untuk kedua sisi
 *   - `match_results` berstatus confirmed
 *   - `rating_history` berisi perubahan rating per match
 *   - `player_ratings` disesuaikan (current_rating, W/L, matches_played)
 *
 * Rating awal diambil dari rating pemain saat ini bila sudah pernah bermain,
 * atau 1000/1500 sesuai self_assessed_level. Perubahan rating memakai rumus
 * DTR yang sama dengan produksi (calculateDtrSingles), jadi angkanya konsisten.
 *
 * Jalankan:
 *   node --env-file=.env.local scripts/supabase/seed-simulation.mjs
 *   node --env-file=.env.local scripts/supabase/seed-simulation.mjs --dry-run
 *   node --env-file=.env.local scripts/supabase/seed-simulation.mjs --reset
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Node 20 tidak punya WebSocket bawaan; Supabase Realtime butuh global ini
// hanya untuk inisialisasi (script ini tidak memakai realtime).
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;
import { randomUUID } from "node:crypto";
import { calculateDtrSingles, dtrStartingRating } from "../../src/lib/rating/dtr-core.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const RESET = args.has("--reset");
/** Penanda agar data simulasi bisa dikenali dan dihapus tanpa menyentuh data asli. */
const SIM_TAG = "simulation";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  // Node 20 tidak punya WebSocket bawaan; script ini tidak memakai realtime.
  realtime: { enabled: false },
});

/** Jumlah pertandingan acak: 4 sampai 8 (sesuai permintaan). */
function randomMatchCount() {
  return 4 + Math.floor(Math.random() * 5);
}

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function dateOnlyDaysAgo(days) {
  return isoDaysAgo(days).slice(0, 10);
}

async function fetchPlayers() {
  // Hanya pemain yang profilnya publik dan lengkap; admin dikecualikan oleh view.
  const { data, error } = await supabase
    .from("public_players")
    .select("user_id, display_name, self_assessed_level, current_rating, matches_played, city_id")
    .limit(200);
  if (error) throw new Error(`Gagal memuat pemain: ${error.message}`);
  return data ?? [];
}

async function resetSimulation() {
  const { data: simMatches, error } = await supabase
    .from("matches")
    .select("id")
    .eq("metadata->>seed", SIM_TAG);
  if (error) throw new Error(`Gagal membaca data simulasi: ${error.message}`);
  const ids = (simMatches ?? []).map((row) => row.id);
  if (ids.length === 0) {
    console.log("Tidak ada data simulasi untuk dihapus.");
    return;
  }

  // Hapus anak dulu, lalu match-nya.
  for (const table of ["rating_history", "match_results", "match_participants"]) {
    const { error: childError } = await supabase.from(table).delete().in("match_id", ids);
    if (childError) console.warn(`  peringatan ${table}: ${childError.message}`);
  }
  const { error: matchError } = await supabase.from("matches").delete().in("id", ids);
  if (matchError) throw new Error(`Gagal menghapus match simulasi: ${matchError.message}`);
  console.log(`Dihapus ${ids.length} pertandingan simulasi.`);
}

async function main() {
  if (RESET) {
    await resetSimulation();
    return;
  }

  const players = await fetchPlayers();
  if (players.length < 2) {
    console.error("Butuh minimal 2 pemain publik untuk membuat simulasi.");
    process.exit(1);
  }

  console.log(`${players.length} pemain ditemukan.`);

  // Rating berjalan per pemain, dimulai dari rating sebenarnya.
  const state = new Map(
    players.map((player) => [
      player.user_id,
      {
        name: player.display_name ?? "Pemain",
        rating: Number(player.current_rating) || dtrStartingRating(player.self_assessed_level),
        played: Number(player.matches_played) || 0,
        startPlayed: Number(player.matches_played) || 0,
        wins: 0,
        losses: 0,
      },
    ])
  );

  // Setiap pemain main 4-8 kali. Pasangan dipilih acak; satu match melayani
  // dua pemain sekaligus sehingga jumlahnya seimbang.
  const goals = new Map(
    players.map((player) => [player.user_id, randomMatchCount()])
  );
  const queue = players.map((player) => player.user_id);

  const createdMatches = [];
  let guard = 0;
  while (queue.length > 1 && guard < 5000) {
    guard += 1;
    const a = queue.shift();
    const candidates = queue.filter((id) => id !== a);
    if (candidates.length === 0) break;
    const b = candidates[Math.floor(Math.random() * candidates.length)];
    queue.splice(queue.indexOf(b), 1);

    const aState = state.get(a);
    const bState = state.get(b);
    const daysAgo = 1 + Math.floor(Math.random() * 60);

    // Pertandingan historis: rating dihitung dari posisi sebelum match ini.
    const outcome = Math.random() < 0.5 ? "A" : "B";
    const change = calculateDtrSingles(
      { rating: aState.rating },
      { rating: bState.rating },
      outcome
    );

    const aNew = change.playerA.newRating;
    const bNew = change.playerB.newRating;

    if (!DRY_RUN) {
      const matchId = randomUUID();
      const { error: matchError } = await supabase.from("matches").insert({
        id: matchId,
        title: `Simulasi: ${aState.name} vs ${bState.name}`,
        description: "Pertandingan simulasi untuk pengujian riwayat rating.",
        organizer_id: a,
        match_date: dateOnlyDaysAgo(daysAgo),
        start_time: "09:00:00",
        duration_minutes: 90,
        max_players: 2,
        current_players: 2,
        status: "completed",
        is_private: true,
        is_league_challenge: false,
        level: "all",
        result_submitted_at: isoDaysAgo(daysAgo),
        result_confirmed_at: isoDaysAgo(daysAgo),
        metadata: {
          category: "mens_singles",
          match_type: "private",
          seed: SIM_TAG,
          umpire_option: "tanpa_wasit",
        },
      });
      if (matchError) throw new Error(`Gagal membuat match: ${matchError.message}`);

      const participants = [
        { user_id: a, team: 1, is_organizer: true },
        { user_id: b, team: 2, is_organizer: false },
      ].map((row) => ({
        match_id: matchId,
        user_id: row.user_id,
        is_organizer: row.is_organizer,
        team: row.team,
        metadata: { status: "confirmed" },
        confirmed_at: isoDaysAgo(daysAgo),
      }));
      const { error: partError } = await supabase
        .from("match_participants")
        .insert(participants);
      if (partError) throw new Error(`Gagal menyimpan peserta: ${partError.message}`);

      const { error: resultError } = await supabase.from("match_results").insert({
        match_id: matchId,
        team1_score: outcome === "A" ? 8 : 3,
        team2_score: outcome === "B" ? 8 : 3,
        winner_team: outcome === "A" ? 1 : 2,
        status: "confirmed",
        submitted_by: a,
        confirmed_at: isoDaysAgo(daysAgo),
      });
      if (resultError) throw new Error(`Gagal menyimpan hasil: ${resultError.message}`);

      const history = [
        {
          user_id: a,
          match_id: matchId,
          old_rating: aState.rating,
          new_rating: aNew,
          match_result: outcome === "A" ? "win" : "loss",
          opponent_id: b,
          opponent_rating: bState.rating,
          change_reason: "Simulasi pertandingan",
          metadata: { seed: SIM_TAG },
          created_at: isoDaysAgo(daysAgo),
        },
        {
          user_id: b,
          match_id: matchId,
          old_rating: bState.rating,
          new_rating: bNew,
          match_result: outcome === "B" ? "win" : "loss",
          opponent_id: a,
          opponent_rating: aState.rating,
          change_reason: "Simulasi pertandingan",
          metadata: { seed: SIM_TAG },
          created_at: isoDaysAgo(daysAgo),
        },
      ];
      const { error: historyError } = await supabase
        .from("rating_history")
        .insert(history);
      if (historyError) throw new Error(`Gagal menyimpan riwayat: ${historyError.message}`);

      createdMatches.push(matchId);
    }

    // Perbarui state berjalan.
    aState.rating = aNew;
    bState.rating = bNew;
    aState.played += 1;
    bState.played += 1;
    if (outcome === "A") {
      aState.wins += 1;
      bState.losses += 1;
    } else {
      bState.wins += 1;
      aState.losses += 1;
    }

    // Kembalikan ke antrean bila belum mencapai target.
    if (aState.played < (goals.get(a) ?? 0) + (Number(players.find((p) => p.user_id === a)?.matches_played) || 0)) {
      queue.push(a);
    }
    if (bState.played < (goals.get(b) ?? 0) + (Number(players.find((p) => p.user_id === b)?.matches_played) || 0)) {
      queue.push(b);
    }
  }

  // Tulis rating akhir tiap pemain.
  if (!DRY_RUN) {
    for (const [userId, value] of state) {
      const { error } = await supabase
        .from("player_ratings")
        .update({
          current_rating: value.rating,
          peak_rating: value.rating,
          matches_played: value.played,
          wins: value.wins,
          losses: value.losses,
          last_match_at: isoDaysAgo(0),
        })
        .eq("user_id", userId);
      if (error) console.warn(`  rating ${userId}: ${error.message}`);
    }
  }

  const simulated = [...state.values()].reduce(
    (total, value) => total + (value.played - (Number(value.startPlayed) || 0)),
    0
  );
  console.log(
    `${DRY_RUN ? "[dry-run] " : ""}${DRY_RUN ? Math.round(simulated / 2) : createdMatches.length} pertandingan dibuat untuk ${state.size} pemain.`
  );
  console.log("Jalankan dengan --reset untuk menghapus data simulasi.");
}

main().catch((error) => {
  console.error("Gagal:", error.message);
  process.exit(1);
});