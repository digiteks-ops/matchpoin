#!/usr/bin/env node
/**
 * Prints the stored rating snapshot for one player.
 *
 * Usage:
 *   node scripts/test-player-stats.mjs <userId-uuid>
 *
 * Reads .env.local for NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 * Uses PostgREST directly so it does not depend on the TypeScript sources.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function loadEnv() {
  const env = {};
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match) env[match[1]] = match[2];
    }
  } catch {
    // fall through to process.env
  }
  return { ...env, ...process.env };
}

async function main() {
  const userId = process.argv[2];
  if (!userId || !UUID_RE.test(userId)) {
    console.error("Pass a valid user UUID: node scripts/test-player-stats.mjs <userId>");
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  const get = async (path) => {
    const res = await fetch(`${url}/rest/v1/${path}`, { headers });
    if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text()}`);
    return res.json();
  };

  const [user] = await get(`users?select=id,full_name,email,city_id&id=eq.${userId}`);
  if (!user) {
    console.error(`No public.users row for ${userId}`);
    process.exit(1);
  }

  const [rating] = await get(
    `player_ratings?select=current_rating,peak_rating,matches_played,wins,losses,draws&user_id=eq.${userId}`
  );
  const history = await get(
    `rating_history?select=match_id,rating_change,new_rating,created_at&user_id=eq.${userId}&order=created_at.desc&limit=10`
  );

  console.log("=== Player snapshot ===");
  console.log(`user      : ${user.full_name} <${user.email}>`);
  if (rating) {
    console.log(
      `rating    : ${Number(rating.current_rating).toFixed(2)} (peak ${Number(rating.peak_rating).toFixed(2)})`
    );
    console.log(
      `record    : ${rating.matches_played} played · ${rating.wins}W ${rating.losses}L ${rating.draws}D`
    );
  } else {
    console.log("rating    : <no player_ratings row>");
  }
  console.log(`history   : ${history.length} entr${history.length === 1 ? "y" : "ies"}`);
  for (const entry of history) {
    console.log(`  ${entry.created_at}  ${entry.match_id}  ${entry.rating_change >= 0 ? "+" : ""}${entry.rating_change} -> ${entry.new_rating}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});