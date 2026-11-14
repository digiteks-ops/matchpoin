"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, Trophy, Users, Medal, Flame, ArrowUp, ArrowDown } from "lucide-react";

interface StandingRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  points: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  winRate: number;
  gamesFor: number;
  gamesAgainst: number;
  gameDiff: number;
  rank: number;
}

interface LeagueCategory {
  id: string;
  label: string;
}

const CATEGORIES: LeagueCategory[] = [
  { id: "mens_singles", label: "Men's Singles" },
  { id: "womens_singles", label: "Women's Singles" },
  { id: "mens_doubles", label: "Men's Doubles" },
  { id: "womens_doubles", label: "Women's Doubles" },
  { id: "mixed_doubles", label: "Mixed Doubles" },
];

export default function LeaguePage() {
  const [category, setCategory] = useState<string>("mens_singles");
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number }>({ days: 0, hours: 0, minutes: 0 });

  useEffect(() => {
    loadStandings();
    startCountdown();
  }, [category]);

  function startCountdown() {
    const endDate = new Date("2027-03-31T23:59:59+07:00");
    const interval = setInterval(() => {
      const now = new Date();
      const diff = endDate.getTime() - now.getTime();
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0 });
        clearInterval(interval);
        return;
      }
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setCountdown({ days, hours, minutes });
    }, 1000);
    return () => clearInterval(interval);
  }

  async function loadStandings() {
    setIsLoading(true);
    try {
      const supabase = createClient();

      // Ambil semua match results confirmed di liga ini
      const { data: results } = await supabase
        .from("match_results")
        .select("match_id, team1_score, team2_score, winner_team, is_walkover, metadata")
        .eq("status", "confirmed");

      if (!results) {
        setStandings([]);
        setIsLoading(false);
        return;
      }

      const matchIds = results.map((r) => r.match_id);

      // Ambil participants untuk match tersebut
      const { data: participants } = await supabase
        .from("match_participants")
        .select("match_id, user_id, team, metadata")
        .in("match_id", matchIds);

      if (!participants) {
        setStandings([]);
        setIsLoading(false);
        return;
      }

      // Ambil profil pemain
      const userIds = Array.from(new Set(participants.map((p) => p.user_id)));
      const { data: profiles } = await supabase
        .from("player_profiles")
        .select("user_id, display_name, avatar_url, trust_points")
        .in("user_id", userIds);

      const profileMap = new Map<string, { display_name: string | null; avatar_url: string | null; trust_points: number | null }>();
      (profiles ?? []).forEach((p) => {
        profileMap.set(p.user_id, {
          display_name: p.display_name || "Pemain MATCHPOIN",
          avatar_url: p.avatar_url ?? null,
          trust_points: p.trust_points ?? 0,
        });
      });

      // Grup participants per match
      const matchTeams: Record<string, { team1: string[]; team2: string[] }> = {};
      for (const p of participants) {
        if (!matchTeams[p.match_id]) {
          matchTeams[p.match_id] = { team1: [], team2: [] };
        }
        if (p.team === 1) matchTeams[p.match_id].team1.push(p.user_id);
        if (p.team === 2) matchTeams[p.match_id].team2.push(p.user_id);
      }

      // Hitung standings per pemain
      const statsMap = new Map<string, {
        points: number;
        wins: number;
        losses: number;
        matches_played: number;
        games_for: number;
        games_against: number;
      }>();

      const ensureStat = (userId: string) => {
        if (!statsMap.has(userId)) {
          statsMap.set(userId, { points: 0, wins: 0, losses: 0, matches_played: 0, games_for: 0, games_against: 0 });
        }
      };

      for (const r of results) {
        const teams = matchTeams[r.match_id];
        if (!teams) continue;

        const isWO = Boolean(r.is_walkover);
        const winnerTeam = r.winner_team;
        const t1Score = r.team1_score ?? 0;
        const t2Score = r.team2_score ?? 0;

        const team1Players = teams.team1;
        const team2Players = teams.team2;

        const t1Won = winnerTeam === 1;
        const t2Won = winnerTeam === 2;

        // Tim 1
        for (const uid of team1Players) {
          ensureStat(uid);
          const s = statsMap.get(uid)!;
          s.matches_played += 1;
          s.games_for += t1Score;
          s.games_against += t2Score;
          if (t1Won) {
            s.wins += 1;
            s.points += 3;
          } else {
            s.losses += 1;
          }
        }

        // Tim 2
        for (const uid of team2Players) {
          ensureStat(uid);
          const s = statsMap.get(uid)!;
          s.matches_played += 1;
          s.games_for += t2Score;
          s.games_against += t1Score;
          if (t2Won) {
            s.wins += 1;
            s.points += 3;
          } else {
            s.losses += 1;
          }
        }
      }

      const rows: StandingRow[] = Array.from(statsMap.entries()).map(([uid, s], idx) => {
        const profile = profileMap.get(uid);
        const winRate = s.matches_played > 0 ? Math.round((s.wins / s.matches_played) * 100) : 0;
        return {
          userId: uid,
          name: profile?.display_name || "Pemain MATCHPOIN",
          avatarUrl: profile?.avatar_url ?? null,
          points: s.points,
          wins: s.wins,
          losses: s.losses,
          matchesPlayed: s.matches_played,
          winRate,
          gamesFor: s.games_for,
          gamesAgainst: s.games_against,
          gameDiff: s.games_for - s.games_against,
          rank: idx + 1,
        };
      });

      rows.sort(
        (a, b) =>
          b.points - a.points ||
          b.gameDiff - a.gameDiff ||
          b.gamesFor - a.gamesFor ||
          b.wins - a.wins
      );

      rows.forEach((r, i) => {
        r.rank = i + 1;
      });

      setStandings(rows);
    } catch (err) {
      console.error("Error loading standings:", err);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Liga MATCHPOIN Q1 2027</span>
            </div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">Klasemen Liga</h1>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Klasemen berdasarkan poin kemenangan (3 poin/menang), selisih game, dan total game menang.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <Clock className="w-5 h-5 text-matchpoin-navy mb-1" />
              <div className="text-xs font-bold text-matchpoin-navy">{countdown.days}H {countdown.hours}J {countdown.minutes}M</div>
              <div className="text-[10px] text-slate-500">sisa liga</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap ${
                category === c.id
                  ? "bg-matchpoin-navy text-white border-matchpoin-navy"
                  : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : standings.length === 0 ? (
          <Card className="border-slate-200">
            <CardContent className="p-8 text-center">
              <Users className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <CardTitle className="text-sm">Belum Ada Data Klasemen</CardTitle>
              <p className="text-xs text-slate-500">Klasemen akan muncul setelah ada pertandingan yang selesai dan dikonfirmasi.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <span className="col-span-1 text-center">#</span>
              <span className="col-span-4">Pemain</span>
              <span className="col-span-2 text-center">Poin</span>
              <span className="col-span-2 text-center">W · L</span>
              <span className="col-span-2 text-center">Games</span>
              <span className="col-span-1 text-center">Trust</span>
            </div>
            <div className="divide-y divide-slate-100">
              {standings.map((s) => (
                <div key={s.userId} className="grid grid-cols-12 gap-3 px-5 py-3 items-center text-sm hover:bg-slate-50 transition-colors">
                  <div className="col-span-1 text-center font-bold text-slate-500">{s.rank}</div>
                  <div className="col-span-4 min-w-0 flex items-center gap-2">
                    {s.avatarUrl ? (
                      <img src={s.avatarUrl} alt={s.name} className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-matchpoin-navy text-white flex items-center justify-center text-sm font-bold">
                        {s.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-slate-900 truncate">{s.name}</div>
                      <div className="text-[10px] text-slate-400">{s.matchesPlayed} match</div>
                    </div>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`font-extrabold font-heading ${s.rank <= 3 ? "text-matchpoin-tennis" : "text-matchpoin-navy"}`}>
                      {s.points}
                    </span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className="font-bold text-emerald-600">{s.wins}</span>
                    <span className="text-slate-300"> · </span>
                    <span className="font-bold text-rose-600">{s.losses}</span>
                  </div>
                  <div className="col-span-2 text-center">
                    <span className={`font-bold ${s.gameDiff >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                      {s.gameDiff >= 0 ? "+" : ""}{s.gameDiff}
                    </span>
                    <div className="text-[10px] text-slate-400">{s.gamesFor} − {s.gamesAgainst}</div>
                  </div>
                  <div className="col-span-1 text-center">
                    <Badge variant="outline" className="text-[9px]">
                      {s.points > 0 ? <Flame className="w-3 h-3 mr-1" /> : ""}{s.points > 50 ? "50+" : s.points}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-500">
          <Trophy className="w-4 h-4 text-matchpoin-tennis shrink-0 mt-0.5" />
          <p>
            Sistem poin: Menang 3 poin · Kalah 0 poin · WO menang 3 poin (8–0) · WO kalah 0 poin (0–8).
            Anti-rematch aktif: setiap pasangan hanya bertanding 1x per musim.
          </p>
        </div>
      </div>
    </div>
  );
}
