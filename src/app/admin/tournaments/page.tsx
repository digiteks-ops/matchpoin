import { requirePageRole } from "@/lib/auth/guards";
import { listManagedLeagues, type ManagedLeagueSummary } from "@/lib/supabase/tournament-admin-service";
import { logError } from "@/lib/errors";
import AdminTournamentsClient from "./AdminTournamentsClient";

export const dynamic = "force-dynamic";

export default async function AdminTournamentsPage() {
  await requirePageRole("admin", "/admin/tournaments");

  let leagues: ManagedLeagueSummary[] = [];
  let loadError: string | null = null;
  try {
    leagues = await listManagedLeagues();
  } catch (error) {
    logError("admin.tournaments.page", error);
    loadError = "Gagal memuat data liga. Coba muat ulang atau periksa konfigurasi server.";
  }

  return <AdminTournamentsClient leagues={leagues} initialError={loadError} />;
}
