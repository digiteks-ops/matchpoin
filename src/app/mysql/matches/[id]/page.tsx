import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseSession } from "@/lib/auth/supabase-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Clock, MapPin, Trophy, Users } from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlMatchDetail, getOpenMatchDetail } from "@/lib/mysql/match-service";
import { JoinMySqlMatchButton } from "./join-button";
import { MatchManagerActions } from "./manage-actions";

export const dynamic = "force-dynamic";

export default async function MySqlMatchDetailPage({ params }: { params: { id: string } }) {
  const session = await getSupabaseSession();
  const connection = await connectToMySql();
  let match;
  try {
    match = await getOpenMatchDetail(connection, params.id);
    if (!match && session?.user?.id) {
      match = await getMySqlMatchDetail(connection, params.id, session.user.id);
    }
  } finally {
    await connection.end();
  }
  if (!match) notFound();

  const userId = session?.user?.id;
  const isOrganizer = userId === match.organizerId;
  const alreadyJoined = Boolean(userId && match.participants.some((participant) => participant.userId === userId));
  const isInvited = Boolean(userId && match.invitedPlayers.some((participant) => participant.userId === userId));
  const canJoin = Boolean(userId && !match.isPrivate && !isOrganizer && !alreadyJoined && !isInvited && match.availableSlots > 0 && match.status === "open");
  const loginUrl = `/mysql/auth/login?redirectTo=${encodeURIComponent(`/mysql/matches/${match.id}`)}`;

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto grid max-w-5xl gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Link href="/mysql/matches" className="text-xs font-semibold text-slate-600 hover:text-matchpoin-navy">← Kembali ke pertandingan</Link>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-2xl">{match.title}</CardTitle>
                  <CardDescription className="mt-2">{match.categoryLabel}</CardDescription>
                </div>
                <Badge variant={match.availableSlots > 0 ? "tennis" : "secondary"}>
                  {match.availableSlots > 0 ? `${match.availableSlots} slot tersedia` : "Penuh"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {match.description && <p className="whitespace-pre-wrap text-sm text-slate-700">{match.description}</p>}
              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <p className="flex items-center gap-2"><Calendar className="h-4 w-4 text-slate-400" />{formatIndonesianDate(match.matchDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
                <p className="flex items-center gap-2"><Clock className="h-4 w-4 text-slate-400" />{formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)} WITA · {match.durationMinutes} menit · Selesai ~{(() => { const start = `1970-01-01T${match.startTime}+08:00`; const end = new Date(new Date(start).getTime() + match.durationMinutes * 60 * 1000); return end.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false }); })()} WITA</p>
                <p className="flex items-center gap-2 sm:col-span-2"><MapPin className="h-4 w-4 shrink-0 text-slate-400" />{match.courtAddress || match.courtName}</p>
                <p className="flex items-center gap-2"><Trophy className="h-4 w-4 text-slate-400" />Rating {match.minRating.toFixed(1)}–{match.maxRating.toFixed(1)}</p>
                <p className="flex items-center gap-2"><Users className="h-4 w-4 text-slate-400" />Host: {match.organizerName}</p>
              </div>
              <p className="text-xs text-slate-500">{match.umpireOption === "dengan_wasit" ? `Dengan wasit${match.umpireName ? `: ${match.umpireName}` : ""}` : "Tanpa wasit"}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pemain terdaftar</CardTitle>
              <CardDescription className="text-xs">{match.currentPlayers} dari {match.maxPlayers} pemain</CardDescription>
            </CardHeader>
            <CardContent>
              {match.participants.length === 0 ? (
                <p className="text-sm text-slate-500">Belum ada pemain yang terdaftar.</p>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {match.participants.map((participant) => (
                    <li key={participant.userId} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-matchpoin-navy text-sm font-bold text-white">{participant.fullName.charAt(0).toUpperCase()}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{participant.fullName}</p>
                        <p className="text-xs text-slate-500">{participant.isOrganizer ? "Penyelenggara" : "Pemain"} · {participant.showRating === false ? "Rating disembunyikan" : `Rating ${participant.rating.toFixed(2)}`}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Partisipasi</CardTitle>
              <CardDescription className="text-xs">Tindakan ini tersimpan pada database baru.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isOrganizer ? (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Anda adalah penyelenggara pertandingan ini.</p>
              ) : alreadyJoined ? (
                <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">Anda sudah terdaftar pada pertandingan ini.</p>
              ) : isInvited ? (
                <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800"><p>Anda memiliki undangan pertandingan ini.</p><Link href="/mysql/invites" className="font-semibold underline">Tanggapi undangan</Link></div>
              ) : !userId ? (
                <Link href={loginUrl}><Button className="w-full font-bold">Masuk untuk Bergabung</Button></Link>
              ) : canJoin ? (
                <JoinMySqlMatchButton matchId={match.id} />
              ) : (
                <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{match.isPrivate ? "Pertandingan ini privat dan hanya dapat diikuti melalui undangan." : "Pendaftaran pertandingan ini sudah ditutup atau slot telah penuh."}</p>
              )}
              {isOrganizer && <MatchManagerActions matchId={match.id} isOrganizer={isOrganizer} isActive={match.status === "open" || match.status === "full"} canInvite={match.status === "open" && match.availableSlots > 0} pendingRequests={match.pendingRequests} invitedPlayers={match.invitedPlayers} excludedUserIds={[...match.participants, ...match.pendingRequests, ...match.invitedPlayers].map((participant) => participant.userId)} />}
              <Link href="/mysql/my-matches" className="block text-center text-xs font-semibold text-matchpoin-navy hover:underline">Pertandingan saya</Link>
              <Link href="/mysql/dashboard" className="block text-center text-xs font-semibold text-matchpoin-navy hover:underline">Kembali ke dashboard MySQL</Link>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
