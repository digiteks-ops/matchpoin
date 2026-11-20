import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/auth/guards";
import { getManagedLeague } from "@/lib/supabase/tournament-admin-service";
import AdminTournamentDetailClient from "./AdminTournamentDetailClient";

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
