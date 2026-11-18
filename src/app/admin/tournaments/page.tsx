import { redirect } from "next/navigation";
import { requirePageRole } from "@/lib/auth/guards";
import AdminTournamentsClient from "./AdminTournamentsClient";

export default async function AdminTournamentsPage() {
  await requirePageRole("super_admin", "/auth/login?redirectTo=/admin/tournaments");
  return <AdminTournamentsClient />;
}