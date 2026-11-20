import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeRoles, type AppRole } from "@/lib/auth/roles";

export class RbacError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RbacError";
  }
}

function admin() {
  const client = createAdminClient();
  if (!client) throw new RbacError("Supabase service role tidak dikonfigurasi.");
  return client;
}

function messageOf(error: { message?: string } | null, fallback: string): string {
  const message = error?.message?.replace(/^.*?:\s*/, "") ?? "";
  return message || fallback;
}

/**
 * Reads active roles from Supabase. A missing RBAC table or RPC fails closed to
 * the lowest privilege, exactly like the MySQL implementation.
 */
export const getUserRoles = cache(async (userId: string): Promise<AppRole[]> => {
  if (!userId) return ["player"];
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc("get_user_roles", { p_user_id: userId });
    if (!error) return normalizeRoles(data);
  } catch {
    // fall through to the service-role read
  }
  try {
    const { data, error } = await admin().rpc("get_user_roles", { p_user_id: userId });
    if (error) return ["player"];
    return normalizeRoles(data);
  } catch {
    return ["player"];
  }
});

export async function assignRole(
  userId: string,
  role: AppRole,
  actorId: string,
  reason: string | null = null
): Promise<void> {
  const { error } = await admin().rpc("assign_role", {
    p_target_user_id: userId,
    p_role: role,
    p_actor_id: actorId,
    p_reason: reason,
  });
  if (error) throw new RbacError(messageOf(error, "Perubahan role gagal."));
}

export async function revokeRole(
  userId: string,
  role: AppRole,
  actorId: string,
  reason: string
): Promise<void> {
  const { error } = await admin().rpc("revoke_role", {
    p_target_user_id: userId,
    p_role: role,
    p_actor_id: actorId,
    p_reason: reason,
  });
  if (error) throw new RbacError(messageOf(error, "Pencabutan role gagal."));
}
