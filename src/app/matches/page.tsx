import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { getOpenMatches, type OpenMatchDetail } from "@/lib/services/match-service";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Calendar, MapPin, Plus, Users, AlertCircle } from "lucide-react";
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
      </div>
    </div>
  );
}