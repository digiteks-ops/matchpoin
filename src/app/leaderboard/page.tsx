"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMySqlPublicPlayers,
  isMySqlPublicPlayerReads,
  type MySqlPlayerCity,
} from "@/lib/mysql/public-player-client";
import { Trophy, Search, MapPin, Medal, Crown, TrendingUp, Lock } from "lucide-react";
import {
  LEADERBOARD_MIN_MATCHES_NON_BEGINNER,
  isLeaderboardEligible,
  leaderboardMatchesRemaining,
  leaderboardRequiresMatches,
} from "@/lib/rating/leaderboard-visibility-core.mjs";
import {
  RATING_TIER_OPTIONS,
  matchesRatingTier,
} from "@/lib/rating/rating-tier-core.mjs";

interface LeaderboardRow {
  userId: string;
  name: string;
  rating: number;
  peakRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  cityName: string;
  cityId: string | null;
  isProvisional: boolean;
  selfAssessedLevel: string | null;
}

interface CityOption {
  id: string;
  name: string;
  province: string;
}

interface SupabasePublicPlayer {
  user_id: string;
  display_name: string | null;
  full_name: string | null;
  current_rating: number | string | null;
  peak_rating: number | string | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  city_name: string | null;
  city_id: string | null;
  self_assessed_level: string | null;
  show_rating?: boolean | null;
}

interface LeaderboardPlayerData {
  userId: string;
  fullName: string;
  displayName: string;
  currentRating: number | null;
  peakRating: number | null;
  matchesPlayed: number | null;
  wins: number | null;
  losses: number | null;
  selfAssessedLevel: string | null;
  cityName: string;
  cityId: string | null;
}

function leaderboardRow(player: LeaderboardPlayerData): LeaderboardRow {
  const matchesPlayed = player.matchesPlayed ?? 0;
  const wins = player.wins ?? 0;
  return {
    userId: player.userId,
    name: player.fullName || player.displayName || "Pemain MATCHPOIN",
    rating: player.currentRating ?? 1000,
    peakRating: player.peakRating ?? player.currentRating ?? 1000000,
    matchesPlayed,
    wins,
    losses: player.losses ?? 0,
    winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
    cityName: player.cityName || "Makassar",
    cityId: player.cityId,
    isProvisional: matchesPlayed === 0,
    selfAssessedLevel: player.selfAssessedLevel,
  };
}

