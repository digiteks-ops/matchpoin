import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getUserRoles } from "@/lib/supabase/rbac-service";
import { normalizeRoles, highestRole, hasRole as roleAtLeast, type AppRole } from "@/lib/auth/roles";

export interface SupabaseSessionUser {
  id: string;
  email?: string | null;
  name?: string | null;
  roles: AppRole[];
  role: AppRole;
  authVersion: number;
}

export interface SupabaseSession {
  user: SupabaseSessionUser | null;
}

/**
 * Ensures the Supabase Auth user has matching rows in users, player_profiles,
 * player_ratings and the default player role. The RPC is idempotent and only
 * fills missing rows, never overwriting profile data.
 */
export async function syncUserOnLogin(
  supabaseUserId: string,
  email: string,
  fullName: string
): Promise<void> {
  const client = createAdminClient() ?? createClient();
  const { error } = await client.rpc("ensure_user_records", {
    p_user_id: supabaseUserId,
    p_email: email,
    p_full_name: fullName || null,
  });
  if (error) {
    throw new Error(`Gagal menyinkronkan akun pemain: ${error.message}`);
  }
}

export async function getSupabaseSession(): Promise<SupabaseSession> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null };
  }

  const fullName = user.user_metadata?.full_name ?? user.email ?? "";
  let authVersion = 1;

  const { data: account, error: accountError } = await supabase
    .from("users")
    .select("id, auth_session_version")
    .eq("id", user.id)
    .maybeSingle();

  if (accountError || !account) {
    try {
      await syncUserOnLogin(user.id, user.email ?? "", String(fullName));
    } catch {
      // The session still resolves; guards will fail closed through roles.
    }
  } else {
    authVersion = Number(account.auth_session_version ?? 1);
  }

  const roles = normalizeRoles(await getUserRoles(user.id));
  return {
    user: {
      id: user.id,
      email: user.email,
      name: fullName,
      roles,
      role: highestRole(roles),
      authVersion,
    },
  };
}

export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSupabaseSession();
  return session.user?.id ?? null;
}

export async function requireUser(): Promise<SupabaseSessionUser> {
  const session = await getSupabaseSession();
  if (!session.user) throw new Error("Unauthenticated");
  return session.user;
}

export async function requireRole(required: AppRole): Promise<SupabaseSessionUser> {
  const user = await requireUser();
  if (!roleAtLeast(user.roles, required)) {
    throw new Error("Insufficient permissions");
  }
  return user;
}
