import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-only Supabase client that bypasses RLS.
 *
 * Used exclusively for onboarding (creating the public.users row that other
 * tables reference) because the anon key has no INSERT policy on public.users.
 * The service role key stays on the server: this module must never be imported
 * from a Client Component.
 */
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  if (!cached) {
    cached = createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cached;
}