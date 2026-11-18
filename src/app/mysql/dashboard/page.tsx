import Link from "next/link";
import { redirect } from "next/navigation";
import { Activity, Calendar, Edit, Mail, MapPin, Trophy, UserRound, Users } from "lucide-react";
import { getSupabaseSession } from "@/lib/auth/supabase-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlPlayerStats } from "@/lib/mysql/player-history-service";
import { getMySqlProfile } from "@/lib/mysql/profile-service";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function MySqlDashboardPage() {
  const session = await getSupabaseSession();
  if (!session?.user?.id) {
    redirect("/mysql/auth/login?redirectTo=%2Fmysql%2Fdashboard");
  }

  const connection = await connectToMySql();
  let profile;
  let stats;
  try {
    [profile, stats] = await Promise.all([
      getMySqlProfile(connection, session.user.id),
      getMySqlPlayerStats(connection, session.user.id),
    ]);
  } finally {
    await connection.end();
  }
  if (!profile) redirect("/mysql/auth/login");

  const displayName =
    profile.user.full_name || profile.profile?.display_name || "Pemain MATCHPOIN";
  const rating = stats.currentRating;

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto max-w-6xl space-y-5 px-4 sm:px-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-slate-900 sm:text-2xl">Halo, {displayName}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
              <MapPin className="h-3.5 w-3.5" />
              {profile.city ? `${profile.city.name}, ${profile.city.province}` : "Lokasi belum diatur"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/mysql/profile">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <UserRound className="h-4 w-4" />Profil
              </Button>
            </Link>
            <Link href="/mysql/profile/edit">
              <Button variant="tennis" size="sm" className="gap-1.5 text-xs font-bold text-matchpoin-navy">
                <Edit className="h-4 w-4" />Lengkapi Profil
              </Button>
            </Link>
            <Link href="/mysql/matches">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Calendar className="h-4 w-4" />Pertandingan
              </Button>
            </Link>
            <Link href="/mysql/tournaments">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Trophy className="h-4 w-4" />Liga
              </Button>
            </Link>
            <Link href="/mysql/players">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Users className="h-4 w-4" />Pemain
              </Button>
            </Link>
            <Link href="/mysql/my-matches">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Calendar className="h-4 w-4" />Pertandingan saya
              </Button>
            </Link>
            <Link href="/mysql/invites">
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Mail className="h-4 w-4" />Undangan
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Rating</span>
                {stats.totalMatches === 0 && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">Provisori</Badge>}
              </div>
              <p className="mt-1 text-2xl font-extrabold text-matchpoin-navy">{rating.toFixed(2)}</p>
              <p className="text-[11px] text-slate-500">{stats.totalMatches === 0 ? "Rating awal" : "MATCHPOIN Rating"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Pertandingan</span>
              <p className="mt-1 text-2xl font-extrabold text-slate-800">{stats.totalMatches}</p>
              <p className="text-[11px] text-slate-500">{stats.wins} menang · {stats.losses} kalah</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Win Rate</span>
              <p className="mt-1 text-2xl font-extrabold text-emerald-600">{stats.winPercentage}%</p>
              <p className="text-[11px] text-slate-500">Peak {stats.bestRating.toFixed(2)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-matchpoin-tennis" />
              Pertandingan dan riwayat
            </CardTitle>
            <CardDescription className="text-xs">Pertandingan yang terhubung ke akun MySQL ini.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentMatches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
                <Trophy className="mx-auto h-6 w-6 text-slate-400" />
                <p className="mt-2 text-sm font-semibold text-slate-700">Belum ada pertandingan</p>
                <p className="mt-1 text-xs text-slate-500">Pertandingan baru akan muncul di sini setelah akun MySQL Anda bergabung.</p>
              </div>
            ) : (
              <ul className="space-y-2">
                {stats.recentMatches.map((match) => (
                  <li key={`${match.id}-${match.matchDate}`} className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-800">{match.title}</p>
                      <Link
                      href={
                        match.resultStatus !== "none" || match.status === "in_progress" || match.status === "completed"
                          ? `/mysql/matches/${match.id}/result`
                          : `/mysql/matches/${match.id}`
                      }
                      className="mt-1 inline-block text-[11px] font-semibold text-matchpoin-navy hover:underline"
                      >
                      {match.resultStatus !== "none" || match.status === "in_progress" || match.status === "completed"
                        ? "Lihat / tinjau hasil"
                        : "Detail pertandingan"}
                      </Link>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {formatIndonesianDate(match.matchDate, { day: "numeric", month: "short", year: "numeric" })}
                        {" · "}
                        {formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)}
                        {" · "}
                        {match.courtName}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <Badge variant="secondary" className="text-[10px]">{match.categoryLabel}</Badge>
                      <span className="min-w-12 text-right text-xs font-bold text-slate-800">
                        {match.scoreA !== null && match.scoreB !== null ? `${match.scoreA}–${match.scoreB}` : match.status}
                      </span>
                      <span className={`text-[10px] font-semibold ${match.result === "win" ? "text-emerald-600" : match.result === "loss" ? "text-rose-600" : "text-slate-500"}`}>
                        {match.result === "win" ? "Menang" : match.result === "loss" ? "Kalah" : match.resultStatus === "pending" ? "Menunggu hasil" : "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-[11px] text-slate-400">
          Data Matchpoin. Data Supabase lama tidak dipindahkan.
        </p>
      </div>
    </div>
  );
}
