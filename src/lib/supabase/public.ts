import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Cookie-free anon client for public, cacheable reads (cities, public_players).
 *
 * Public pages must keep working when the service-role key is missing or wrong;
 * RLS still limits what this client can read. It never touches cookies, so it is
 * safe inside `unstable_cache`.
 */
export function createPublicClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) return null;

  if (!cached) {
    cached = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cached;
}
