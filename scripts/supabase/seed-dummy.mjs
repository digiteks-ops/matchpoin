/**
 * Seed DUMMY lengkap: pemain palsu + seluruh alur fitur, diinput seolah oleh
 * admin, sehingga semua halaman bisa diuji sebelum ada pemain asli.
 *
 * Yang dibuat:
 *   - auth.users + users + player_profiles + player_ratings untuk 25 pemain
 *     dummy (semua ditandai is_dummy = TRUE)
 *   - pertandingan selesai (4-8 per pemain) + peserta + hasil + rating_history
 *   - pendaftaran liga IKA17 (pending/accepted) untuk 4 kategori
 *   - satu pertandingan yang masih OPEN dengan 1 permohonan pending
 *     (untuk menguji tombol Terima/Tolak host)
 *   - notifikasi contoh
 *
 * Semua baris diberi penanda agar bisa dihapus sekaligus:
 *   users.is_dummy / player_profiles.is_dummy
 *   matches.metadata->>'seed' = 'dummy'
 *
 * Pemakaian:
 *   node --env-file=.env.local scripts/supabase/seed-dummy.mjs --dry-run
 *   node --env-file=.env.local scripts/supabase/seed-dummy.mjs
 *   node --env-file=.env.local scripts/supabase/seed-dummy.mjs --reset
 *
 * --reset menghapus SEMUA data dummy (termasuk akun auth-nya) dan tidak pernah
 * menyentuh pemain asli.
 */
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import { randomUUID } from "node:crypto";
import {
  calculateMprSingles,
  mprStartingRating,
} from "../../src/lib/rating/mpr-core.mjs";
import { IKA17_CATEGORIES } from "../../src/lib/tournaments/ika17-core.mjs";

// Node 20 tidak punya WebSocket bawaan (dipakai Supabase Realtime saat init).
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Butuh NEXT_PUBLIC_SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const RESET = args.has("--reset");
const SEED_TAG = "dummy";
/**
 * Semua akun dummy memakai domain email ini. Ini penanda utama yang SELALU ada
 * (tidak butuh migrasi), sehingga --reset tetap bekerja walau kolom is_dummy
 * belum ditambahkan.
 */
const DUMMY_EMAIL_DOMAIN = "@matchpoin.test";
const PASSWORD = "Matchpoin123!";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { enabled: false },
});

/** 25 pemain: nama, jenis kelamin, level, kota. */
const PLAYERS = [
  ["Andi Pratama", "male", "beginner", "Makassar"],
  ["Budi Santoso", "male", "beginner", "Makassar"],
  ["Cakra Wijaya", "male", "intermediate", "Makassar"],
  ["Dedi Kurnia", "male", "beginner", "Gowa"],
  ["Eko Saputra", "male", "intermediate", "Makassar"],
  ["Fajar Ramadhan", "male", "beginner", "Maros"],
  ["Gilang Permana", "male", "advanced", "Makassar"],
  ["Hadi Susanto", "male", "beginner", "Makassar"],
  ["Irfan Maulana", "male", "intermediate", "Gowa"],
  ["Joko Prasetyo", "male", "beginner", "Makassar"],
  ["Kiki Ardiansyah", "male", "beginner", "Maros"],
  ["Lukman Hakim", "male", "intermediate", "Makassar"],
  ["Maya Lestari", "female", "beginner", "Makassar"],
  ["Nanda Putri", "female", "intermediate", "Makassar"],
  ["Olivia Rahma", "female", "beginner", "Gowa"],
  ["Putri Anggraini", "female", "beginner", "Makassar"],
  ["Qori Amalia", "female", "intermediate", "Maros"],
  ["Rina Wulandari", "female", "beginner", "Makassar"],
  ["Sari Dewi", "female", "beginner", "Makassar"],
  ["Tari Handayani", "female", "intermediate", "Gowa"],
  ["Umar Abdullah", "male", "advanced", "Makassar"],
  ["Vino Bastian", "male", "beginner", "Makassar"],
  ["Wawan Setiawan", "male", "intermediate", "Maros"],
  ["Yusuf Hamzah", "male", "beginner", "Makassar"],
  ["Zaki Firmansyah", "male", "expert", "Makassar"],
];

