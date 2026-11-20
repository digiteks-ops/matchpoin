/**
 * Seeds the MATCHPOIN admin account and the Liga Tennis IKA17 categories.
 *
 * Credentials come from the environment, never from source:
 *   ADMIN_EMAIL=matchpoin.id@gmail.com
 *   ADMIN_PASSWORD=<secret>
 *
 * Supabase Auth hashes the password internally (bcrypt) and only the hash is
 * stored. The script is idempotent: rerunning updates the password and makes
 * sure the admin role and league rows exist.
 */
import { existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

// Node 20 has no native WebSocket; provide one for Supabase Realtime init.
if (!globalThis.WebSocket) globalThis.WebSocket = WebSocket;

for (const file of [".env", ".env.local"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.trim();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}
if (!ADMIN_EMAIL) throw new Error("ADMIN_EMAIL is required.");
if (!ADMIN_PASSWORD) {
  throw new Error("ADMIN_PASSWORD is empty. Fill it in .env before running the seed.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { enabled: false },
});

const LEAGUE = {
  key: "ika17-2027",
  name: "Liga Tennis IKA17",
  season: "Musim 1 2027",
  start: "2027-01-01",
  end: "2027-03-31",
  mainEventStart: "2027-04-03",
  mainEventEnd: "2027-04-04",
  registrationDeadline: "2026-12-31",
  quota: 24,
};

const CATEGORIES = [
  {
    category: "womens_singles",
    label: "Single Woman",
    slug: "league-q1-2027-womens-singles",
  },
  {
    category: "womens_doubles",
    label: "Double Woman",
    slug: "league-q1-2027-womens-doubles",
  },
  {
    category: "mens_singles",
    label: "Single Man",
    slug: "league-q1-2027-mens-singles",
  },
  {
    category: "mens_doubles",
    label: "Double Man",
    slug: "league-q1-2027-mens-doubles",
  },
  {
    category: "mixed_doubles",
    label: "Double Mix",
    slug: "league-q1-2027-mixed-doubles",
  },
];

async function findAuthUserByEmail(email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Gagal membaca daftar auth user: ${error.message}`);
    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function ensureAuthUser() {
  const existing = await findAuthUserByEmail(ADMIN_EMAIL);
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { ...existing.user_metadata, full_name: "Admin MatchPoint" },
    });
    if (error) throw new Error(`Gagal memperbarui password admin: ${error.message}`);
    return data.user;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: "Admin MatchPoint" },
  });
  if (error) throw new Error(`Gagal membuat akun admin: ${error.message}`);
  return data.user;
}

async function ensurePublicUser(user) {
  const { data: existing, error: readError } = await supabase
    .from("users")
    .select("id, full_name")
    .eq("id", user.id)
    .maybeSingle();
  if (readError) throw new Error(`Gagal membaca public.users: ${readError.message}`);

  if (!existing) {
    const { error } = await supabase.from("users").insert({
      id: user.id,
      email: ADMIN_EMAIL,
      full_name: "Admin MatchPoint",
      timezone: "Asia/Makassar",
      locale: "id",
    });
    if (error) throw new Error(`Gagal membuat public.users: ${error.message}`);
  }

  const { data: profile } = await supabase
    .from("player_profiles")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    const { error } = await supabase.from("player_profiles").insert({
      user_id: user.id,
      display_name: "Admin MatchPoint",
      is_profile_public: false,
      profile_visibility: "private",
      trust_points: 0,
    });
    if (error) throw new Error(`Gagal membuat player_profiles: ${error.message}`);
  }

  const { data: rating } = await supabase
    .from("player_ratings")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!rating) {
    const { error } = await supabase.from("player_ratings").insert({
      user_id: user.id,
      current_rating: 1,
      peak_rating: 1,
      matches_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });
    if (error) throw new Error(`Gagal membuat player_ratings: ${error.message}`);
  }
}

async function ensureAdminRole(userId) {
  const { data: role, error: roleError } = await supabase
    .from("roles")
    .select("id")
    .eq("code", "admin")
    .maybeSingle();
  if (roleError || !role) {
    throw new Error(
      "Role admin belum ada. Jalankan supabase/migrations/00014_match_and_league_ika17.sql terlebih dahulu."
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role_id", role.id)
    .is("revoked_at", null)
    .maybeSingle();
  if (existingError) throw new Error(`Gagal membaca user_roles: ${existingError.message}`);

  if (!existing) {
    const { error } = await supabase.from("user_roles").insert({
      user_id: userId,
      role_id: role.id,
      reason: "Admin seed",
    });
    if (error) throw new Error(`Gagal memberikan role admin: ${error.message}`);

    const { error: auditError } = await supabase.from("role_audit_logs").insert({
      user_id: userId,
      role_id: role.id,
      action: "assigned",
      reason: "Admin seed",
    });
    if (auditError) throw new Error(`Gagal menulis audit role: ${auditError.message}`);
  }
}

async function seedLeagues(userId) {
  const { data: city, error: cityError } = await supabase
    .from("cities")
    .select("id, name")
    .eq("name", "Makassar")
    .maybeSingle();
  if (cityError) throw new Error(`Gagal membaca kota: ${cityError.message}`);

  const { data: fallbackCity } = await supabase
    .from("cities")
    .select("id, name")
    .limit(1)
    .maybeSingle();
  const cityId = city?.id ?? fallbackCity?.id;
  if (!cityId) throw new Error("Belum ada kota. Jalankan seed kota terlebih dahulu.");

  for (const entry of CATEGORIES) {
    const payload = {
      name: `${LEAGUE.name} — ${entry.label}`,
      slug: entry.slug,
      description: `${entry.label} ${LEAGUE.name} ${LEAGUE.season}.`,
      city_id: cityId,
      organizer_id: userId,
      format: "round_robin",
      status: "registration_open",
      registration_open_at: "2026-11-15T00:00:00+08:00",
      registration_close_at: "2026-12-31T23:59:59+08:00",
      start_date: LEAGUE.start,
      end_date: LEAGUE.end,
      max_participants: LEAGUE.quota,
      category: entry.category,
      season: LEAGUE.season,
      is_league: true,
      league_key: LEAGUE.key,
      league_name: LEAGUE.name,
      registration_deadline: LEAGUE.registrationDeadline,
      main_event_start_date: LEAGUE.mainEventStart,
      main_event_end_date: LEAGUE.mainEventEnd,
      is_public: true,
      requires_approval: true,
      metadata: {
        league_key: LEAGUE.key,
        league_name: LEAGUE.name,
        season: LEAGUE.season,
        category: entry.category,
        is_league: true,
      },
    };

    const { data: existing, error: readError } = await supabase
      .from("tournaments")
      .select("id")
      .eq("slug", entry.slug)
      .maybeSingle();
    if (readError) {
      throw new Error(`Gagal membaca kategori ${entry.label}: ${readError.message}`);
    }

    const { error } = existing
      ? await supabase.from("tournaments").update(payload).eq("id", existing.id)
      : await supabase.from("tournaments").insert(payload);
    if (error) {
      throw new Error(
        `Gagal menyimpan kategori ${entry.label}: ${error.message}. Pastikan migration 00014 sudah dijalankan.`
      );
    }
  }
}

async function main() {
  const user = await ensureAuthUser();
  if (!user) throw new Error("Akun admin tidak dapat dibuat.");

  await ensurePublicUser(user);
  await ensureAdminRole(user.id);
  await seedLeagues(user.id);

  console.log("Seed admin selesai.");
  console.log(`Email admin: ${ADMIN_EMAIL}`);
  console.log(`User ID: ${user.id}`);
  console.log(`Liga: ${LEAGUE.name} (${CATEGORIES.length} kategori, kuota ${LEAGUE.quota}).`);
  console.log("Password disimpan sebagai hash oleh Supabase Auth; tidak dicetak.");
}

main().catch((error) => {
  console.error(`Seed admin gagal: ${error.message}`);
  process.exitCode = 1;
});
