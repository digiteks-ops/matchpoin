import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyMySqlMatchDetailPage({ params }: { params: { id: string } }) {
  redirect(`/matches/${params.id}`);
}