function isoDaysAgo(days) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}
const dateOnly = (days) => isoDaysAgo(days).slice(0, 10);
const randomMatchCount = () => 4 + Math.floor(Math.random() * 5);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

/** Apakah kolom is_dummy sudah ada (migrasi 00039 dijalankan)? */
let hasDummyColumn = false;
async function detectDummyColumn() {
  const { error } = await supabase.from("users").select("is_dummy").limit(1);
  hasDummyColumn = !error;
  return hasDummyColumn;
}

async function cityIdByName(name) {
  const { data } = await supabase.from("cities").select("id, name").eq("name", name).maybeSingle();
  if (data?.id) return data.id;
  const { data: any } = await supabase.from("cities").select("id").limit(1).maybeSingle();
  return any?.id ?? null;
}

/** Hapus seluruh data dummy. Tidak menyentuh pemain asli. */
async function reset() {
  const { data: dummyUsers, error } = await supabase
    .from("users")
    .select("id")
    .like("email", `%${DUMMY_EMAIL_DOMAIN}`);
  if (error) throw new Error(`Gagal membaca pemain dummy: ${error.message}`);
  const userIds = (dummyUsers ?? []).map((row) => row.id);

  const { data: dummyMatches } = await supabase
    .from("matches")
    .select("id")
    .eq("metadata->>seed", SEED_TAG);
  const matchIds = (dummyMatches ?? []).map((row) => row.id);

  console.log(`Ditemukan ${userIds.length} pemain dummy dan ${matchIds.length} pertandingan dummy.`);

  if (matchIds.length > 0) {
    for (const table of ["rating_history", "match_results", "match_participants"]) {
      const { error: childError } = await supabase.from(table).delete().in("match_id", matchIds);
      if (childError) console.warn(`  ${table}: ${childError.message}`);
    }
    const { error: matchError } = await supabase.from("matches").delete().in("id", matchIds);
    if (matchError) throw new Error(`Gagal menghapus pertandingan: ${matchError.message}`);
  }

  if (userIds.length > 0) {
    // rating_history punya baris untuk match dummy yang mungkin sudah terhapus
    // di atas, dan baris dengan user dummy pada match asli (tidak ada).
    for (const table of [
      "rating_history",
      "notifications",
      "tournament_participants",
      "player_ratings",
      "player_profiles",
    ]) {
      const { error: childError } = await supabase.from(table).delete().in("user_id", userIds);
      if (childError) console.warn(`  ${table}: ${childError.message}`);
    }
    // public.users memakai `id`, bukan `user_id`.
    const { error: usersError } = await supabase.from("users").delete().in("id", userIds);
    if (usersError) console.warn(`  users: ${usersError.message}`);
    // Akun auth terakhir: cascade ke sisa baris.
    let removed = 0;
    for (const id of userIds) {
      const { error: authError } = await supabase.auth.admin.deleteUser(id);
      if (!authError) removed += 1;
    }
    console.log(`Akun auth dummy dihapus: ${removed}/${userIds.length}`);
  }

  console.log("Reset selesai.");
}

/** Buat satu akun dummy lengkap. */
async function createPlayer([fullName, gender, level, cityName]) {
  const email = `dummy-${fullName.toLowerCase().replace(/[^a-z]+/g, ".")}${DUMMY_EMAIL_DOMAIN}`;
  const rating = mprStartingRating(level);
  const cityId = await cityIdByName(cityName);

  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      starting_level: level,
      is_dummy: "true",
    },
  });
  if (error) {
    // Sudah ada dari seed sebelumnya: pakai akun itu.
    if (/already/i.test(error.message)) {
      const { data: existing } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (existing?.id) return { id: existing.id, fullName, level, rating, existed: true };
    }
    throw new Error(`Gagal membuat ${fullName}: ${error.message}`);
  }

  const userId = created.user.id;

  // Tandai dummy + lengkapi profil (trigger sudah membuat baris dasarnya).
  const dummyFields = hasDummyColumn ? { is_dummy: true } : {};
  await supabase
    .from("users")
    .update({ ...dummyFields, gender, city_id: cityId })
    .eq("id", userId);
  await supabase
    .from("player_profiles")
    .update({
      ...dummyFields,
      display_name: fullName,
      
      self_assessed_level: level,
      bio: `Pemain uji MATCHPOIN (level ${level}).`,
      preferred_hand: Math.random() < 0.15 ? "left" : "right",
      backhand: Math.random() < 0.5 ? "one_handed" : "two_handed",
      play_frequency: pick(["weekly", "biweekly", "daily"]),
      preferred_categories: pick([["mens_singles"], ["mens_doubles"], ["mixed_doubles"]]),
      completion_score: 80,
      is_profile_public: true,
      profile_visibility: "public",
    })
    .eq("user_id", userId);
  await supabase
    .from("player_ratings")
    .update({ current_rating: rating, peak_rating: rating })
    .eq("user_id", userId);

  return { id: userId, fullName, level, rating, existed: false };
}

