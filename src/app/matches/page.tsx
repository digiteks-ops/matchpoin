import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getOpenMatches, type OpenMatchDetail } from "@/lib/services/match-service";
import {
  getRecentMatchActivity,
  type MatchActivityEntry,
} from "@/lib/services/match-activity-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity, Calendar, MapPin, Plus, Trophy, Users, AlertCircle } from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";
import { ERROR_LOAD, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

function ActivityTeamLine({ entry, team }: { entry: MatchActivityEntry; team: 1 | 2 }) {
  const side = entry.teams[team === 1 ? 0 : 1];
  const names =
    side.players.length > 0
      ? side.players.map((player) => player.name).join(" & ")
      : "Pemain belum tercatat";

  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs ${
        side.isWinner ? "bg-emerald-50 text-emerald-900" : "text-slate-700"
      }`}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {side.isWinner && <Trophy className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
        <span className={`truncate ${side.isWinner ? "font-bold" : "font-medium"}`}>{names}</span>
      </span>
      <span className="shrink-0 font-heading text-sm font-extrabold tabular-nums">
        {side.score ?? "-"}
      </span>
    </div>
  );
}

export default async function MatchesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [openResult, activityResult] = await Promise.allSettled([
    getOpenMatches(),
    getRecentMatchActivity(8),
  ]);

  let matches: OpenMatchDetail[] = [];
  let loadError: string | null = null;
  if (openResult.status === "fulfilled") {
    matches = openResult.value;
  } else {
    logError("matches.list", openResult.reason);
    loadError = ERROR_LOAD;
  }

  let activity: MatchActivityEntry[] = [];
  let activityError: string | null = null;
  if (activityResult.status === "fulfilled") {
    activity = activityResult.value;
  } else {
    logError("matches.activity.page", activityResult.reason);
    activityError = ERROR_LOAD;
  }

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Calendar className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Open Match</span>
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Pertandingan terbuka</h1>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 sm:text-sm">
              Temukan lawan atau buka slot untuk pemain lain.
            </p>
          </div>

          {user ? (
            <Link href="/matches/new">
              <Button variant="tennis" className="text-matchpoin-navy font-bold gap-2">
                <Plus className="w-4 h-4" />
                Buat Pertandingan
              </Button>
            </Link>
          ) : (
            <Link href="/login?redirectTo=/matches/new">
              <Button variant="tennis" className="text-matchpoin-navy font-bold">
                Masuk untuk Membuat
              </Button>
            </Link>
          )}
        </div>

        {loadError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
        )}

        {!loadError && matches.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="Belum Ada Pertandingan Terbuka"
            description="Jadilah yang pertama membuat pertandingan dan undang pemain lain di Makassar."
            action={
              user ? (
                <Link href="/matches/new">
                  <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold">
                    Buat Pertandingan
                  </Button>
                </Link>
              ) : (
                <Link href="/register">
                  <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold">
                    Daftar Pemain
                  </Button>
                </Link>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {matches.map((match) => {
              const isFull = match.currentPlayers >= match.maxPlayers;
              return (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate font-heading text-base font-bold text-slate-900 sm:text-lg">{match.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">{match.categoryLabel}</p>
                    </div>
                    <Badge variant={isFull ? "secondary" : "tennis"} className="shrink-0 text-[10px]">
                      {isFull ? "Penuh" : "Open"}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2 text-xs text-slate-600">
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="min-w-0">
                        <span className="capitalize">{formatIndonesianDate(match.matchDate, { weekday: "short", day: "numeric", month: "short" })}</span>
                        <span className="mx-1.5 text-slate-300">•</span>
                        <span className="whitespace-nowrap">{formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)} WIB</span>
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="line-clamp-2">{match.courtName}</span>
                    </div>
                  </div>

                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
                    <span className="flex shrink-0 items-center gap-1.5 text-slate-500">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <strong className="text-slate-800">{match.currentPlayers}</strong>/{match.maxPlayers} pemain
                      {match.availableSlots > 0 && (
                        <span className="ml-1 text-[10px] text-emerald-700 font-semibold">({match.availableSlots} tersedia)</span>
                      )}
                    </span>
                    <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-slate-600">
                      {match.organizerAvatarUrl ? (
                        <Image
                          src={match.organizerAvatarUrl}
                          alt={match.organizerName}
                          width={20}
                          height={20}
                          className="h-5 w-5 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-bold text-slate-500">
                          {match.organizerName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="truncate"><span className="text-slate-400">Host:</span> <strong className="text-slate-800">{match.organizerName}</strong></span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        <section className="space-y-4">
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 font-heading text-xl font-extrabold tracking-tight text-slate-900">
              <Activity className="h-5 w-5 text-matchpoin-tennis" />
              Aktivitas Pertandingan Terbaru
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-slate-500 sm:text-sm">
              Pertandingan yang sudah selesai, pemain yang bertanding, dan hasilnya. Terbuka untuk
              dilihat semua pemain.
            </p>
          </div>

          {activityError && (
            <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{activityError}</span>
            </div>
          )}

          {!activityError && activity.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center text-xs text-slate-500">
              Belum ada pertandingan selesai. Aktivitas akan muncul di sini setelah hasil
              pertandingan dikonfirmasi.
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {activity.map((entry) => (
                <Link
                  key={entry.id}
                  href={`/matches/${entry.id}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-heading text-sm font-bold text-slate-900">
                        {entry.title}
                      </h3>
                      <p className="mt-0.5 text-[11px] text-slate-500">{entry.categoryLabel}</p>
                    </div>
                    <Badge
                      variant={entry.resultStatus === "confirmed" ? "success" : "secondary"}
                      className="shrink-0 text-[10px]"
                    >
                      {entry.resultStatus === "confirmed"
                        ? "Selesai"
                        : entry.resultStatus === "under_review"
                        ? "Ditinjau"
                        : "Menunggu konfirmasi"}
                    </Badge>
                  </div>

                  <div className="mt-3 space-y-1">
                    <ActivityTeamLine entry={entry} team={1} />
                    <div className="flex items-center gap-2 px-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      <span className="h-px flex-1 bg-slate-100" />
                      vs
                      <span className="h-px flex-1 bg-slate-100" />
                    </div>
                    <ActivityTeamLine entry={entry} team={2} />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3 text-slate-400" />
                      {formatIndonesianDate(entry.matchDate, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span className="truncate">{entry.courtName}</span>
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}