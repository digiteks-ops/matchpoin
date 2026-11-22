"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChevronDown,
  ChevronRight,
  Crown,
  FlaskConical,
  TrendingDown,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { simulateSinglesMen, type SimulatedPlayer } from "@/lib/tournaments/simulation";
import { IKA17_MIN_MATCHES } from "@/lib/tournaments/ika17";

const QUOTA_PER_LEVEL = 2;
const LEVELS = ["beginner", "intermediate"] as const;

const LEVEL_LABEL: Record<SimulatedPlayer["level"], string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
};

function sortByRating(players: SimulatedPlayer[]): SimulatedPlayer[] {
  return [...players].sort(
    (a, b) =>
      b.finalRating - a.finalRating ||
      b.wins - a.wins ||
      b.matchesPlayed - a.matchesPlayed ||
      a.name.localeCompare(b.name)
  );
}

function recordLabel(player: SimulatedPlayer): string {
  return `${player.wins}-${player.losses}`;
}

function RatingDelta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${
        positive ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {positive ? (
        <TrendingUp className="h-3 w-3" />
      ) : (
        <TrendingDown className="h-3 w-3" />
      )}
      {positive ? "+" : ""}
      {value.toFixed(2)}
    </span>
  );
}

export default function SimulationClient() {
  const players = useMemo(() => simulateSinglesMen(), []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const winners = useMemo(() => {
    const map = new Map<string, number>();
    for (const level of LEVELS) {
      const ranked = sortByRating(players.filter((player) => player.level === level));
      ranked.slice(0, QUOTA_PER_LEVEL).forEach((player, index) => {
        map.set(player.id, index + 1);
      });
    }
    return map;
  }, [players]);

  const qualifiedCount = useMemo(
    () =>
      players.filter(
        (player) => winners.has(player.id) && player.matchesPlayed >= IKA17_MIN_MATCHES
      ).length,
    [players, winners]
  );

  const toggle = (id: string) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto space-y-6 px-4 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-matchpoin-navy" />
              <h1 className="font-heading text-2xl font-extrabold text-slate-900">
                Simulasi Kualifikasi — Single Putra
              </h1>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700">
                SIMULASI
              </Badge>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Peringkat berdasarkan rating. Menang/kalah memengaruhi rating. Minimal{" "}
              {IKA17_MIN_MATCHES} pertandingan untuk lolos. Juara 1 &amp; 2 Beginner dan Juara 1
              &amp; 2 Intermediate masuk Main Event.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Peserta
              </p>
              <p className="text-xl font-extrabold text-slate-900">{players.length}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600">
                Lolos
              </p>
              <p className="text-xl font-extrabold text-emerald-700">{qualifiedCount}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Data ini <strong>sintetis</strong> dan deterministik untuk simulasi. Tidak menulis atau
          mengubah data production.
        </div>

        {LEVELS.map((level) => {
          const ranked = sortByRating(players.filter((player) => player.level === level));
          return (
            <Card key={level} className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-matchpoin-navy" />
                  {LEVEL_LABEL[level]}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        <th className="pb-2 pr-2">#</th>
                        <th className="pb-2 pr-2">Pemain</th>
                        <th className="pb-2 pr-2 text-center">Main</th>
                        <th className="pb-2 pr-2 text-center">M-K</th>
                        <th className="pb-2 pr-2 text-right">Rating Awal</th>
                        <th className="pb-2 pr-2 text-right">Rating Akhir</th>
                        <th className="pb-2 pr-2 text-right">Δ</th>
                        <th className="pb-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ranked.map((player, index) => {
                        const juara = winners.get(player.id);
                        const qualifies =
                          Boolean(juara) && player.matchesPlayed >= IKA17_MIN_MATCHES;
                        const remaining = Math.max(0, IKA17_MIN_MATCHES - player.matchesPlayed);
                        const isOpen = expanded.has(player.id);
                        return (
                          <React.Fragment key={player.id}>
                            <tr className="hover:bg-slate-50">
                              <td className="py-2.5 pr-2 font-bold text-slate-500">{index + 1}</td>
                              <td className="py-2.5 pr-2">
                                <button
                                  type="button"
                                  onClick={() => toggle(player.id)}
                                  className="inline-flex items-center gap-1.5 text-left font-semibold text-slate-900 hover:text-matchpoin-navy"
                                >
                                  {isOpen ? (
                                    <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                                  )}
                                  {player.name}
                                  {juara && <Crown className="h-3.5 w-3.5 text-matchpoin-tennis" />}
                                </button>
                              </td>
                              <td className="py-2.5 pr-2 text-center text-xs text-slate-600">
                                {player.matchesPlayed}
                              </td>
                              <td className="py-2.5 pr-2 text-center text-xs text-slate-600">
                                {recordLabel(player)}
                              </td>
                              <td className="py-2.5 pr-2 text-right text-xs text-slate-500">
                                {player.startRating.toFixed(2)}
                              </td>
                              <td className="py-2.5 pr-2 text-right font-bold text-slate-900">
                                {player.finalRating.toFixed(2)}
                              </td>
                              <td className="py-2.5 pr-2 text-right text-xs">
                                <RatingDelta value={player.ratingChange} />
                              </td>
                              <td className="py-2.5 text-right">
                                {juara ? (
                                  qualifies ? (
                                    <Badge variant="success" className="text-[10px]">
                                      Juara {juara} {LEVEL_LABEL[level]} · Lolos
                                    </Badge>
                                  ) : (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-200 bg-amber-50 text-[10px] text-amber-700"
                                    >
                                      Juara {juara} · butuh {remaining} match
                                    </Badge>
                                  )
                                ) : player.matchesPlayed < IKA17_MIN_MATCHES ? (
                                  <span className="text-[10px] text-amber-600">
                                    Butuh {remaining} match
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400">
                                    Di luar kuota
                                  </span>
                                )}
                              </td>
                            </tr>
                            {isOpen && (
                              <tr className="bg-slate-50/60">
                                <td colSpan={8} className="p-0">
                                  <div className="px-3 py-3">
                                    <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                      History Match &amp; Perubahan Rating
                                    </p>
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                      <table className="w-full text-xs">
                                        <thead>
                                          <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                            <th className="px-2 py-1.5">#</th>
                                            <th className="px-2 py-1.5">Lawan</th>
                                            <th className="px-2 py-1.5">Hasil</th>
                                            <th className="px-2 py-1.5 text-right">Sebelum</th>
                                            <th className="px-2 py-1.5 text-right">Sesudah</th>
                                            <th className="px-2 py-1.5 text-right">Δ</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                          {player.matches.map((match, matchIndex) => (
                                            <tr key={match.id}>
                                              <td className="px-2 py-1.5 text-slate-400">
                                                {matchIndex + 1}
                                              </td>
                                              <td className="px-2 py-1.5 text-slate-700">
                                                {match.opponent}
                                              </td>
                                              <td className="px-2 py-1.5">
                                                <Badge
                                                  variant={
                                                    match.result === "win" ? "success" : "destructive"
                                                  }
                                                  className="text-[9px] uppercase"
                                                >
                                                  {match.result === "win" ? "Menang" : "Kalah"}
                                                </Badge>
                                              </td>
                                              <td className="px-2 py-1.5 text-right text-slate-500">
                                                {match.ratingBefore.toFixed(2)}
                                              </td>
                                              <td className="px-2 py-1.5 text-right font-semibold text-slate-800">
                                                {match.ratingAfter.toFixed(2)}
                                              </td>
                                              <td className="px-2 py-1.5 text-right">
                                                <RatingDelta value={match.delta} />
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                    <p className="mt-2 text-[10px] text-slate-500">
                                      Win rate:{" "}
                                      {(
                                        (player.wins / Math.max(player.matchesPlayed, 1)) *
                                        100
                                      ).toFixed(0)}
                                      % · Total perubahan rating:{" "}
                                      {player.ratingChange >= 0 ? "+" : ""}
                                      {player.ratingChange.toFixed(2)} · Rata-rata per match:{" "}
                                      {(player.ratingChange / Math.max(player.matchesPlayed, 1)).toFixed(3)}
                                    </p>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setExpanded(new Set())}>
            Tutup semua history
          </Button>
        </div>
      </div>
    </div>
  );
}