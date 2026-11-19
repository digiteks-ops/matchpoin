import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function LegacyMySqlPlayerDetailPage({ params }: { params: { id: string } }) {
  redirect(`/players/${params.id}`);
}
