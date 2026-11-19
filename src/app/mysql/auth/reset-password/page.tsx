import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyMySqlResetPasswordPage() {
  redirect("/reset-password");
}