/** Buat satu pertandingan selesai + riwayat rating untuk dua pemain. */
async function createCompletedMatch(a, b, stateA, stateB, daysAgo, options = {}) {
  const matchId = randomUUID();
  const winner = options.winner ?? (Math.random() < 0.5 ? "A" : "B");
  const label = options.label ? `${options.label} — ` : "";
  const change = calculateMprSingles({ rating: stateA.rating }, { rating: stateB.rating }, winner);
  const aNew = change.playerA.newRating;
  const bNew = change.playerB.newRating;
  const category = "mens_singles";

  const { error: matchError } = await supabase.from("matches").insert({
    id: matchId,
    title: `[Uji] ${label}${a.fullName} vs ${b.fullName}`,
    description: "Pertandingan data uji (dummy).",
    organizer_id: a.id,
    match_date: dateOnly(daysAgo),
    start_time: "09:00:00",
    duration_minutes: 90,
    max_players: 2,
    // Biarkan trigger match_participants yang menghitung; nilai awal 2 membuat
    // current_players melebihi max_players sehingga insert peserta gagal.
    current_players: 0,
    status: "completed",
    // Data uji harus publik agar feed "Aktivitas Pertandingan Terbaru" di
    // /matches bisa dilihat semua pemain (RLS menyembunyikan match private).
    is_private: false,
    is_league_challenge: false,
    level: "all",
    result_submitted_at: isoDaysAgo(daysAgo),
    result_confirmed_at: isoDaysAgo(daysAgo),
    metadata: { category, match_type: "private", seed: SEED_TAG, umpire_option: "tanpa_wasit" },
  });
  if (matchError) throw new Error(`match: ${matchError.message}`);

  const { error: participantError } = await supabase.from("match_participants").insert([
    { match_id: matchId, user_id: a.id, is_organizer: true, team: 1, metadata: { status: "confirmed" }, confirmed_at: isoDaysAgo(daysAgo) },
    { match_id: matchId, user_id: b.id, is_organizer: false, team: 2, metadata: { status: "confirmed" }, confirmed_at: isoDaysAgo(daysAgo) },
  ]);
  if (participantError) throw new Error(`match_participants: ${participantError.message}`);

  await supabase.from("match_results").insert({
    match_id: matchId,
    team1_score: winner === "A" ? 8 : 3,
    team2_score: winner === "B" ? 8 : 3,
    winner_team: winner === "A" ? 1 : 2,
    status: "confirmed",
    submitted_by: a.id,
    confirmed_at: isoDaysAgo(daysAgo),
    is_walkover: false,
  });

  const { error: historyError } = await supabase.from("rating_history").insert([
    {
      user_id: a.id, match_id: matchId, old_rating: stateA.rating, new_rating: aNew,
      opponent_id: b.id, opponent_rating: stateB.rating,
      change_reason: "Pertandingan uji", metadata: { seed: SEED_TAG }, created_at: isoDaysAgo(daysAgo),
    },
    {
      user_id: b.id, match_id: matchId, old_rating: stateB.rating, new_rating: bNew,
      opponent_id: a.id, opponent_rating: stateA.rating,
      change_reason: "Pertandingan uji", metadata: { seed: SEED_TAG }, created_at: isoDaysAgo(daysAgo),
    },
  ]);
  if (historyError) throw new Error(`rating_history: ${historyError.message}`);

  stateA.rating = aNew;
  stateB.rating = bNew;
  stateA.played += 1;
  stateB.played += 1;
  if (winner === "A") { stateA.wins += 1; stateB.losses += 1; }
  else { stateB.wins += 1; stateA.losses += 1; }
}


