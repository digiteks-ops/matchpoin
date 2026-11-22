import { requirePageRole } from "@/lib/auth/guards";
import SimulationClient from "./SimulationClient";

export const dynamic = "force-dynamic";

export default async function AdminSimulationPage() {
  await requirePageRole("admin", "/admin/simulasi");
  return <SimulationClient />;
}