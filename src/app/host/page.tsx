import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CommunityCreateForm } from "@/components/community/community-create-form";
import { CommunityMemberManager } from "@/components/community/community-member-manager";
import { CommunitySettingsForm } from "@/components/community/community-settings-form";
import { ReferralLinkCard } from "@/components/community/referral-link-card";
import { requirePageRole } from "@/lib/auth/guards";
import { logError } from "@/lib/errors";
import {
  getHostCommunity,
  listCommunityMembers,
  type CommunityMember,
  type CommunityWithMeta,
} from "@/lib/supabase/community-service";
import { getCommunityReferralSummary } from "@/lib/supabase/referral-service";
import { getPublicPlayers } from "@/lib/supabase/public-player-service";
import { ClipboardList, ExternalLink, MapPin, MessageCircle, Users } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function HostDashboardPage() {
  const session = await requirePageRole("host", "/host");
  const hostId = session.user.id;

  let community: CommunityWithMeta | null = null;
  let loadError = false;
  try {
    community = await getHostCommunity(hostId);
  } catch (error) {
    logError("host.dashboard.community", error, { userId: hostId });
    loadError = true;
  }

  let referral = { code: null as string | null, count: 0 };
  let members: CommunityMember[] = [];
  let candidates: {
    userId: string;
    displayName: string;
    cityName: string;
    currentRating: number | null;
  }[] = [];

  if (community) {
    const [memberResult, playerResult, referralResult] = await Promise.all([
      listCommunityMembers(community.id).catch((error) => {
        logError("host.dashboard.members", error, { communityId: community?.id });
        return [] as CommunityMember[];
      }),
      getPublicPlayers(200, "name").catch((error) => {
        logError("host.dashboard.players", error, { userId: hostId });
        return [];
      }),
      getCommunityReferralSummary(community.id).catch((error) => {
        logError("host.dashboard.referral", error, { communityId: community?.id });
        return { code: null, count: 0 };
      }),
    ]);
    members = memberResult;
    referral = referralResult;
    candidates = playerResult.map((player) => ({
      userId: player.userId,
      displayName: player.displayName,
      cityName: player.cityName,
      currentRating: player.currentRating,
    }));
  }

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto max-w-6xl space-y-5 px-4 sm:px-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-matchpoin-tennis">
              Area Host
            </p>
            <h1 className="font-heading text-xl font-extrabold text-slate-900 sm:text-2xl">
              Dasbor Host
            </h1>
            <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
              Kelola komunitas, anggota, dan kontak admin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {community && (
              <>
                <Link href="/host/matches/new">
                  <Button variant="tennis" size="sm" className="gap-1.5 text-xs font-bold text-matchpoin-navy">
                    <ClipboardList className="h-4 w-4" />
                    Catat Hasil
                  </Button>
                </Link>
                <Link href={`/communities/${community.id}`}>
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <ExternalLink className="h-4 w-4" />
                    Halaman Komunitas
                  </Button>
                </Link>
              </>
            )}
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs">
                Dasbor Pemain
              </Button>
            </Link>
          </div>
        </div>

        {loadError ? (
          <Card className="border-rose-200">
            <CardContent className="p-6 text-sm text-rose-600">
              Data komunitas belum bisa dimuat. Coba muat ulang halaman.
            </CardContent>
          </Card>
        ) : !community ? (
          <Card className="mx-auto max-w-2xl border-slate-200">
            <CardHeader>
              <CardTitle>Buat Komunitas</CardTitle>
              <CardDescription>
                Satu akun host mengelola satu komunitas. Isi data dasar di bawah
                untuk mulai mendaftarkan pemain.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CommunityCreateForm />
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="border-slate-200">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{community.name}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-1 text-xs">
                      <MapPin className="h-3.5 w-3.5" />
                      {community.city || "Kota belum diisi"}
                    </CardDescription>
                  </div>
                  <Badge variant="tennis">Komunitas</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Admin</span>
                    <span className="truncate font-semibold text-slate-800">
                      {community.admin_name || "Anda"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Users className="h-3.5 w-3.5" />
                      Anggota
                    </span>
                    <span className="font-semibold text-slate-800">
                      {community.member_count}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <MessageCircle className="h-3.5 w-3.5" />
                      WhatsApp
                    </span>
                    <span className="truncate font-semibold text-slate-800">
                      {community.admin_phone || "Belum tersedia"}
                    </span>
                  </div>
                </div>

                <ReferralLinkCard code={referral.code} count={referral.count} />

                <div className="border-t border-slate-100 pt-4">
                  <h3 className="mb-3 font-heading text-sm font-bold text-slate-900">
                    Pengaturan Komunitas
                  </h3>
                  <CommunitySettingsForm
                    community={{
                      id: community.id,
                      name: community.name,
                      city: community.city,
                      admin_phone: community.admin_phone,
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-base">Anggota & Pendaftaran</CardTitle>
                <CardDescription className="text-xs">
                  Cari pemain lalu daftarkan ke komunitas Anda.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CommunityMemberManager
                  communityId={community.id}
                  members={members}
                  candidates={candidates}
                />
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
