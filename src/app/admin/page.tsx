import { requirePageRole } from "@/lib/auth/guards";
import { getAdminDashboard, type AdminDashboardStats } from "@/lib/supabase/admin-service";
import { logError } from "@/lib/errors";
import AdminDashboardClient from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

const EMPTY_STATS: AdminDashboardStats = {
  totalUsers: 0,
  activePlayers: 0,
  totalMatches: 0,
  totalTournaments: 0,
  pendingRegistrations: 0,
  confirmedRegistrations: 0,
};

export default async function AdminDashboardPage() {
  await requirePageRole("admin", "/admin");

  let stats = EMPTY_STATS;
  let activity: Awaited<ReturnType<typeof getAdminDashboard>>["activity"] = [];
  let loadError: string | null = null;

  try {
    const data = await getAdminDashboard();
    stats = data.stats;
    activity = data.activity;
  } catch (error) {
    logError("admin.dashboard", error);
    const message = error instanceof Error ? error.message : "";
    if (/service role is not configured/i.test(message)) {
      loadError =
        "Konfigurasi server admin belum lengkap. Pastikan SUPABASE_SERVICE_ROLE_KEY sudah diset di Vercel lalu redeploy.";
    } else {
      loadError = "Sebagian data admin gagal dimuat. Coba muat ulang halaman ini.";
    }
  }

  return (
    <AdminDashboardClient
      initialStats={stats}
      initialActivity={activity}
      errorMessage={loadError}
    />
  );
}
