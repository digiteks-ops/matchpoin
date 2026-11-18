import { createClient } from "@/lib/supabase/server";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getUserRoles, ensureDefaultRole } from "@/lib/mysql/rbac-service";
import { normalizeRoles, highestRole, type AppRole } from "@/lib/auth/roles";
import type { RowDataPacket } from "mysql2/promise";

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

export async function getSupabaseSession(): Promise<SupabaseSession> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { user: null };
  }

  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    
    // Check if user exists in MySQL, if not sync them
    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE auth_user_id = ? LIMIT 1",
      [user.id]
    );
    if (existing.length === 0) {
      await syncUserOnLogin(user.id, user.email ?? "", user.user_metadata?.full_name ?? user.email ?? "");
    }
    
    const roles = await getUserRoles(connection, user.id);
    const normalizedRoles = normalizeRoles(roles);
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name ?? user.email,
        roles: normalizedRoles,
        role: highestRole(normalizedRoles),
        authVersion: 1,
      },
    };
  } finally {
    if (connection) await connection.end();
  }
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
  if (!user.roles.some((r) => ["player", "admin", "super_admin"].indexOf(r) >= ["player", "admin", "super_admin"].indexOf(required))) {
    throw new Error("Insufficient permissions");
  }
  return user;
}

export async function syncUserOnLogin(supabaseUserId: string, email: string, fullName: string): Promise<void> {
  let connection: Awaited<ReturnType<typeof connectToMySql>> | null = null;
  try {
    connection = await connectToMySql();
    await connection.beginTransaction();

    const [existing] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM users WHERE auth_user_id = ? LIMIT 1",
      [supabaseUserId]
    );
    if (existing.length > 0) {
      await connection.commit();
      return;
    }

    const [cityRows] = await connection.execute<RowDataPacket[]>(
      "SELECT id FROM cities WHERE name = ? AND is_active = TRUE LIMIT 1",
      ["Makassar"]
    );
    const cityId = cityRows.length > 0 ? cityRows[0].id : null;

    await connection.execute(
      `INSERT INTO users (id, auth_user_id, email, full_name, city_id) VALUES (?, ?, ?, ?, ?)`,
      [supabaseUserId, supabaseUserId, email, fullName, cityId]
    );
    await connection.execute(
      `INSERT INTO player_profiles (id, user_id, display_name, is_profile_public, profile_visibility, preferred_hand, backhand, play_frequency, self_assessed_level, completion_score)
       VALUES (?, ?, ?, TRUE, 'public', 'right', 'two_handed', 'weekly', 'beginner', 40)`,
      [supabaseUserId, supabaseUserId, fullName]
    );
    await connection.execute(
      `INSERT INTO player_ratings (id, user_id) VALUES (?, ?)`,
      [supabaseUserId, supabaseUserId]
    );
    await ensureDefaultRole(connection, supabaseUserId);

    await connection.commit();
  } catch (error) {
    if (connection) await connection.rollback();
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}