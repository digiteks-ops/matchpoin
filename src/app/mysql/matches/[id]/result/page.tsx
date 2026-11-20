import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyMySqlMatchResultPage({ params }: { params: { id: string } }) {
  redirect(`/matches/${params.id}`);
}
