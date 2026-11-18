import "server-only";
import { getCurrentUserId, requireUser as requireSupabaseUser } from "./supabase-auth";

export async function getCurrentUser() {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  return { id: userId };
}

export async function requireUser() {
  const user = await requireSupabaseUser();
  return { id: user.id, email: user.email, name: user.name };
}