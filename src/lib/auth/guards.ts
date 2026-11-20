import "server-only";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { hasRole, type AppRole } from "@/lib/auth/roles";
import { getUserRoles } from "@/lib/supabase/rbac-service";
import { getSupabaseSession, requireUser, requireRole } from "./supabase-auth";
import { logError } from "@/lib/errors";

export const APP_LOGIN_PATH = "/login";
export const APP_DASHBOARD_PATH = "/dashboard";
export const MY_SQL_LOGIN_PATH = APP_LOGIN_PATH;
export const MY_SQL_DASHBOARD_PATH = APP_DASHBOARD_PATH;

export async function requirePageUser(
  redirectTo: string = APP_LOGIN_PATH
): Promise<{ user: { id: string } }> {
  const session = await getSupabaseSession();
  if (!session.user?.id) {
    redirect(`${APP_LOGIN_PATH}?redirectTo=${encodeURIComponent(redirectTo)}`);
  }
  return { user: { id: session.user.id } };
}

export async function requirePageRole(
  required: AppRole,
  redirectTo: string = APP_LOGIN_PATH
): Promise<{ user: { id: string } }> {
  const session = await requirePageUser(redirectTo);
  let roles: AppRole[] = [];
  try {
    roles = await getUserRoles(session.user.id);
  } catch (error) {
    logError("require-page-role", error);
    redirect(APP_DASHBOARD_PATH);
  }
  if (!hasRole(roles, required)) redirect(APP_DASHBOARD_PATH);
  return session;
}

export async function requireApiRole(
  required: AppRole
): Promise<{ session: { user: { id: string } }; roles: AppRole[] } | NextResponse> {
  const session = await getSupabaseSession();
  if (!session.user?.id) {
    return NextResponse.json(
      { success: false, message: "Anda harus masuk terlebih dahulu." },
      { status: 401 }
    );
  }

  let roles: AppRole[] = [];
  try {
    roles = await getUserRoles(session.user.id);
  } catch (error) {
    logError("require-api-role", error);
    return NextResponse.json(
      { success: false, message: "Otorisasi tidak dapat diverifikasi." },
      { status: 403 }
    );
  }

  if (!hasRole(roles, required)) {
    return NextResponse.json(
      { success: false, message: "Anda tidak memiliki akses untuk tindakan ini." },
      { status: 403 }
    );
  }
  return { session: { user: { id: session.user.id } }, roles };
}

export { requireUser, requireRole } from "./supabase-auth";