/**
 * Pertandingan lintas level, dibuat "dari sisi admin": admin memilih kedua
 * pemain dan hasil akhirnya, bukan pemain yang mengajukan.
 *
 * Semua pemain dummy mulai dari MPR 1300, jadi setelah rangkaian pertandingan
 * di atas rating mereka sudah menyebar. Skenario di bawah memilih pemain
 * berating TERENDAH dan TERTINGGI yang nyata, lalu mempertandingkan keduanya
 * untuk memperlihatkan aturan poin MPR:
 *   - pemain berating rendah yang menang mendapat kenaikan BESAR
 *   - pemain berating tinggi yang menang hanya naik sedikit
 *   - pemain berating tinggi yang kalah turun BANYAK
 */
async function seedCrossLevelMatches(players, state) {
  const ranked = [...players].sort(
    (a, b) => (state.get(a.id)?.rating ?? 0) - (state.get(b.id)?.rating ?? 0)
  );
  const lowest = ranked[0];
  const middle = ranked[Math.floor(ranked.length / 2)];
  const highest = ranked[ranked.length - 1];

  if (!lowest || !middle || !highest || lowest.id === highest.id) return [];

  // Pemain A selalu sisi berating lebih rendah supaya label mudah dibaca.
  const scenarios = [
    {
      a: lowest, b: highest, winner: "A", daysAgo: 3,
      label: "Admin: rating terendah MENANG vs rating tertinggi",
      note: "Upset: pemain berating rendah menang, kenaikan poin paling besar",
    },
    {
      a: lowest, b: highest, winner: "B", daysAgo: 4,
      label: "Admin: rating tertinggi MENANG vs rating terendah",
      note: "Favorit menang: kenaikan kecil, pemain berating rendah turun sedikit",
    },
    {
      a: lowest, b: middle, winner: "A", daysAgo: 5,
      label: "Admin: rating terendah MENANG vs rating menengah",
      note: "Pemain berating rendah menang lawan yang lebih kuat",
    },
    {
      a: middle, b: highest, winner: "A", daysAgo: 6,
      label: "Admin: rating menengah MENANG vs rating tertinggi",
      note: "Kemenangan besar bagi pemain menengah, minus besar bagi yang tertinggi",
    },
    {
      a: middle, b: lowest, winner: "B", daysAgo: 7,
      label: "Admin: rating terendah MENANG vs rating menengah",
      note: "Kalah dari lawan berating lebih rendah: minus paling besar",
    },
  ];

  const results = [];
  for (const scenario of scenarios) {
    const aState = state.get(scenario.a.id);
    const bState = state.get(scenario.b.id);
    const beforeA = aState.rating;
    const beforeB = bState.rating;

    await createCompletedMatch(scenario.a, scenario.b, aState, bState, scenario.daysAgo, {
      winner: scenario.winner,
      label: scenario.label,
    });

    results.push({
      note: scenario.note,
      a: scenario.a.fullName,
      b: scenario.b.fullName,
      beforeA, afterA: aState.rating,
      beforeB, afterB: bState.rating,
    });
  }

  return results;
}

/** Pertandingan OPEN dengan satu permohonan pending (uji Terima/Tolak host). */
async function createPendingRequest(host, applicant) {
  const matchId = randomUUID();
  const { error } = await supabase.from("matches").insert({
    id: matchId,
    title: `[Uji] Terbuka: ${host.fullName} menunggu lawan`,
    description: "Data uji: host belum menerima lawan. Coba tombol Terima/Tolak.",
    organizer_id: host.id,
    match_date: dateOnly(-7),
    start_time: "16:00:00",
    duration_minutes: 90,
    max_players: 2,
    current_players: 0,
    status: "open",
    is_private: false,
    is_league_challenge: false,
    level: "all",
    metadata: { category: "mens_singles", match_type: "open", seed: SEED_TAG, umpire_option: "tanpa_wasit" },
  });
  if (error) return console.warn(`  open match: ${error.message}`);

  const { error: participantError } = await supabase.from("match_participants").insert([
    { match_id: matchId, user_id: host.id, is_organizer: true, team: 1, metadata: { status: "confirmed" } },
    { match_id: matchId, user_id: applicant.id, is_organizer: false, team: 2, metadata: { status: "pending", joined_via: "open_match" } },
  ]);
  if (participantError) console.warn(`  open match participants: ${participantError.message}`);
  return matchId;
}

