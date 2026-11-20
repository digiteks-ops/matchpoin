import { notFound } from "next/navigation";
import nextDynamic from "next/dynamic";
import { requirePageRole } from "@/lib/auth/guards";
import { getManagedLeague } from "@/lib/supabase/tournament-admin-service";
import { PageSkeleton } from "@/components/ui/page-skeleton";

const AdminTournamentDetailClient = nextDynamic(() => import("./AdminTournamentDetailClient"), {
  loading: () => <PageSkeleton variant="list" />,
});

export const dynamic = "force-dynamic";

export default async function AdminTournamentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  await requirePageRole("admin", `/admin/tournaments/${params.id}`);
  const league = await getManagedLeague(params.id);
  if (!league) notFound();

  return <AdminTournamentDetailClient initialLeague={league} />;
}

