import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getOpenMatches, type OpenMatchDetail } from "@/lib/services/match-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Calendar, MapPin, Plus, Users, Clock, Trophy, AlertCircle } from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";
import { ERROR_LOAD, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function MatchesPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let matches: OpenMatchDetail[] = [];
  let loadError: string | null = null;

  try {
    matches = await getOpenMatches();
  } catch (err) {
    logError("matches.list", err);
    loadError = ERROR_LOAD;
  }

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Calendar className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Open Match</span>
            </div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">Pertandingan Terbuka</h1>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Atur jadwal tandingmu sendiri atau gabung pertandingan yang sedang mencari pemain.
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
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {matches.map((match) => {
              const isFull = match.currentPlayers >= match.maxPlayers;
              return (
                <Link
                  key={match.id}
                  href={`/matches/${match.id}`}
                  className="block bg-white rounded-2xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition-shadow space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-bold font-heading text-slate-900 truncate">{match.title}</h2>
                      <p className="text-xs text-slate-500 mt-0.5">{match.categoryLabel}</p>
                    </div>
                    <Badge
                      variant={isFull ? "secondary" : "tennis"}
                      className={isFull ? "text-[10px]" : "text-[10px] text-matchpoin-navy"}
                    >
                      {isFull ? "Penuh" : "Open"}
                    </Badge>
                  </div>

                  <div className="space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="capitalize">
                        {formatIndonesianDate(match.matchDate, { weekday: "short", day: "numeric", month: "short" })}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)} WIB
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="line-clamp-1">{match.courtName}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs gap-3">
                    <span className="flex items-center gap-1.5 text-slate-500 shrink-0">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <strong className="text-slate-800">{match.currentPlayers}</strong>/{match.maxPlayers} pemain
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-600 min-w-0 justify-end text-right">
                      <Trophy className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate"><span className="text-slate-400">Penyelenggara:</span> <strong className="text-slate-800">{match.organizerName}</strong></span>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}