import { requirePageRole } from "@/lib/auth/guards";
import { getAdminSettingsData } from "@/lib/supabase/admin-service";
import AdminSettingsClient from "./AdminSettingsClient";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePageRole("admin", "/admin/settings");

  const { tab } = await searchParams;
  const activeTab = tab || "overview";
  const { users, players, matches, tournaments, systemHealth } = await getAdminSettingsData(activeTab);

  return (
    <AdminSettingsClient
      activeTab={activeTab}
      initialUsers={users}
      initialPlayers={players}
      initialMatches={matches}
      initialTournaments={tournaments}
      initialSystemHealth={systemHealth}
    />
  );
}
