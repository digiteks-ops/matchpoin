import { requirePageRole } from "@/lib/auth/guards";
import { getAdminDashboard } from "@/lib/supabase/admin-service";
import AdminDashboardClient from "./AdminDashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  await requirePageRole("admin", "/admin");

  const { stats, activity } = await getAdminDashboard();
  return <AdminDashboardClient initialStats={stats} initialActivity={activity} />;
}
