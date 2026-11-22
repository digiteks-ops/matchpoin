import nextDynamic from "next/dynamic";
import { requirePageRole } from "@/lib/auth/guards";
import { getAdminSettingsData } from "@/lib/supabase/admin-service";
import { logError } from "@/lib/errors";
import { PageSkeleton } from "@/components/ui/page-skeleton";

const AdminSettingsClient = nextDynamic(() => import("./AdminSettingsClient"), {
  loading: () => <PageSkeleton variant="list" />,
});

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  await requirePageRole("admin", "/admin/settings");

  const { tab } = await searchParams;
  const activeTab = tab || "overview";

  let data = {
    users: [],
    players: [],
    matches: [],
    tournaments: [],
    systemHealth: {},
  } as Awaited<ReturnType<typeof getAdminSettingsData>>;

  try {
    data = await getAdminSettingsData("all");
  } catch (error) {
    logError("admin.settings.page", error);
    data = {
      users: [],
      players: [],
      matches: [],
      tournaments: [],
      systemHealth: { database: "error" },
    };
  }

  return (
    <AdminSettingsClient
      activeTab={activeTab}
      initialUsers={data.users}
      initialPlayers={data.players}
      initialMatches={data.matches}
      initialTournaments={data.tournaments}
      initialSystemHealth={data.systemHealth}
    />
  );
}

