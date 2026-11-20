import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyMySqlProfileEditPage() {
  redirect("/profile/edit");
}
