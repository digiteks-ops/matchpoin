"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertCircle, MapPin, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { fetchMySqlPublicPlayers, type MySqlPublicPlayer } from "@/lib/mysql/public-player-client";

export default function MySqlPlayersPage() {
  const [players, setPlayers] = useState<MySqlPublicPlayer[]>([]);
  const [search, setSearch] = useState("");
  const [province, setProvince] = useState("all");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchMySqlPublicPlayers(500)
      .then(({ players: result }) => setPlayers(result))
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Gagal memuat pemain."))
      .finally(() => setIsLoading(false));
  }, []);

  const provinces = useMemo(
    () => Array.from(new Set(players.map((player) => player.province).filter((value): value is string => Boolean(value)))).sort(),
    [players]
  );
  const filtered = useMemo(() => players.filter((player) => {
    const query = search.trim().toLowerCase();
    const matchesQuery =
      !query ||
      player.displayName.toLowerCase().includes(query) ||
      player.fullName.toLowerCase().includes(query) ||
      (player.bio?.toLowerCase().includes(query) ?? false);
    return matchesQuery && (province === "all" || player.province === province);
  }), [players, search, province]);

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto space-y-6 px-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase text-matchpoin-navy"><Users className="h-3.5 w-3.5 text-matchpoin-tennis" />Direktori</div>
            <h1 className="mt-2 text-3xl font-extrabold text-slate-900">Cari Pemain</h1>
            <p className="mt-1 text-sm text-slate-500">Profil publik pemain MATCHPOIN.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/mysql/leaderboard"><Button variant="outline">Leaderboard</Button></Link>
            <Link href="/mysql/matches"><Button variant="tennis" className="font-bold text-matchpoin-navy">Pertandingan</Button></Link>
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari nama atau bio pemain..." className="bg-slate-50 pl-9" />
          </div>
          <select aria-label="Filter provinsi" value={province} onChange={(event) => setProvince(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm sm:w-64">
            <option value="all">Semua provinsi</option>
            {provinces.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
        {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-48 animate-pulse rounded-2xl border bg-white" />)}</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Belum ada pemain" description="Belum ada pemain yang sesuai dengan pencarian." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((player) => (
              <Card key={player.userId} className="overflow-hidden">
                <CardHeader className="flex flex-row items-center gap-3 p-4">
                  {player.avatarUrl ? <Image src={player.avatarUrl} alt="" width={48} height={48} className="rounded-full object-cover" /> : <div className="flex h-12 w-12 items-center justify-center rounded-full bg-matchpoin-navy text-lg font-bold text-white">{player.displayName.charAt(0).toUpperCase()}</div>}
                  <div className="min-w-0 flex-1">
                    <Link href={`/mysql/players/${player.userId}`} className="block truncate font-bold text-slate-900 hover:text-matchpoin-navy">{player.displayName}</Link>
                    <p className="flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3 w-3" />{[player.cityName, player.province].filter(Boolean).join(", ") || "Lokasi belum diisi"}</p>
                  </div>
                  {player.isVerifiedPlayer && <Badge variant="success">Terverifikasi</Badge>}
                </CardHeader>
                <CardContent className="space-y-3 px-4 pb-4 pt-0">
                  {player.bio && <p className="line-clamp-2 text-xs text-slate-600">{player.bio}</p>}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="secondary">{player.selfAssessedLevel || "Level belum diatur"}</Badge>
                    {player.playFrequency && <Badge variant="secondary">{player.playFrequency}</Badge>}
                    <Badge variant="secondary">{player.preferredHand === "left" ? "Kidal" : "Kanan"}</Badge>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                    {player.showRating ? (
                      <div><p className="text-[10px] uppercase text-slate-400">Rating</p><p className="font-extrabold text-matchpoin-navy">{(player.currentRating ?? 1).toFixed(2)}{player.isProvisional && <span className="ml-1 text-xs font-normal text-amber-700">Provisori</span>}</p></div>
                    ) : <p className="text-xs text-slate-400">Rating disembunyikan</p>}
                    <Link href={`/mysql/players/${player.userId}`}><Button variant="outline" size="sm">Lihat profil</Button></Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
