"use client";

import React, { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calculator, TrendingDown, TrendingUp } from "lucide-react";
import {
  MPR_CALIBRATION_MATCHES,
  MPR_POINT_SWING,
  MPR_STARTING_RATING,
  calculateMprSingles,
  mprCalibrationRemaining,
  mprCategoryLabel,
  mprIsCalibrating,
} from "@/lib/rating/mpr-core.mjs";

interface RatingCalculatorProps {
  ratingA: number;
  ratingB: number;
  matchesA: number;
  matchesB: number;
  onChangeA: (value: number) => void;
  onChangeB: (value: number) => void;
  onChangeMatchesA: (value: number) => void;
  onChangeMatchesB: (value: number) => void;
}

const RATING_MIN = 0;
const RATING_MAX = 3000;

function clampRating(value: number): number {
  if (!Number.isFinite(value)) return MPR_STARTING_RATING;
  return Math.min(RATING_MAX, Math.max(RATING_MIN, Math.round(value)));
}

function clampMatches(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(999, Math.max(0, Math.round(value)));
}

function OutcomeRow({
  label,
  delta,
  ratingBefore,
  ratingAfter,
  matchesPlayed,
  tone,
}: {
  label: string;
  delta: number;
  ratingBefore: number;
  ratingAfter: number;
  matchesPlayed: number;
  tone: "emerald" | "rose";
}) {
  const positive = delta >= 0;
  const Icon = positive ? TrendingUp : TrendingDown;
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : "border-rose-200 bg-rose-50";

  return (
    <div className={`rounded-xl border p-3 ${toneClass}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 text-xl font-extrabold ${
            positive ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          <Icon className="h-4 w-4" />
          {positive ? "+" : ""}
          {delta}
        </span>
        <span className="text-xs font-semibold text-slate-600">
          {ratingBefore} → {ratingAfter}
        </span>
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        {mprIsCalibrating(matchesPlayed)
          ? `Kalibrasi: ${mprCalibrationRemaining(matchesPlayed)} pertandingan lagi sebelum ranking resmi`
          : "Peringkat resmi"}
      </p>
    </div>
  );
}

/**
 * Kalkulator MPR: memasukkan rating dua pemain dan menampilkan berapa poin yang
 * didapat/dihilangkan untuk setiap kemungkinan hasil (A menang atau B menang).
 * Memakai fungsi yang sama dengan pertandingan sungguhan (calculateMprSingles),
 * jadi angka di sini identik dengan yang tersimpan di rating_history.
 */
export function RatingCalculator({
  ratingA,
  ratingB,
  matchesA,
  matchesB,
  onChangeA,
  onChangeB,
  onChangeMatchesA,
  onChangeMatchesB,
}: RatingCalculatorProps) {
  const result = useMemo(
    () =>
      calculateMprSingles(
        { userId: "A", rating: ratingA, matchesPlayed: matchesA },
        { userId: "B", rating: ratingB, matchesPlayed: matchesB },
        "A"
      ),
    [ratingA, ratingB, matchesA, matchesB]
  );

  // Pertukaran hasil: kalau B menang, angkanya cermin dari A menang.
  const bWin = useMemo(
    () =>
      calculateMprSingles(
        { userId: "A", rating: ratingA, matchesPlayed: matchesA },
        { userId: "B", rating: ratingB, matchesPlayed: matchesB },
        "B"
      ),
    [ratingA, ratingB, matchesA, matchesB]
  );

  const diff = ratingB - ratingA;

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calculator className="h-4 w-4 text-matchpoin-navy" />
          Kalkulator Perubahan Rating
        </CardTitle>
        <p className="text-xs text-slate-500">
          Masukkan rating kedua pemain untuk melihat poin yang didapat atau hilang. Rumusnya sama
          dengan pertandingan sungguhan: lawan seimbang ±{MPR_POINT_SWING}, selisih rating membuat
          angkanya dinamis.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-800">
              Pemain A{" "}
              <Badge variant="outline" className="ml-1 text-[9px]">
                {mprCategoryLabel(ratingA)}
              </Badge>
            </p>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Rating MPR
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={RATING_MIN}
              max={RATING_MAX}
              value={ratingA}
              onChange={(event) => onChangeA(clampRating(Number(event.target.value)))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 focus:border-matchpoin-navy focus:outline-none"
            />
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pertandingan selesai
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={matchesA}
              onChange={(event) => onChangeMatchesA(clampMatches(Number(event.target.value)))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-matchpoin-navy focus:outline-none"
            />
          </div>

          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-bold text-slate-800">
              Pemain B{" "}
              <Badge variant="outline" className="ml-1 text-[9px]">
                {mprCategoryLabel(ratingB)}
              </Badge>
            </p>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Rating MPR
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={RATING_MIN}
              max={RATING_MAX}
              value={ratingB}
              onChange={(event) => onChangeB(clampRating(Number(event.target.value)))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-900 focus:border-matchpoin-navy focus:outline-none"
            />
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Pertandingan selesai
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={matchesB}
              onChange={(event) => onChangeMatchesB(clampMatches(Number(event.target.value)))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-matchpoin-navy focus:outline-none"
            />
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Selisih rating:{" "}
          <strong className={diff === 0 ? "text-slate-800" : diff > 0 ? "text-rose-600" : "text-emerald-600"}>
            {diff > 0 ? "+" : ""}
            {diff}
          </strong>{" "}
          ({diff === 0 ? "seimbang" : diff > 0 ? "B lebih tinggi" : "A lebih tinggi"}). Peluang A
          menang menurut rumus: <strong>{Math.round(result.playerA.expected * 100)}%</strong>.
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Jika A menang
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <OutcomeRow
              label="A menang"
              delta={result.playerA.delta}
              ratingBefore={result.playerA.oldRating}
              ratingAfter={result.playerA.newRating}
              matchesPlayed={matchesA}
              tone={result.playerA.delta >= 0 ? "emerald" : "rose"}
            />
            <OutcomeRow
              label="B kalah"
              delta={result.playerB.delta}
              ratingBefore={result.playerB.oldRating}
              ratingAfter={result.playerB.newRating}
              matchesPlayed={matchesB}
              tone={result.playerB.delta >= 0 ? "emerald" : "rose"}
            />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Jika B menang
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <OutcomeRow
              label="A kalah"
              delta={bWin.playerA.delta}
              ratingBefore={bWin.playerA.oldRating}
              ratingAfter={bWin.playerA.newRating}
              matchesPlayed={matchesA}
              tone={bWin.playerA.delta >= 0 ? "emerald" : "rose"}
            />
            <OutcomeRow
              label="B menang"
              delta={bWin.playerB.delta}
              ratingBefore={bWin.playerB.oldRating}
              ratingAfter={bWin.playerB.newRating}
              matchesPlayed={matchesB}
              tone={bWin.playerB.delta >= 0 ? "emerald" : "rose"}
            />
          </div>
        </div>

        <p className="text-[10px] leading-relaxed text-slate-400">
          Kalibrasi: {MPR_CALIBRATION_MATCHES} pertandingan pertama setiap pemain baru (mulai MPR{" "}
          {MPR_STARTING_RATING}). Rating tetap bergerak selama kalibrasi, tetapi baru menjadi
          ranking resmi setelah kalibrasi selesai.
        </p>
      </CardContent>
    </Card>
  );
}