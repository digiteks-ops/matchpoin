"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Crown, MapPin, Medal, Search, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchMySqlPublicPlayers, type MySqlPublicPlayer } from "@/lib/mysql/public-player-client";

export default function MySqlLeaderboardPage() {
  const [players, setPlayers] = useState<MySqlPublicPlayer[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchMySqlPublicPlayers(500, "rating")
      .then(({ players: result }) => setPlayers(result.filter((player) => player.showRating)))
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Gagal memuat leaderboard."))
      .finally(() => setIsLoading(false));
  }, []);

  const ranked = useMemo(() => players
    .filter((player) => !search.trim() || player.displayName.toLowerCase().includes(search.trim().toLowerCase()))
    .sort((a, b) =>
      (b.currentRating ?? 1) - (a.currentRating ?? 1) ||
      (b.wins ?? 0) - (a.wins ?? 0) ||
      (b.matchesPlayed ?? 0) - (a.matchesPlayed ?? 0) ||
      a.displayName.localeCompare(b.displayName)
    ), [players, search]);

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto space-y-6 px-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase text-matchpoin-navy"><Trophy className="h-3.5 w-3.5 text-matchpoin-tennis" />Leaderboard</div><h1 className="mt-2 text-3xl font-extrabold text-slate-900">Peringkat Pemain</h1><p className="mt-1 text-sm text-slate-500">Rating publik dari hasil pertandingan terkonfirmasi.</p></div>
          <Link href="/mysql/players"><Button variant="outline">Cari Pemain</Button></Link>
        </div>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari pemain..." className="bg-white pl-9" /></div>
        {errorMessage && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorMessage}</div>}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-3">{[0, 1, 2].map((index) => <div key={index} className="h-36 animate-pulse rounded-2xl border bg-white" />)}</div>
        ) : ranked.length === 0 ? (
          <EmptyState icon={Trophy} title="Belum ada peringkat" description="Belum ada pemain yang menampilkan rating publik." />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              {ranked.slice(0, 3).map((player, index) => (
                <Card key={player.userId} className={index === 0 ? "bg-matchpoin-navy text-white" : ""}>
                  <CardContent className="space-y-3 p-5">
                    <div className="flex items-center justify-between"><Badge variant={index === 0 ? "tennis" : "secondary"}>#{index + 1}</Badge>{index === 0 ? <Crown className="h-5 w-5 text-matchpoin-tennis" /> : <Medal className="h-5 w-5 text-slate-400" />}</div>
                    <div><Link href={`/mysql/players/${player.userId}`} className={`font-bold hover:underline ${index === 0 ? "text-white" : "text-slate-900"}`}>{player.displayName}</Link><p className={`mt-1 flex items-center gap-1 text-xs ${index === 0 ? "text-slate-300" : "text-slate-500"}`}><MapPin className="h-3 w-3" />{player.cityName}</p></div>
                    <div className="flex items-end justify-between"><p className={`text-2xl font-extrabold ${index === 0 ? "text-matchpoin-tennis" : "text-matchpoin-navy"}`}>{(player.currentRating ?? 1).toFixed(2)}</p><p className={`text-xs ${index === 0 ? "text-slate-300" : "text-slate-500"}`}>{player.wins ?? 0}M · {player.losses ?? 0}K</p></div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {ranked.map((player, index) => (
                <div key={player.userId} className="grid grid-cols-12 items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0 sm:px-5">
                  <span className="col-span-1 text-sm font-bold text-slate-500">{index + 1}</span>
                  <div className="col-span-7 min-w-0"><Link href={`/mysql/players/${player.userId}`} className="block truncate text-sm font-semibold text-slate-900 hover:underline">{player.displayName}</Link><span className="text-[10px] text-slate-400">{player.cityName}</span></div>
                  <span className="col-span-2 text-right text-xs text-slate-500">{player.matchesPlayed ?? 0} main</span>
                  <span className="col-span-2 text-right text-sm font-extrabold text-matchpoin-navy">{(player.currentRating ?? 1).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <p className="text-center text-[11px] text-slate-400">Rating disembunyikan tidak ditampilkan pada peringkat publik.</p>
      </div>
    </div>
  );
}