/** Daftarkan pemain dummy ke liga sesuai aturan kategori. */
async function seedLeagueRegistrations(players) {
  const { data: leagues } = await supabase
    .from("tournaments")
    .select("id, category, name, max_participants")
    .eq("is_league", true);
  if (!leagues?.length) return console.warn("  Tidak ada liga untuk didaftari.");

  let created = 0;
  for (const league of leagues) {
    const definition = IKA17_CATEGORIES.find((entry) => entry.id === league.category);
    if (!definition) continue;

    const eligible = players.filter((player) => {
      if (definition.genderRule === "male" && player.gender !== "male") return false;
      if (definition.genderRule === "female" && player.gender !== "female") return false;
      // Kelas liga tidak dipilih pemain: ditentukan dari MPR setelah bertanding.
      return true;
    });

    const statuses = definition.doubles
      ? buildDoublesEntries(eligible, definition)
      : eligible.slice(0, 6).map((player) => ({ captain: player, partner: null }));

    for (const [index, entry] of statuses.entries()) {
      const entryId = randomUUID();
      // Selang-seling: sebagian accepted (mengisi kuota), sebagian pending.
      const status = index % 3 === 2 ? "pending" : "accepted";
      const rows = [
        {
          tournament_id: league.id, user_id: entry.captain.id, category: league.category,
          entry_id: entryId, entry_role: "captain", status,
          partner_user_id: entry.partner?.id ?? null,
          playing_experience: null, eligibility_confirmed: true,
          joined_at: isoDaysAgo(1 + index),
        },
      ];
      if (entry.partner) {
        rows.push({
          tournament_id: league.id, user_id: entry.partner.id, category: league.category,
          entry_id: entryId, entry_role: "partner", status,
          playing_experience: null, eligibility_confirmed: true,
          joined_at: isoDaysAgo(1 + index),
        });
      }
      const { error } = await supabase.from("tournament_participants").insert(rows);
      if (error) { console.warn(`  liga ${league.category}: ${error.message}`); continue; }
      created += 1;
    }
  }
  console.log(`  ${created} entri liga dummy dibuat.`);
}

/** Pasangan ganda sejenis (campuran: lawan jenis). */
function buildDoublesEntries(players, definition) {
  const entries = [];
  const used = new Set();
  for (const captain of players) {
    if (used.has(captain.id)) continue;
    const partner = players.find((candidate) => {
      if (candidate.id === captain.id || used.has(candidate.id)) return false;
      if (definition.genderRule === "mixed") return candidate.gender !== captain.gender;
      return candidate.gender === captain.gender;
    });
    if (!partner) continue;
    used.add(captain.id);
    used.add(partner.id);
    entries.push({ captain, partner });
    if (entries.length >= 6) break;
  }
  return entries;
}

