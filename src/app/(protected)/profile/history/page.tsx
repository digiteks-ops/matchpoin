import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPlayerStats, type PlayerStats } from "@/lib/services/match-history-service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowLeft, Calendar, Trophy } from "lucide-react";
import { formatIndonesianDate } from "@/lib/utils";
import { ERROR_LOAD, logError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function ProfileHistoryPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/profile/history");
  }

  let stats: PlayerStats | null = null;
  let loadError: string | null = null;

  try {
    stats = await getPlayerStats(user.id, 100);
  } catch (err) {
    logError("profile.history", err);
    loadError = ERROR_LOAD;
  }

  const matches = stats?.recentMatches ?? [];

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-4xl px-4 sm:px-6 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1.5">
            <Link href="/profile" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-matchpoin-navy">
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali ke Profil
            </Link>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">Riwayat Pertandingan</h1>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500 sm:text-sm">
              Seluruh pertandingan yang kamu ikuti beserta hasil dan perubahan rating MPR.
            </p>
          </div>
          <Link href="/matches">
            <Button variant="outline" size="sm" className="text-xs">
              Cari Pertandingan
            </Button>
          </Link>
        </div>

        {loadError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {loadError}
          </div>
        )}

        {!loadError && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="border-slate-200">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Total</p>
                <p className="text-xl font-extrabold font-heading text-slate-800">{stats.totalMatches}</p>
              </CardContent>
            </Card>
            <Card className="border-emerald-100 bg-emerald-50">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase font-semibold text-emerald-600">Menang</p>
                <p className="text-xl font-extrabold font-heading text-emerald-700">{stats.wins}</p>
              </CardContent>
            </Card>
            <Card className="border-rose-100 bg-rose-50">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase font-semibold text-rose-600">Kalah</p>
                <p className="text-xl font-extrabold font-heading text-rose-700">{stats.losses}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Win Rate</p>
                <p className="text-xl font-extrabold font-heading text-matchpoin-navy">{stats.winPercentage}%</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold text-slate-800">Daftar Pertandingan</CardTitle>
            <CardDescription className="text-xs">
              {matches.length > 0 ? `${matches.length} pertandingan terakhir.` : "Belum ada pertandingan."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!loadError && matches.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="Belum Ada Riwayat"
                description="Pertandingan yang sudah kamu mainkan akan muncul di sini."
                action={
                  <Link href="/matches">
                    <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold">
                      Cari Pertandingan
                    </Button>
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2">
                {matches.map((entry) => (
                  <li key={`${entry.id}-${entry.matchDate}`}>
                    <Link
                      href={`/matches/${entry.id}`}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 p-3 text-xs hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{entry.title}</p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                          <span>{entry.categoryLabel}</span>
                          <span>·</span>
                          <span>{formatIndonesianDate(entry.matchDate, { day: "numeric", month: "short", year: "numeric" })}</span>
                          <span>·</span>
                          <span className="truncate">{entry.courtName}</span>
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {entry.scoreA !== null && entry.scoreB !== null ? (
                          <p className="font-bold text-slate-800">{entry.scoreA}–{entry.scoreB}</p>
                        ) : (
                          <p className="text-slate-400">-</p>
                        )}
                        {entry.ratingChange !== null && (
                          <p
                            className={`text-[10px] font-bold ${
                              entry.ratingChange > 0
                                ? "text-emerald-600"
                                : entry.ratingChange < 0
                                ? "text-rose-600"
                                : "text-slate-500"
                            }`}
                            title={
                              entry.ratingBefore !== null && entry.ratingAfter !== null
                                ? `${Math.round(entry.ratingBefore)} → ${Math.round(entry.ratingAfter)}`
                                : undefined
                            }
                          >
                            MPR {entry.ratingChange > 0 ? "+" : ""}
                            {Math.round(entry.ratingChange)}
                          </p>
                        )}
                        <p
                          className={`text-[10px] font-semibold ${
                            entry.result === "win"
                              ? "text-emerald-600"
                              : entry.result === "loss"
                              ? "text-rose-600"
                              : "text-slate-400"
                          }`}
                        >
                          {entry.result === "win"
                            ? "Menang"
                            : entry.result === "loss"
                            ? "Kalah"
                            : entry.resultStatus === "pending"
                            ? "Pending"
                            : "—"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
