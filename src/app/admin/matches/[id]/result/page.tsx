import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminResultClient from "./AdminResultClient";

export const dynamic = "force-dynamic";

export default async function AdminMatchResultPage({ params }: { params: { id: string } }) {
  await requirePageRole("admin", `/admin/matches/${params.id}/result`);

  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: match } = await admin
    .from("matches")
    .select("id, title, metadata, status")
    .eq("id", params.id)
    .maybeSingle();

  if (!match) notFound();

  const category = (match.metadata as Record<string, unknown> | null)?.category;
  return (
    <div className="container mx-auto max-w-xl px-4 py-8 sm:px-6">
      <Link href={`/matches/${match.id}`} className="text-xs font-semibold text-slate-500 underline">
        ← Kembali ke pertandingan
      </Link>
      <h1 className="mt-3 font-heading text-2xl font-extrabold text-slate-900">Input Hasil (Admin)</h1>
      <p className="mt-1 text-sm text-slate-600">
        {match.title} · {typeof category === "string" ? category : "pertandingan"} · status {match.status}
      </p>
      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        Jalur admin: hasil langsung dikonfirmasi, rating diterapkan, dan foto bukti tidak diwajibkan.
      </p>
      <AdminResultClient matchId={match.id} />
    </div>
  );
}
