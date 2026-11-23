"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Crown, Loader2, Medal, Trophy } from "lucide-react";
import {
  IKA17_CATEGORIES,
  IKA17_MIN_MATCHES,
  IKA17_MAIN_EVENT_SLOTS,
} from "@/lib/tournaments/ika17";

interface Standing {
  entryId: string;
  name: string;
  cityName: string | null;
  points: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  gameDiff: number;
  rank: number;
  level: string | null;
  rating: number | null;
}

type LevelFilter = "all" | "beginner" | "intermediate" | "advanced" | "expert";

const LEVEL_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
  unknown: "Level belum diisi",
};

function levelOf(
  standing: Standing
): "beginner" | "intermediate" | "advanced" | "expert" | "unknown" {
  // `expert` sekarang berdiri sendiri supaya filter Expert bisa dipakai.
  if (standing.level === "expert") return "expert";
  if (standing.level === "advanced") return "advanced";
  if (standing.level === "intermediate") return "intermediate";
  if (standing.level === "beginner") return "beginner";
  return "unknown";
}

function sortStandings(rows: Standing[]): Standing[] {
  return [...rows].sort(
    (a, b) =>
      (b.rating ?? 0) - (a.rating ?? 0) ||
      b.wins - a.wins ||
      b.matchesPlayed - a.matchesPlayed ||
      a.name.localeCompare(b.name)
  );
}

export function TournamentLeaderboard() {
  const [category, setCategory] = useState(IKA17_CATEGORIES[0]?.id ?? "mens_singles");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (value: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/leagues/${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        standings?: Standing[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || "Gagal memuat leaderboard turnamen.");
      }
      setStandings(Array.isArray(payload.standings) ? payload.standings : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat leaderboard turnamen.");
      setStandings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(category);
  }, [category, load]);

  // 8 besar tiap kategori lolos ke Main Event (bukan juara 1 & 2 per level).
  // Syarat tambahan: minimal IKA17_MIN_MATCHES pertandingan tercatat.
  const mainEventSlots = useMemo(() => {
    const map = new Map<string, number>();
    sortStandings(standings)
      .slice(0, IKA17_MAIN_EVENT_SLOTS)
      .forEach((row, index) => map.set(row.entryId, index + 1));
    return map;
  }, [standings]);

  const visible = useMemo(() => {
    const filtered =
      levelFilter === "all"
        ? standings
        : standings.filter((row) => levelOf(row) === levelFilter);
    return sortStandings(filtered);
  }, [standings, levelFilter]);

  const categoryLabel =
    IKA17_CATEGORIES.find((entry) => entry.id === category)?.label ?? "Kategori";

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-matchpoin-navy" />
              Leaderboard Turnamen
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              8 besar setiap kategori lolos ke Main Event, dengan syarat minimal{" "}
              {IKA17_MIN_MATCHES} pertandingan tercatat selama periode liga.
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px] font-semibold">
            {categoryLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {IKA17_CATEGORIES.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              size="sm"
              variant={entry.id === category ? "tennis" : "outline"}
              className={
                entry.id === category
                  ? "text-matchpoin-navy font-bold"
                  : "text-slate-600 font-semibold"
              }
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "Semua Level"],
              ["beginner", "Beginner"],
              ["intermediate", "Intermediate"],
              ["advanced", "Advanced"],
              ["expert", "Expert"],
            ] as Array<[LevelFilter, string]>
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={levelFilter === value ? "default" : "ghost"}
              className="text-xs"
              onClick={() => setLevelFilter(value)}
            >
              {label}
            </Button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center py-10 text-xs text-slate-400">
            <Loader2 className="mb-2 h-6 w-6 animate-spin text-matchpoin-navy" />
            Memuat peringkat...
          </div>
        ) : visible.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            Belum ada peserta yang masuk klasemen untuk kategori dan level ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">Pemain / Tim</th>
                  <th className="pb-2 pr-2 text-center">Main</th>
                  <th className="pb-2 pr-2 text-center">M-K</th>
                  <th className="pb-2 pr-2 text-right">Rating</th>
                  <th className="pb-2 text-right">Status Main Event</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((row, index) => {
                  const overallRank = mainEventSlots.get(row.entryId);
                  const qualifies = row.matchesPlayed >= IKA17_MIN_MATCHES;
                  const remaining = Math.max(0, IKA17_MIN_MATCHES - row.matchesPlayed);
                  const level = levelOf(row);
                  return (
                    <tr key={row.entryId} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-2 font-bold text-slate-500">{index + 1}</td>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-1.5">
                          {overallRank && overallRank <= 8 ? (
                            <Crown className="h-4 w-4 shrink-0 text-matchpoin-tennis" />
                          ) : (
                            <Medal className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          )}
                          <span className="font-semibold text-slate-900">{row.name}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                          <span className="capitalize">{LEVEL_LABEL[level]}</span>
                          {row.cityName && <span>· {row.cityName}</span>}
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 text-center text-xs text-slate-600">
                        {row.matchesPlayed}
                      </td>
                      <td className="py-2.5 pr-2 text-center text-xs text-slate-600">
                        {row.wins}-{row.losses}
                      </td>
                      <td className="py-2.5 pr-2 text-right font-bold text-slate-800">
                        {row.rating === null ? "-" : Math.round(row.rating)}
                      </td>
                      <td className="py-2.5 text-right">
                        {overallRank && overallRank <= IKA17_MAIN_EVENT_SLOTS ? (
                          qualifies ? (
                            <Badge variant="success" className="text-[10px]">
                              8 besar · Lolos
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                              8 besar · butuh {remaining} match lagi
                            </Badge>
                          )
                        ) : level === "advanced" ? (
                          <span className="text-[10px] text-slate-400">Tidak masuk kategori</span>
                        ) : level === "unknown" ? (
                          <span className="text-[10px] text-amber-600">Lengkapi level profil</span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Belum lolos</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-500">
          Peringkat ditentukan dari DTR tertinggi per kategori. 8 besar setiap kategori lolos ke
          Main Event. Menang/kalah memengaruhi rating, dan pemain wajib menyelesaikan minimal{" "}
          {IKA17_MIN_MATCHES} pertandingan selama periode liga agar dinyatakan lolos.
        </p>
      </CardContent>
    </Card>
  );
}