async function main() {
  if (RESET) return reset();

  console.log(`${DRY_RUN ? "[dry-run] " : ""}Membuat data dummy...`);
  if (!DRY_RUN) {
    const has = await detectDummyColumn();
    console.log(
      has
        ? "  Kolom is_dummy tersedia; pemain dummy ditandai di kolom."
        : "  Kolom is_dummy belum ada (migrasi 00039 belum dijalankan); penanda memakai email @matchpoin.test dan metadata."
    );
  }

  if (DRY_RUN) {
    console.log(`  Akan membuat ${PLAYERS.length} pemain dummy.`);
    console.log(`  Setiap pemain 4-8 pertandingan selesai + riwayat rating.`);
    console.log(`  Pendaftaran liga untuk 4 kategori + 1 match open dengan pending.`);
    return;
  }

  // 1) Pemain dummy -----------------------------------------------------------
  const players = [];
  for (const spec of PLAYERS) {
    const created = await createPlayer(spec);
    players.push({
      ...created,
      gender: spec[1],
      cityName: spec[3],
    });
    process.stdout.write(created.existed ? "." : "+");
  }
  console.log(`\n  ${players.length} pemain dummy siap.`);

  // 2) Pertandingan selesai ---------------------------------------------------
  const state = new Map(
    players.map((player) => [
      player.id,
      { rating: player.rating, played: 0, wins: 0, losses: 0 },
    ])
  );
  const goals = new Map(players.map((player) => [player.id, randomMatchCount()]));
  const queue = players.map((player) => player.id);
  const byId = new Map(players.map((player) => [player.id, player]));

  let matches = 0;
  let guard = 0;
  while (queue.length > 1 && guard < 2000) {
    guard += 1;
    const aId = queue.shift();
    const candidates = queue.filter((id) => id !== aId);
    if (!candidates.length) break;
    const bId = pick(candidates);
    queue.splice(queue.indexOf(bId), 1);

    // Pasangan tunggal: pilih pemain sejenis bila ada, agar realistis.
    const a = byId.get(aId);
    const b = byId.get(bId);

    await createCompletedMatch(a, b, state.get(aId), state.get(bId), 1 + Math.floor(Math.random() * 60));
    matches += 1;

    if (state.get(aId).played < goals.get(aId)) queue.push(aId);
    if (state.get(bId).played < goals.get(bId)) queue.push(bId);
  }
  console.log(`  ${matches} pertandingan selesai + riwayat rating dibuat.`);

  // Pertandingan lintas level (skenario admin) ------------------------------
  const crossLevel = await seedCrossLevelMatches(players, state);
  if (crossLevel.length) {
    console.log("");
    console.log("  Perubahan poin lintas level (skenario admin):");
    for (const row of crossLevel) {
      const deltaA = Math.round(row.afterA) - Math.round(row.beforeA);
      const deltaB = Math.round(row.afterB) - Math.round(row.beforeB);
      const sign = (n) => (n > 0 ? `+${n}` : String(n));
      console.log(`    ${row.note}`);
      console.log(
        `      ${row.a}: ${Math.round(row.beforeA)} → ${Math.round(row.afterA)} (${sign(deltaA)})`
      );
      console.log(
        `      ${row.b}: ${Math.round(row.beforeB)} → ${Math.round(row.afterB)} (${sign(deltaB)})`
      );
    }
  }

  // 3) Rating akhir per pemain ------------------------------------------------
  for (const [userId, value] of state) {
    await supabase
      .from("player_ratings")
      .update({
        current_rating: value.rating,
        peak_rating: value.rating,
        matches_played: value.played,
        wins: value.wins,
        losses: value.losses,
        last_match_at: isoDaysAgo(1),
      })
      .eq("user_id", userId);
    await supabase
      .from("player_profiles")
      .update({ last_seen_at: isoDaysAgo(Math.floor(Math.random() * 5)) })
      .eq("user_id", userId);
  }

  // 4) Match open + permohonan pending ---------------------------------------
  const openMatchId = await createPendingRequest(players[0], players[1]);
  if (openMatchId) console.log("  1 pertandingan open dengan permohonan pending dibuat.");

  // 5) Pendaftaran liga -------------------------------------------------------
  await seedLeagueRegistrations(players);

  // 6) Notifikasi contoh ------------------------------------------------------
  await supabase.from("notifications").insert(
    players.slice(0, 3).map((player) => ({
      user_id: player.id,
      type: "match_invite",
      title: "Data uji: undangan bertanding",
      message: `Halo ${player.fullName}, ini notifikasi contoh dari data uji.`,
      is_read: false,
    }))
  );

  console.log(`\nSelesai. Login pemain dummy: ${PLAYERS[0][0]}`);
  console.log(`  email: dummy-andi.pratama@matchpoin.test`);
  console.log(`  password: ${PASSWORD}`);
  console.log("Hapus semua data dummy dengan --reset.");
}

main().catch((error) => {
  console.error("Gagal:", error.message);
  process.exit(1);
});