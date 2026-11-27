import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HostRecordMatchForm, type HostRecordCandidate } from "@/components/matches/host-record-match-form";
import { requirePageRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { getHostCommunity, listCommunityMembers } from "@/lib/supabase/community-service";

export const dynamic = "force-dynamic";

export default async function NewHostMatchPage() {
  const session = await requirePageRole("host", "/host/matches/new");
  const hostId = session.user.id;

  const community = await getHostCommunity(hostId).catch((error) => {
    logError("host.match.new.community", error, { hostId });
    return null;
  });

  if (!community) {
    return (
      <div className="flex-1 bg-slate-50 py-8">
        <div className="container mx-auto max-w-2xl px-4 sm:px-6">
          <Link
            href="/host"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-matchpoin-navy"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Dasbor Host
          </Link>
          <Card className="mt-4 border-slate-200">
            <CardHeader>
              <CardTitle>Komunitas Belum Ada</CardTitle>
              <CardDescription>
                Buat komunitas terlebih dahulu. Pemain yang dapat dicatat berasal dari anggota komunitas Anda.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link href="/host">
                <Button variant="tennis" className="font-bold text-matchpoin-navy">
                  Buat Komunitas
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const supabase = createClient();
  const [members, hostResult] = await Promise.all([
    listCommunityMembers(community.id).catch((error) => {
      logError("host.match.new.members", error, { communityId: community.id });
      return [];
    }),
    supabase
      .from("users")
      .select("full_name, email")
      .eq("id", hostId)
      .maybeSingle(),
  ]);

  const byId = new Map<string, string>();
  byId.set(
    hostId,
    hostResult.data?.full_name || hostResult.data?.email || community.admin_name || "Anda"
  );
  for (const member of members) {
    if (!byId.has(member.user_id)) {
      byId.set(member.user_id, member.full_name || member.email || "Pemain");
    }
  }

  const candidates: HostRecordCandidate[] = Array.from(byId, ([userId, name]) => ({
    userId,
    name,
  })).sort((a, b) => {
    if (a.userId === hostId) return -1;
    if (b.userId === hostId) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        <div className="flex items-center justify-between">
          <Link
            href="/host"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-matchpoin-navy"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali ke Dasbor Host
          </Link>
          <span className="text-xs text-slate-400">{community.name}</span>
        </div>

        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-slate-900">
            Catat Hasil Pertandingan
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Pilih pemain dari komunitas, isi skor akhir, lalu kirim untuk dikonfirmasi pemain.
          </p>
        </div>

        <HostRecordMatchForm hostId={hostId} candidates={candidates} />
      </div>
    </div>
  );
}
