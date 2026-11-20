import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InviteActions } from "@/components/dashboard/invite-actions";
import { createClient } from "@/lib/supabase/server";
import { getMyMatches } from "@/lib/services/match-service";
import { getPendingInvites } from "@/lib/services/invite-service";
import { ensurePlayerRecords } from "@/lib/services/player-sync";
import { getPlayerStats } from "@/lib/services/match-history-service";
import { getUserRoles } from "@/lib/supabase/rbac-service";
import { logError } from "@/lib/errors";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";
import type { DbUser, PlayerProfile, PlayerRating } from "@/types/database.types";
import {
  Activity,
  Calendar,
  Clock,
  Edit,
  MapPin,
  Plus,
  Send,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  full: "Penuh",
  in_progress: "Berlangsung",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

function ratingCategory(rating: number) {
  if (rating >= 8.5) return "Advanced";
  if (rating >= 6.5) return "Upper Intermediate";
  if (rating >= 4.5) return "Low Intermediate";
  if (rating >= 3.0) return "Upper Beginner";
  return "Beginner";
}

export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) redirect("/login?redirectTo=/dashboard");

  // Admin accounts use the dedicated admin area; players keep this dashboard.
  let isAdminAccount = false;
  try {
    const roles = await getUserRoles(authUser.id);
    isAdminAccount = roles.includes("admin") || roles.includes("super_admin");
  } catch (error) {
    logError("dashboard.roles", error, { userId: authUser.id });
  }
  if (isAdminAccount) redirect("/admin");

  await ensurePlayerRecords(
    authUser.id,
    authUser.email ?? "",
    (authUser.user_metadata?.full_name as string | undefined) ??
      (authUser.user_metadata?.name as string | undefined)
  );

  const [userResult, profileResult, ratingResult] = await Promise.all([
    supabase.from("users").select("full_name, email, avatar_url").eq("id", authUser.id).maybeSingle(),
    supabase.from("player_profiles").select("display_name, completion_score").eq("user_id", authUser.id).maybeSingle(),
    supabase.from("player_ratings").select("current_rating, peak_rating, matches_played, wins, losses").eq("user_id", authUser.id).maybeSingle(),
  ]);

  const [stats, myMatches, invites] = await Promise.all([
    getPlayerStats(authUser.id).catch((err) => {
      logError("dashboard.stats", err, { userId: authUser.id });
      return null;
    }),
    getMyMatches(authUser.id, 5).catch((err) => {
      logError("dashboard.matches", err, { userId: authUser.id });
      return [];
    }),
    getPendingInvites(authUser.id, 5).catch((err) => {
      logError("dashboard.invites", err, { userId: authUser.id });
      return [];
    }),
  ]);

  const dbUser = userResult.data as Pick<DbUser, "full_name" | "email" | "avatar_url"> | null;
  const profile = profileResult.data as Pick<PlayerProfile, "display_name" | "completion_score"> | null;
  const rating = ratingResult.data as
    | Pick<PlayerRating, "current_rating" | "peak_rating" | "matches_played" | "wins" | "losses">
    | null;

  const currentRating = Number(rating?.current_rating ?? 1);
  const matchesPlayed = rating?.matches_played ?? stats?.totalMatches ?? 0;
  const matchesWon = rating?.wins ?? stats?.wins ?? 0;
  const winRate = matchesPlayed > 0 ? Math.round((matchesWon / matchesPlayed) * 100) : 0;
  const displayName = dbUser?.full_name || profile?.display_name || "Pemain";
  const recent = stats?.recentMatches ?? [];

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto px-4 sm:px-6 max-w-6xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-5 rounded-2xl border border-slate-200/90 shadow-sm">
          <div>
            <h1 className="text-xl sm:text-2xl font-extrabold font-heading text-slate-900">
              Halo, {displayName}
            </h1>
            <p className="text-slate-500 text-xs sm:text-sm mt-0.5">
              Atur jadwal tanding dan pantau rating kamu.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/players">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Users className="h-4 w-4" />
                Cari Lawan
              </Button>
            </Link>
            <Link href="/matches/new">
              <Button variant="tennis" size="sm" className="gap-1.5 text-xs font-bold text-matchpoin-navy">
                <Plus className="h-4 w-4" />
                Buat Pertandingan
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Rating</span>
                {matchesPlayed === 0 && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                    Provisori
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-2xl font-extrabold font-heading text-matchpoin-navy">
                {currentRating.toFixed(2)}
              </p>
              <p className="text-[11px] text-slate-500">{ratingCategory(currentRating)}</p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pertandingan</span>
              <p className="mt-1 text-2xl font-extrabold font-heading text-slate-800">{matchesPlayed}</p>
              <p className="text-[11px] text-slate-500">
                {matchesWon} menang · {Math.max(0, matchesPlayed - matchesWon)} kalah
              </p>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardContent className="p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Win Rate</span>
              <p className="mt-1 text-2xl font-extrabold font-heading text-emerald-600">{winRate}%</p>
              <p className="text-[11px] text-slate-500">Peak {Number(rating?.peak_rating ?? currentRating).toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <Card className="border-slate-200">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base">Pertandingan Mendatang</CardTitle>
                  <CardDescription className="text-xs">Jadwal yang sudah kamu ikuti.</CardDescription>
                </div>
                <Badge variant="secondary" className="text-[10px]">
                  {myMatches.length}
                </Badge>
              </CardHeader>
              <CardContent>
                {myMatches.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <Calendar className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-xs text-slate-500">
                      Belum ada jadwal. Buat pertandingan atau cari lawan.
                    </p>
                    <Link href="/matches" className="mt-3 inline-block">
                      <Button size="sm" variant="outline" className="text-xs">
                        Lihat Pertandingan
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {myMatches.map((match) => (
                      <li key={match.id}>
                        <Link
                          href={`/matches/${match.id}`}
                          className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-800">{match.title}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                              <span>{formatIndonesianDate(match.matchDate, { day: "numeric", month: "short" })}</span>
                              <span>·</span>
                              <Clock className="h-3 w-3" />
                              <span>{formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)} WIB</span>
                              <span>·</span>
                              <MapPin className="h-3 w-3" />
                              <span className="truncate">{match.courtName}</span>
                            </p>
                          </div>
                          <Badge variant="secondary" className="shrink-0 text-[10px]">
                            {STATUS_LABEL[match.status] ?? match.status}
                          </Badge>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Riwayat Terakhir</CardTitle>
                <CardDescription className="text-xs">
                  Hasil terkonfirmasi dan yang masih menunggu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {recent.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
                    <Activity className="mx-auto h-6 w-6 text-slate-400" />
                    <p className="mt-2 text-xs text-slate-500">Belum ada riwayat pertandingan.</p>
                  </div>
                ) : (
                  <ul className="space-y-1.5">
                    {recent.map((entry) => (
                      <li key={`${entry.id}-${entry.matchDate}`}>
                        <Link
                          href={`/matches/${entry.id}`}
                          className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 hover:bg-slate-50"
                        >
                          <span
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                              entry.result === "win"
                                ? "bg-emerald-100 text-emerald-700"
                                : entry.result === "loss"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-500"
                            }`}
                          >
                            {entry.result === "win" ? "W" : entry.result === "loss" ? "L" : "-"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-slate-800">{entry.title}</span>
                            <span className="block text-[10px] text-slate-400">
                              {entry.categoryLabel} · {formatIndonesianDate(entry.matchDate, { day: "numeric", month: "short" })}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="block text-xs font-bold text-slate-800">
                              {entry.scoreA !== null && entry.scoreB !== null ? `${entry.scoreA}–${entry.scoreB}` : "—"}
                            </span>
                            <span className="block text-[10px] text-slate-400">
                              {entry.resultStatus === "confirmed"
                                ? "Selesai"
                                : entry.resultStatus === "pending"
                                ? "Menunggu"
                                : entry.resultStatus === "under_review"
                                ? "Sanggah"
                                : "—"}
                            </span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-5">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Send className="h-4 w-4 text-matchpoin-tennis" />
                  Undangan
                </CardTitle>
                <CardDescription className="text-xs">Terima atau tolak ajakan bertanding.</CardDescription>
              </CardHeader>
              <CardContent>
                {invites.length === 0 ? (
                  <p className="text-xs text-slate-500">Tidak ada undangan tertunda.</p>
                ) : (
                  <ul className="space-y-2">
                    {invites.map((invite) => (
                      <li key={invite.id} className="rounded-xl border border-slate-100 p-3">
                        <Link href={`/matches/${invite.matchId}`} className="block">
                          <p className="truncate text-xs font-semibold text-slate-800">{invite.title}</p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            dari {invite.invitedByName} · {formatIndonesianDate(invite.matchDate, { day: "numeric", month: "short" })}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {invite.categoryLabel} · {invite.courtName}
                          </p>
                        </Link>
                        <div className="mt-2">
                          <InviteActions inviteId={invite.id} />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-matchpoin-tennis" />
                  Profil
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2">
                  <span className="text-slate-600">Kelengkapan</span>
                  <span className="font-bold text-matchpoin-navy">{profile?.completion_score ?? 0}%</span>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-slate-50 p-2">
                  <span className="text-slate-600">Email</span>
                  <span className="max-w-[140px] truncate font-semibold text-slate-800">{dbUser?.email ?? "-"}</span>
                </div>
                <Link href="/profile/edit" className="block">
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                    <Edit className="h-3.5 w-3.5" />
                    Lengkapi Profil
                  </Button>
                </Link>
                <Link href="/leaderboard" className="block">
                  <Button variant="outline" size="sm" className="w-full gap-1.5 text-xs">
                    <Trophy className="h-3.5 w-3.5" />
                    Leaderboard
                  </Button>
                </Link>
                <p className="text-[10px] leading-relaxed text-slate-400">
                  Hasil pertandingan berlaku setelah dikonfirmasi lawan atau melewati batas 48 jam.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}