import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { logError } from "@/lib/errors";
import {
  getCommunity,
  listCommunityMembers,
  whatsappChatUrl,
  type CommunityMember,
  type CommunityWithMeta,
} from "@/lib/supabase/community-service";
import { formatIndonesianDate } from "@/lib/utils";
import { MapPin, MessageCircle, Users } from "lucide-react";

export const dynamic = "force-dynamic";

function initialOf(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "P";
}

export default async function CommunityPage({
  params,
}: {
  params: { id: string };
}) {
  let community: CommunityWithMeta | null = null;
  try {
    community = await getCommunity(params.id);
  } catch (error) {
    logError("community.page", error, { communityId: params.id });
  }

  if (!community) notFound();

  let members: CommunityMember[] = [];
  try {
    members = await listCommunityMembers(community.id);
  } catch (error) {
    logError("community.page.members", error, { communityId: community.id });
  }

  const chatUrl = whatsappChatUrl(community.admin_phone);

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto max-w-4xl space-y-5 px-4 sm:px-6">
        <Card className="overflow-hidden border-slate-200">
          <div className="h-2 bg-matchpoin-tennis" />
          <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <Badge variant="tennis">Komunitas</Badge>
              <CardTitle className="text-2xl">{community.name}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {community.city || "Kota belum diisi"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" />
                  {community.member_count} anggota
                </span>
                <span>Admin: {community.admin_name || "Belum diisi"}</span>
              </CardDescription>
            </div>
            {chatUrl ? (
              <a href={chatUrl} target="_blank" rel="noopener noreferrer">
                <Button
                  variant="tennis"
                  className="gap-1.5 text-xs font-bold text-matchpoin-navy"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat Admin
                </Button>
              </a>
            ) : (
              <span title="Nomor admin belum tersedia" className="inline-flex">
                <Button
                  variant="tennis"
                  disabled
                  title="Nomor admin belum tersedia"
                  className="gap-1.5 text-xs font-bold text-matchpoin-navy"
                >
                  <MessageCircle className="h-4 w-4" />
                  Chat Admin
                </Button>
              </span>
            )}
          </CardHeader>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base">Anggota Komunitas</CardTitle>
            <CardDescription className="text-xs">
              Pemain yang terdaftar di komunitas ini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {members.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">
                Belum ada anggota komunitas.
              </p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {members.map((member) => {
                  const name = member.full_name || "Pemain";
                  return (
                    <li
                      key={member.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-matchpoin-navy text-xs font-bold text-matchpoin-tennis">
                        {initialOf(name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-slate-800">
                          {name}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          {member.role === "host" ? "Host" : "Pemain"} · Bergabung{" "}
                          {formatIndonesianDate(member.joined_at, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
