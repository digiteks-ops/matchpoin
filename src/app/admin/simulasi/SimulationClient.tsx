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
  Info,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from "lucide-react";
import {
  simulateSinglesMen,
  simulateSinglesMen24,
  SIMULATION_QUALIFIERS,
  SIMULATION_ROUNDS,
  SIMULATION_START_RATING,
  type SimulatedPlayer,
} from "@/lib/tournaments/simulation";

type Variant = "12" | "24";

function RatingDelta({ value }: { value: number }) {
  const positive = value >= 0;
  return (
    <span
      className={`inline-flex items-center gap-0.5 font-semibold ${
        positive ? "text-emerald-600" : "text-rose-600"
      }`}
    >
      {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {positive ? "+" : ""}
      {Math.round(value)}
    </span>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "rose" | "slate";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : tone === "rose"
        ? "border-rose-200 bg-rose-50 text-rose-700"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneClass}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-sm font-extrabold">{value}</p>
    </div>
  );
}

export default function SimulationClient() {
  const [variant, setVariant] = useState<Variant>("24");
  const players = useMemo(
    () => (variant === "24" ? simulateSinglesMen24() : simulateSinglesMen()),
    [variant]
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const qualifiedCount = useMemo(
    () => players.filter((player) => player.qualified).length,
    [players]
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
                Simulasi Kualifikasi — Single Man
              </h1>
              <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-700">
                SIMULASI
              </Badge>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {players.length} pemain, semua mulai rating {Math.round(SIMULATION_START_RATING)}.
              Format Swiss {SIMULATION_ROUNDS} ronde: setiap pemain bertemu lawan berbeda.{" "}
              {SIMULATION_QUALIFIERS} besar rating tertinggi lolos.
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
                Lolos 8 Besar
              </p>
              <p className="text-xl font-extrabold text-emerald-700">{qualifiedCount}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-center">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Ronde
              </p>
              <p className="text-xl font-extrabold text-slate-900">{SIMULATION_ROUNDS}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setVariant("12")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                variant === "12"
                  ? "bg-matchpoin-navy text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Simulasi 12 Pemain
            </button>
            <button
              type="button"
              onClick={() => setVariant("24")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                variant === "24"
                  ? "bg-matchpoin-navy text-white"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Simulasi 24 Pemain
            </button>
          </div>
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">MPR — MatchPoin Rating (Modified Elo, K tetap 80).</p>
            <p>
              Rating awal 1000 untuk semua pemain, tanpa batas minimum. Lawan selevel: menang +40, kalah −40.
              Mengalahkan lawan berating lebih tinggi → kenaikan lebih besar. Kalah dari lawan
              berating lebih rendah → pengurangan lebih besar.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Data ini <strong>sintetis</strong> dan deterministik untuk simulasi. Tidak menulis atau
          mengubah data production. Kedua simulasi tetap tersedia (12 dan 24 pemain).
        </div>

        <Card className="border-slate-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-matchpoin-navy" />
              Single Man · 8 Besar Lolos
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
                    <th className="pb-2 pr-2 text-right">Δ Total</th>
                    <th className="pb-2 pr-2 text-right">Δ Menang</th>
                    <th className="pb-2 pr-2 text-right">Δ Kalah</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {players.map((player) => {
                    const isOpen = expanded.has(player.id);
                    return (
                      <React.Fragment key={player.id}>
                        <tr className="hover:bg-slate-50">
                          <td className="py-2.5 pr-2 font-bold text-slate-500">{player.rank}</td>
                          <td className="py-2.5 pr-2">
                            <button
                              type="button"
                              onClick={() => toggle(player.id)}
                              className="inline-flex items-start gap-1.5 text-left font-semibold text-slate-900 hover:text-matchpoin-navy"
                            >
                              {isOpen ? (
                                <ChevronDown className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-3.5 w-3.5 text-slate-400" />
                              )}
                              <span className="flex flex-col">
                                <span className="inline-flex items-center gap-1.5">
                                  {player.name}
                                  {player.qualified && (
                                    <Crown className="h-3.5 w-3.5 text-matchpoin-tennis" />
                                  )}
                                </span>
                                <span className="text-[10px] font-normal text-slate-400">
                                  {player.category}
                                </span>
                              </span>
                            </button>
                          </td>
                          <td className="py-2.5 pr-2 text-center text-xs text-slate-600">
                            {player.matchesPlayed}
                          </td>
                          <td className="py-2.5 pr-2 text-center text-xs text-slate-600">
                            {player.wins}-{player.losses}
                          </td>
                          <td className="py-2.5 pr-2 text-right text-xs text-slate-500">
                            {Math.round(player.startRating)}
                          </td>
                          <td className="py-2.5 pr-2 text-right font-bold text-slate-900">
                            {Math.round(player.finalRating)}
                          </td>
                          <td className="py-2.5 pr-2 text-right text-xs">
                            <RatingDelta value={player.ratingChange} />
                          </td>
                          <td className="py-2.5 pr-2 text-right">
                            <div className="text-xs font-semibold text-emerald-600">
                              +{player.avgWinGain.toFixed(1)}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              total +{Math.round(player.winRatingGain)}
                            </div>
                          </td>
                          <td className="py-2.5 pr-2 text-right">
                            <div className="text-xs font-semibold text-rose-600">
                              {player.avgLossDrop.toFixed(1)}
                            </div>
                            <div className="text-[9px] text-slate-400">
                              total {Math.round(player.lossRatingDrop)}
                            </div>
                          </td>
                          <td className="py-2.5 text-right">
                            {player.qualified ? (
                              <Badge variant="success" className="text-[10px]">
                                Lolos 8 Besar
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-slate-400">Belum lolos</span>
                            )}
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="bg-slate-50/60">
                            <td colSpan={10} className="p-0">
                              <div className="px-3 py-3">
                                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  Statistik Perubahan Rating
                                </p>
                                <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
                                  <StatBox
                                    label="Kenaikan total"
                                    value={`+${Math.round(player.winRatingGain)}`}
                                    tone="emerald"
                                  />
                                  <StatBox
                                    label="Pengurangan total"
                                    value={String(Math.round(player.lossRatingDrop))}
                                    tone="rose"
                                  />
                                  <StatBox
                                    label="Rata² menang"
                                    value={`+${player.avgWinGain.toFixed(1)}`}
                                    tone="emerald"
                                  />
                                  <StatBox
                                    label="Rata² kalah"
                                    value={player.avgLossDrop.toFixed(1)}
                                    tone="rose"
                                  />
                                  <StatBox
                                    label="Kenaikan terbesar"
                                    value={`+${Math.round(player.bestWinGain)}`}
                                    tone="emerald"
                                  />
                                  <StatBox
                                    label="Pengurangan terbesar"
                                    value={String(Math.round(player.worstLossDrop))}
                                    tone="rose"
                                  />
                                </div>

                                <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                  History Pertemuan &amp; Perubahan Rating
                                </p>
                                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        <th className="px-2 py-1.5">Ronde</th>
                                        <th className="px-2 py-1.5">Lawan</th>
                                        <th className="px-2 py-1.5 text-right">Rating Lawan</th>
                                        <th className="px-2 py-1.5 text-right">Peluang</th>
                                        <th className="px-2 py-1.5 text-right">K</th>
                                        <th className="px-2 py-1.5">Hasil</th>
                                        <th className="px-2 py-1.5 text-right">Sebelum</th>
                                        <th className="px-2 py-1.5 text-right">Sesudah</th>
                                        <th className="px-2 py-1.5 text-right">Δ</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                      {player.matches.map((match) => (
                                        <tr key={match.id}>
                                          <td className="px-2 py-1.5 text-slate-400">
                                            {match.round}
                                          </td>
                                          <td className="px-2 py-1.5 text-slate-700">
                                            {match.opponent}
                                          </td>
                                          <td className="px-2 py-1.5 text-right text-slate-500">
                                            {Math.round(match.opponentRatingBefore)}
                                          </td>
                                          <td className="px-2 py-1.5 text-right text-slate-500">
                                            {(match.expected * 100).toFixed(0)}%
                                          </td>
                                          <td className="px-2 py-1.5 text-right text-slate-500">
                                            {Math.round(match.kFactor)}
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
                                            {Math.round(match.ratingBefore)}
                                          </td>
                                          <td className="px-2 py-1.5 text-right font-semibold text-slate-800">
                                            {Math.round(match.ratingAfter)}
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
                                  {Math.round(player.ratingChange)} · Rata-rata per match:{" "}
                                  {(player.ratingChange / Math.max(player.matchesPlayed, 1)).toFixed(1)}
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

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => setExpanded(new Set())}>
            Tutup semua history
          </Button>
        </div>
      </div>
    </div>
  );
}