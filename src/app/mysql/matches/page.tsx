import Link from "next/link";
import { getSupabaseSession } from "@/lib/auth/supabase-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Calendar, MapPin, Plus, Users } from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getOpenMatchList } from "@/lib/mysql/match-service";
import { logError } from "@/lib/errors";
import type { OpenMatchDetail } from "@/lib/matches/constants";

export const dynamic = "force-dynamic";

export default async function MySqlMatchesPage() {
  const session = await getSupabaseSession();
  let matches: OpenMatchDetail[] = [];
  let loadError = false;
  const connection = await connectToMySql();
  try {
    matches = await getOpenMatchList(connection, 100);
  } catch (error) {
    logError("mysql.matches.page", error);
    loadError = true;
  } finally {
    await connection.end();
  }

  const loginUrl = `/mysql/auth/login?redirectTo=${encodeURIComponent("/mysql/matches/new")}`;
  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto space-y-8 px-4 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-matchpoin-navy">
              <Calendar className="h-3.5 w-3.5 text-matchpoin-tennis" />
              Open Match
            </div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Pertandingan terbuka</h1>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 sm:text-sm">
              Temukan pertandingan ganda terbuka yang tersimpan di Matchpoin.
            </p>
          </div>
          <Link href={session?.user?.id ? "/mysql/matches/new" : loginUrl}>
            <Button variant="tennis" className="gap-2 font-bold text-matchpoin-navy">
              <Plus className="h-4 w-4" />
              {session?.user?.id ? "Buat Pertandingan" : "Masuk untuk Membuat"}
            </Button>
          </Link>
        </div>

        {loadError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Daftar pertandingan gagal dimuat. Coba muat ulang halaman.
          </div>
        ) : matches.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="Belum Ada Pertandingan"
            description="Buat pertandingan ganda terbuka pertama atau periksa kembali nanti."
            action={
              <Link href={session?.user?.id ? "/mysql/matches/new" : loginUrl}>
                <Button variant="tennis" size="sm" className="font-bold text-matchpoin-navy">
                  {session?.user?.id ? "Buat Pertandingan" : "Masuk untuk Membuat"}
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {matches.map((match) => {
              const isFull = match.availableSlots <= 0;
              return (
                <Link
                  key={match.id}
                  href={`/mysql/matches/${match.id}`}
                  className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-bold text-slate-900 sm:text-lg">{match.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">{match.categoryLabel}</p>
                    </div>
                    <Badge variant={isFull ? "secondary" : "tennis"} className="shrink-0 text-[10px]">
                      {isFull ? "Penuh" : "Open"}
                    </Badge>
                  </div>
                  <div className="mt-4 space-y-2 text-xs text-slate-600">
                    <div className="flex items-start gap-2">
                      <Calendar className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>
                        {formatIndonesianDate(match.matchDate, { weekday: "short", day: "numeric", month: "short" })}
                        <span className="mx-1.5 text-slate-300">•</span>
                        {formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)} WITA
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span className="line-clamp-2">{match.courtName}</span>
                    </div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-xs">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <Users className="h-3.5 w-3.5 text-slate-400" />
                      <strong className="text-slate-800">{match.currentPlayers}</strong>/{match.maxPlayers} pemain
                      {!isFull && <span className="text-[10px] font-semibold text-emerald-700">({match.availableSlots} slot)</span>}
                    </span>
                    <span className="truncate text-right text-slate-600">
                      Host: <strong className="text-slate-800">{match.organizerName}</strong>
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        <p className="text-center text-[11px] text-slate-400">Daftar ini hanya membaca pertandingan Matchpoin, bukan data Supabase.</p>
      </div>
    </div>
  );
}
