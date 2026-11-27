"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, Crown, Loader2, Medal, Swords, Trophy } from "lucide-react";
import {
  IKA17_CATEGORIES,
  IKA17_CLASSES,
  IKA17_CLASS_LABELS,
  IKA17_MIN_MATCHES,
  IKA17_MAIN_EVENT_SLOTS,
  ika17ClassOfRating,
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

/** Peserta yang sudah diterima di kategori liga (dari API yang sama). */
interface LeagueParticipant {
  entryId: string;
  userId: string;
  name: string;
}

type ClassFilter = "all" | "beginner" | "intermediate";

/**
 * Kelas liga ditentukan dari MPR hasil pertandingan, bukan pilihan pemain saat
 * mendaftar. Tim ganda memakai rata-rata MPR kedua pemain (dihitung di server).
 */
function classOf(standing: Standing): "beginner" | "intermediate" {
  return ika17ClassOfRating(standing.rating);
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
  const [classFilter, setClassFilter] = useState<ClassFilter>("all");
  const [standings, setStandings] = useState<Standing[]>([]);
  const [participants, setParticipants] = useState<LeagueParticipant[]>([]);
  const [viewerId, setViewerId] = useState<string | null>(null);
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
        participants?: LeagueParticipant[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || "Gagal memuat leaderboard turnamen.");
      }
      setStandings(Array.isArray(payload.standings) ? payload.standings : []);
      setParticipants(Array.isArray(payload.participants) ? payload.participants : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat leaderboard turnamen.");
      setStandings([]);
      setParticipants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(category);
  }, [category, load]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data: { user } }) => setViewerId(user?.id ?? null))
      .catch(() => setViewerId(null));
  }, []);

  // Shortcut hanya untuk peserta yang SUDAH DITERIMA di kategori yang sedang
  // dibuka. Peserta pending/rejected tidak ada di daftar `participants`.
  const myEntryId = useMemo(() => {
    if (!viewerId) return null;
    return participants.find((entry) => entry.userId === viewerId)?.entryId ?? null;
  }, [participants, viewerId]);

  // Satu user id per entry untuk preselect lawan (kapten = pendaftar pertama).
  const userIdByEntry = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of participants) {
      if (!map.has(entry.entryId)) map.set(entry.entryId, entry.userId);
    }
    return map;
  }, [participants]);

  // Delapan besar Beginner DAN delapan besar Intermediate tiap kategori lolos ke
  // Main Event. Syarat tambahan: minimal IKA17_MIN_MATCHES pertandingan tercatat.
  const mainEventSlots = useMemo(() => {
    const map = new Map<string, number>();
    for (const klass of IKA17_CLASSES) {
      sortStandings(standings.filter((row) => classOf(row) === klass))
        .slice(0, IKA17_MAIN_EVENT_SLOTS)
        .forEach((row, index) => map.set(row.entryId, index + 1));
    }
    return map;
  }, [standings]);

  const visible = useMemo(() => {
    const filtered =
      classFilter === "all"
        ? standings
        : standings.filter((row) => classOf(row) === classFilter);
    return sortStandings(filtered);
  }, [standings, classFilter]);

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
              {IKA17_MAIN_EVENT_SLOTS} besar Beginner dan {IKA17_MAIN_EVENT_SLOTS} besar
              Intermediate setiap kategori lolos ke Main Event, dengan syarat minimal{" "}
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
              ["all", "Semua Kelas"],
              ["beginner", IKA17_CLASS_LABELS.beginner],
              ["intermediate", IKA17_CLASS_LABELS.intermediate],
            ] as Array<[ClassFilter, string]>
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={classFilter === value ? "default" : "ghost"}
              className="text-xs"
              onClick={() => setClassFilter(value)}
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
            Belum ada peserta yang masuk klasemen untuk kategori dan kelas ini.
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
                  <th className="pb-2 pr-2 text-right">MPR</th>
                  <th className="pb-2 text-right">Status Main Event</th>
                  {/* Kolom shortcut hanya muncul untuk peserta yang sudah diterima. */}
                  {myEntryId && <th className="pb-2 pl-2 text-right">Lawan</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visible.map((row, index) => {
                  const classRank = mainEventSlots.get(row.entryId);
                  const qualifies = row.matchesPlayed >= IKA17_MIN_MATCHES;
                  const remaining = Math.max(0, IKA17_MIN_MATCHES - row.matchesPlayed);
                  const klass = classOf(row);
                  const inSlots = Boolean(classRank && classRank <= IKA17_MAIN_EVENT_SLOTS);
                  return (
                    <tr key={row.entryId} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-2 font-bold text-slate-500">{index + 1}</td>
                      <td className="py-2.5 pr-2">
                        <div className="flex items-center gap-1.5">
                          {inSlots ? (
                            <Crown className="h-4 w-4 shrink-0 text-matchpoin-tennis" />
                          ) : (
                            <Medal className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                          )}
                          <span className="font-semibold text-slate-900">{row.name}</span>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                          <span>{IKA17_CLASS_LABELS[klass]}</span>
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
                        {inSlots ? (
                          qualifies ? (
                            <Badge variant="success" className="text-[10px]">
                              {IKA17_MAIN_EVENT_SLOTS} besar {IKA17_CLASS_LABELS[klass]} · Lolos
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-amber-200 bg-amber-50 text-[10px] text-amber-700">
                              {IKA17_MAIN_EVENT_SLOTS} besar · butuh {remaining} match lagi
                            </Badge>
                          )
                        ) : (
                          <span className="text-[10px] text-slate-400">Belum lolos</span>
                        )}
                      </td>
                      {myEntryId && (
                        <td className="py-2.5 pl-2 text-right">
                          {row.entryId === myEntryId ? (
                            <span className="text-[10px] font-semibold text-slate-400">Tim Anda</span>
                          ) : (
                            (() => {
                              const opponentUserId = userIdByEntry.get(row.entryId);
                              if (!opponentUserId) return null;
                              // Mode tunggal/ganda mengikuti kategori liga yang
                              // sedang dibuka, bukan pilihan bebas.
                              return (
                                <Link
                                  href={`/matches/new?invite=${encodeURIComponent(opponentUserId)}&category=${encodeURIComponent(category)}`}
                                  className="inline-flex"
                                >
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-[10px] font-bold"
                                  >
                                    <Swords className="mr-1 h-3 w-3" />
                                    Pilih Lawan
                                  </Button>
                                </Link>
                              );
                            })()
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-slate-500">
          Peringkat ditentukan dari MPR tertinggi per kategori dan per kelas. Kelas Beginner dan
          Intermediate dibentuk otomatis dari hasil pertandingan (ganda memakai rata-rata MPR tim).{" "}
          {IKA17_MAIN_EVENT_SLOTS} besar tiap kelas lolos ke Main Event, dan pemain wajib
          menyelesaikan minimal {IKA17_MIN_MATCHES} pertandingan selama periode liga agar
          dinyatakan lolos.
        </p>
      </CardContent>
    </Card>
  );
}
