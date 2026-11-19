import { requirePageRole } from "@/lib/auth/guards";
import AdminTournamentsClient from "./AdminTournamentsClient";

export const dynamic = "force-dynamic";

export default async function AdminTournamentsPage() {
  await requirePageRole("super_admin", "/admin/tournaments");
  return <AdminTournamentsClient />;
}
