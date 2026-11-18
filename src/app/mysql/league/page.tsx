"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Loader2, Trophy, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { readErrorMessage } from "@/lib/errors";

interface Standing {
  entryId: string;
  name: string;
  province: string | null;
  cityName: string | null;
  points: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  gamesFor: number;
  gamesAgainst: number;
  gameDiff: number;
  rank: number;
  needsTiebreak: boolean;
}

interface Participant {
  userId: string;
  name: string;
  province: string | null;
  cityName: string | null;
  joinedAt: string | null;
}

interface LeagueOverview {
  league: {
    id: string;
    name: string;
    category: string;
    season: string;
    start_date: string;
    end_date: string;
    status: string;
    max_participants: number;
  } | null;
  participants: Participant[];
  standings: Standing[];
}

const categories = [
  { id: "mens_singles", label: "Tunggal putra" },
  { id: "womens_singles", label: "Tunggal putri" },
  { id: "mens_doubles", label: "Ganda putra" },
  { id: "womens_doubles", label: "Ganda putri" },
  { id: "mixed_doubles", label: "Ganda campuran" },
];

export default function MySqlLeaguePage() {
  const [category, setCategory] = useState("mens_singles");
  const [overview, setOverview] = useState<LeagueOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const loadOverview = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/mysql/leagues/${category}`);
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Gagal memuat klasemen."));
        setOverview(null);
        return;
      }
      setOverview((await response.json()) as LeagueOverview);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal memuat klasemen.");
      setOverview(null);
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-5xl space-y-6 px-4 sm:px-6">
        <Link href="/mysql/tournaments" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-matchpoin-navy"><ArrowLeft className="h-3.5 w-3.5" />Kembali ke kompetisi</Link>
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase text-matchpoin-navy"><Trophy className="h-3.5 w-3.5 text-matchpoin-tennis" />Klasemen</div>
          <h1 className="mt-2 text-3xl font-extrabold text-slate-900">MATCHPOIN League</h1>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih kategori liga">
          {categories.map((option) => (
            <button key={option.id} type="button" onClick={() => setCategory(option.id)} aria-pressed={category === option.id} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${category === option.id ? "border-matchpoin-navy bg-matchpoin-navy text-white" : "border-slate-300 bg-white text-slate-700"}`}>
              {option.label}
            </button>
          ))}
        </div>
        {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
        {isLoading ? (
          <div className="py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin" />Memuat klasemen...</div>
        ) : !overview?.league ? (
          <Card><CardContent className="py-12 text-center text-sm text-slate-500">Belum ada liga untuk kategori ini.</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><CardTitle>{overview.league.name}</CardTitle><CardDescription className="mt-1">{overview.league.season} · {overview.league.status}</CardDescription></div>
                  <Badge variant="secondary"><Users className="mr-1 h-3.5 w-3.5" />{overview.participants.length}/{overview.league.max_participants} peserta/tim</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {overview.standings.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">Klasemen akan muncul setelah hasil pertandingan dikonfirmasi.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead><tr className="border-b text-xs text-slate-500"><th className="p-3">Pos</th><th className="p-3">Pemain / Tim</th><th className="p-3">Main</th><th className="p-3">M-K</th><th className="p-3">Game</th><th className="p-3">Selisih</th><th className="p-3">Poin</th></tr></thead>
                      <tbody>{overview.standings.map((standing) => (
                        <tr key={standing.entryId} className="border-b border-slate-100 last:border-0">
                          <td className="p-3 font-bold">{standing.rank}</td>
                          <td className="p-3"><p className="font-semibold text-slate-800">{standing.name}</p><p className="text-[11px] text-slate-500">{[standing.cityName, standing.province].filter(Boolean).join(", ") || "Lokasi tidak tersedia"}</p></td>
                          <td className="p-3">{standing.matchesPlayed}</td>
                          <td className="p-3">{standing.wins}-{standing.losses}</td>
                          <td className="p-3">{standing.gamesFor}-{standing.gamesAgainst}</td>
                          <td className="p-3">{standing.gameDiff > 0 ? "+" : ""}{standing.gameDiff}</td>
                          <td className="p-3 font-bold text-matchpoin-navy">{standing.points}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Peserta terdaftar</CardTitle></CardHeader>
              <CardContent>
                {overview.participants.length === 0 ? <p className="text-sm text-slate-500">Belum ada peserta.</p> : (
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {overview.participants.map((participant) => <li key={participant.userId} className="rounded-lg border border-slate-100 p-3"><p className="text-sm font-semibold">{participant.name}</p><p className="text-xs text-slate-500">{[participant.cityName, participant.province].filter(Boolean).join(", ") || "Lokasi tidak tersedia"}</p></li>)}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