function provinceOptionsFrom(cities: CityOption[]): string[] {
  return Array.from(new Set(cities.map((city) => city.province).filter(Boolean))).sort();
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("all");
  // Filter tingkat rating: beginner 0–1499, intermediate 1500–1999,
  // advanced 2000–2499, expert 2500+.
  const [selectedLevel, setSelectedLevel] = useState("all");
  const [province, setProvince] = useState<string>("");
  const [provinceOptions, setProvinceOptions] = useState<string[]>([]);
  // Dipakai untuk memberi tahu pemain sendiri kalau belum lolos tampil.
  const [myStatus, setMyStatus] = useState<
    { level: string | null; matchesPlayed: number; remaining: number } | null
  >(null);

  useEffect(() => {
    async function load() {
      try {
        if (isMySqlPublicPlayerReads()) {
          const result = await fetchMySqlPublicPlayers(500, "rating");
          const cityOptions = result.cities.map(({ id, name, province }: MySqlPlayerCity) => ({
            id,
            name,
            province,
          }));
          setCities(cityOptions);
          setProvinceOptions(provinceOptionsFrom(cityOptions));
          setRows(
            result.players
              .filter((player) => player.showRating)
              .map(leaderboardRow)
              // Aturan tampil: beginner langsung, level lain menunggu 3 match.
              .filter((row) => isLeaderboardEligible(row.selfAssessedLevel, row.matchesPlayed))
          );
          return;
        }

        const supabase = createClient();
        const [citiesResult, publicPlayersResult] = await Promise.all([
          supabase.from("cities").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
          supabase
            .from("public_players")
            .select("*")
            .limit(500),
        ]);

        // Status pemain yang sedang login, untuk memberi tahu bila belum lolos.
        const { data: authUser } = await supabase.auth.getUser();
        if (authUser?.user) {
          const { data: mine } = await supabase
            .from("public_players")
            .select("self_assessed_level, matches_played")
            .eq("user_id", authUser.user.id)
            .maybeSingle();
          if (mine) {
            const level = (mine.self_assessed_level as string | null) ?? null;
            const played = Number(mine.matches_played ?? 0);
            const remaining = leaderboardMatchesRemaining(level, played);
            if (remaining > 0) setMyStatus({ level, matchesPlayed: played, remaining });
          }
        }

        if (citiesResult.error) throw citiesResult.error;
        if (publicPlayersResult.error) throw publicPlayersResult.error;

        const cityOptions = (citiesResult.data ?? []).map((city) => ({
          id: city.id,
          name: city.name,
          province: city.province,
        }));
        setCities(cityOptions);
        setProvinceOptions(provinceOptionsFrom(cityOptions));

        const publicPlayers = (publicPlayersResult.data ?? []) as unknown as SupabasePublicPlayer[];
        const merged: LeaderboardRow[] = publicPlayers
          .filter((player) => player.show_rating !== false)
          .map((player) =>
            leaderboardRow({
              userId: player.user_id,
              fullName: player.full_name || "",
              displayName: player.display_name || "",
              currentRating: player.current_rating === null ? null : Number(player.current_rating),
              peakRating: player.peak_rating === null ? null : Number(player.peak_rating),
              matchesPlayed: player.matches_played,
              wins: player.wins,
              losses: player.losses,
              selfAssessedLevel: player.self_assessed_level ?? null,
              cityName: player.city_name || "Makassar",
              cityId: player.city_id,
            })
          )
          // Aturan tampil: beginner langsung, level lain menunggu 3 match.
          .filter((row) => isLeaderboardEligible(row.selfAssessedLevel, row.matchesPlayed));
        merged.sort(
          (a, b) =>
            b.rating - a.rating ||
            b.wins - a.wins ||
            b.matchesPlayed - a.matchesPlayed ||
            a.name.localeCompare(b.name)
        );

        setRows(merged);
      } catch (err) {
        console.error("Error loading leaderboard:", err);
        setLoadError("Gagal memuat leaderboard. Coba lagi.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (province) {
        const provinceCityIds = cities.filter((c) => c.province === province).map((c) => c.id);
        if (r.cityId && !provinceCityIds.includes(r.cityId)) return false;
      }
      if (selectedCity !== "all" && r.cityId !== selectedCity) return false;
      if (!matchesRatingTier(selectedLevel, r.rating)) return false;
      if (searchQuery.trim() && !r.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [rows, searchQuery, selectedCity, province, cities, selectedLevel]);

  const ranked = filtered.map((row, index) => ({ ...row, rank: index + 1 }));
  const podium = ranked.slice(0, 3);

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Peringkat Pemain</span>
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">Leaderboard MATCHPOIN</h1>
              <Badge variant="outline" className="text-xs font-bold uppercase text-matchpoin-tennis border-matchpoin-tennis/20 bg-matchpoin-tennis/5">
                Season 1 League
              </Badge>
            </div>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Peringkat berdasarkan DTR (Dynamic Tennis Rating) dari pertandingan yang telah dikonfirmasi.
            </p>
            <p className="text-[11px] text-slate-500 max-w-xl leading-relaxed">
              Pemain <strong>beginner</strong> langsung tampil. Level{" "}
              <strong>intermediate</strong>, <strong>advanced</strong>, dan{" "}
              <strong>expert</strong> baru tampil setelah{" "}
              <strong>{LEADERBOARD_MIN_MATCHES_NON_BEGINNER} pertandingan</strong> yang hasilnya
              sudah terverifikasi.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/players">
              <Button variant="outline">Cari Lawan</Button>
            </Link>
            <Link href="/matches">
              <Button variant="tennis" className="text-matchpoin-navy font-bold">
                Buat Pertandingan
              </Button>
            </Link>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <Input
              type="search"
              placeholder="Cari pemain..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 bg-slate-50 border-slate-200 text-sm"
            />
          </div>

          <div className="space-y-2 w-full sm:w-56">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provinsi</Label>
            <select
              value={province}
              onChange={(e) => {
                const val = e.target.value;
                setProvince(val);
                setSelectedCity("all");
              }}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-matchpoin-tennis"
            >
              <option value="">Pilih Provinsi...</option>
              {provinceOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2 w-full sm:w-56">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Kota / Kabupaten</Label>
            <select
              value={selectedCity}
              onChange={(e) => setSelectedCity(e.target.value)}
              disabled={!province}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-matchpoin-tennis disabled:opacity-50"
            >
              <option value="all">Semua Kota</option>
              {cities
                .filter((c) => !province || c.province === province)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
          </div>

          <div className="space-y-2 w-full sm:w-48">
            <Label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Level</Label>
            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus:border-matchpoin-tennis"
            >
              {RATING_TIER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {myStatus && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Anda terdaftar sebagai{" "}
              <strong>{myStatus.level ?? "non-beginner"}</strong>, jadi belum tampil di
              leaderboard. Butuh <strong>{myStatus.remaining} pertandingan terverifikasi</strong>{" "}
              lagi ({myStatus.matchesPlayed}/{LEADERBOARD_MIN_MATCHES_NON_BEGINNER}).
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-32 rounded-2xl bg-white border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}
          </div>
        ) : podium.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {podium.map((p, index) => (
              <Card
                key={p.userId}
                className={`border-slate-200 ${index === 0 ? "bg-matchpoin-navy text-white" : "bg-white"}`}
              >
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center font-black font-heading ${
                        index === 0
                          ? "bg-matchpoin-tennis text-matchpoin-navy"
                          : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {p.rank}
                    </div>
                    {index === 0 ? (
                      <Crown className="w-6 h-6 text-matchpoin-tennis" />
                    ) : (
                      <Medal className="w-5 h-5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <p className={`font-bold font-heading truncate ${index === 0 ? "text-white" : "text-slate-900"}`}>
                      {p.name}
                    </p>
                    <p className={`text-xs flex items-center gap-1 ${index === 0 ? "text-slate-300" : "text-slate-500"}`}>
                      <MapPin className="w-3 h-3" />
                      {p.cityName}
                    </p>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className={`text-[10px] uppercase font-bold ${index === 0 ? "text-slate-400" : "text-slate-400"}`}>
                        Rating
                      </p>
                      <p className={`text-2xl font-extrabold font-heading ${index === 0 ? "text-matchpoin-tennis" : "text-matchpoin-navy"}`}>
                        {Math.round(p.rating)}
                      </p>
                    </div>
                    <div className="text-right text-xs">
                      <p className={index === 0 ? "text-slate-300" : "text-slate-500"}>
                        {p.wins}W · {p.losses}L
                      </p>
                      <p className={index === 0 ? "text-slate-400" : "text-slate-400"}>{p.matchesPlayed} match</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Trophy}
            title="Belum Ada Peringkat"
            description="Belum ada pemain publik yang dapat ditampilkan. Jadilah yang pertama tampil di leaderboard."
            action={
              <Link href="/register">
                <Button variant="tennis" className="text-matchpoin-navy font-bold">
                  Daftar Pemain
                </Button>
              </Link>
            }
          />
        )}

        {!isLoading && !loadError && ranked.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="hidden sm:grid grid-cols-12 gap-3 px-5 py-3 bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
              <span className="col-span-1">#</span>
              <span className="col-span-5">Pemain</span>
              <span className="col-span-2">Kota</span>
              <span className="col-span-2 text-right">Rating</span>
              <span className="col-span-2 text-right">Rekor</span>
            </div>
            <div className="divide-y divide-slate-100">
              {ranked.map((p) => (
                <div key={p.userId} className="grid grid-cols-12 gap-3 px-5 py-3 items-center text-sm">
                  <div className="col-span-2 sm:col-span-1">
                    <span className="font-bold text-slate-500">{p.rank}</span>
                  </div>
                  <div className="col-span-10 sm:col-span-5 min-w-0">
                    <Link href={`/players/${p.userId}`} className="font-semibold text-slate-900 hover:text-matchpoin-navy truncate block">
                      {p.name}
                    </Link>
                    <div className="flex items-center gap-2 mt-0.5">
                      {p.isProvisional && (
                        <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-700 border-amber-200">
                          Provisori
                        </Badge>
                      )}
                      <span className="text-[10px] text-slate-400 sm:hidden">{p.cityName}</span>
                    </div>
                  </div>
                  <div className="col-span-4 hidden sm:block sm:col-span-2 text-xs text-slate-500">{p.cityName}</div>
                  <div className="col-span-4 sm:col-span-2 text-right">
                    <span className="font-extrabold font-heading text-matchpoin-navy">{Math.round(p.rating)}</span>
                  </div>
                  <div className="col-span-8 sm:col-span-2 text-right text-xs text-slate-600">
                    <span className="font-bold text-emerald-600">{p.wins}W</span>
                    <span className="text-slate-300"> · </span>
                    <span className="font-bold text-rose-600">{p.losses}L</span>
                    <span className="text-slate-400"> · {p.winRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-500">
          <TrendingUp className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p>
            Rating diperbarui hanya setelah hasil pertandingan dikonfirmasi oleh kedua pihak atau melewati batas sanggahan 24 jam.
          </p>
        </div>
      </div>
    </div>
  );
}