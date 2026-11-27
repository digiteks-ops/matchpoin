"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Trophy, Search, MapPin, Medal, Crown, TrendingUp, Building2 } from "lucide-react";
import {
  RATING_TIER_OPTIONS,
  matchesRatingTier,
  ratingTierLabel,
} from "@/lib/rating/rating-tier-core.mjs";
import { MPR_STARTING_RATING, mprIsCalibrating } from "@/lib/rating/mpr-core.mjs";
import { DEFAULT_PROVINCE, findDefaultCity } from "@/lib/constants/location";

interface LeaderboardRow {
  userId: string;
  name: string;
  rating: number;
  peakRating: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  winRate: number;
  province: string;
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
  province: string | null;
  cityName: string;
  cityId: string | null;
}

interface CommunityRanking {
  id: string;
  name: string;
  city: string | null;
  memberCount: number;
  averageRating: number;
  totalWins: number;
}

interface LeaderboardResponse {
  success: boolean;
  players: LeaderboardPlayerData[];
  cities: CityOption[];
  communities?: CommunityRanking[];
  message?: string;
}

function leaderboardRow(player: LeaderboardPlayerData): LeaderboardRow {
  const matchesPlayed = player.matchesPlayed ?? 0;
  const wins = player.wins ?? 0;
  return {
    userId: player.userId,
    name: player.fullName || player.displayName || "Pemain MATCHPOIN",
    rating: player.currentRating ?? MPR_STARTING_RATING,
    peakRating: player.peakRating ?? player.currentRating ?? MPR_STARTING_RATING,
    matchesPlayed,
    wins,
    losses: player.losses ?? 0,
    winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
    province: player.province || "",
    cityName: player.cityName || "Makassar",
    cityId: player.cityId,
    // Kalibrasi = 2 pertandingan pertama; sesudahnya rating jadi ranking resmi.
    isProvisional: mprIsCalibrating(matchesPlayed),
    selfAssessedLevel: player.selfAssessedLevel,
  };
}

function provinceOptionsFrom(cities: CityOption[]): string[] {
  return Array.from(new Set(cities.map((city) => city.province).filter(Boolean))).sort();
}

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [communityRankings, setCommunityRankings] = useState<CommunityRanking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCity, setSelectedCity] = useState("all");
  // Filter tingkat MPR: beginner 0–1099, intermediate 1100–1599,
  // advanced 1600–1999, expert 2000+.
  const [selectedLevel, setSelectedLevel] = useState("all");
  // Lokasi bawaan: Sulawesi Selatan, Kota Makassar.
  const [province, setProvince] = useState<string>(DEFAULT_PROVINCE);
  const [provinceOptions, setProvinceOptions] = useState<string[]>([]);
  const defaultLocationApplied = useRef(false);

  const applyDefaultLocation = useCallback(
    (list: Array<{ id: string; name: string; province?: string | null }>) => {
      if (defaultLocationApplied.current) return;
      defaultLocationApplied.current = true;
      if (!list.some((city) => city.province === DEFAULT_PROVINCE)) {
        setProvince("");
        return;
      }
      setProvince(DEFAULT_PROVINCE);
      const city = findDefaultCity(list);
      if (city) setSelectedCity(city.id);
    },
    []
  );

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/leaderboard", { cache: "no-store" });
        const result = (await response.json()) as LeaderboardResponse;
        if (!response.ok || !result.success) {
          throw new Error(result.message || "Respons leaderboard tidak valid.");
        }

        const cityOptions = result.cities.map(({ id, name, province }) => ({
          id,
          name,
          province,
        }));
        setCities(cityOptions);
        setProvinceOptions(provinceOptionsFrom(cityOptions));
        applyDefaultLocation(cityOptions);

        const merged = result.players.map(leaderboardRow);
        merged.sort(
          (a, b) =>
            b.rating - a.rating ||
            b.wins - a.wins ||
            b.matchesPlayed - a.matchesPlayed ||
            a.name.localeCompare(b.name)
        );

        setRows(merged);
        setCommunityRankings(result.communities ?? []);
      } catch (err) {
        console.error("Error loading leaderboard:", err);
        setLoadError("Gagal memuat leaderboard. Coba lagi.");
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, [applyDefaultLocation]);

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

  const provinceByCity = useMemo(
    () => new Map(cities.map((city) => [city.id, city.province])),
    [cities]
  );

  const ranked = filtered.map((row, index) => ({
    ...row,
    rank: index + 1,
    province: row.province || (row.cityId ? provinceByCity.get(row.cityId) ?? "" : ""),
    level: ratingTierLabel(row.rating),
  }));
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
              Peringkat berdasarkan MPR (MatchPoin Rating) dari pertandingan yang telah dikonfirmasi.
            </p>
            <p className="text-[11px] text-slate-500 max-w-xl leading-relaxed">
              Rating MPR setiap pemain terpublish: semua pemain yang sudah mendaftar langsung
              tampil di sini, termasuk yang belum pernah bertanding (MPR awal 1000). Dua
              pertandingan pertama adalah <strong>kalibrasi</strong>; sesudahnya rating menjadi
              ranking resmi.
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

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="leaderboard-search" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Pemain</Label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <Input
                  id="leaderboard-search"
                  type="search"
                  placeholder="Cari pemain..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-10 pl-9 bg-slate-50 border-slate-200 text-sm"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="leaderboard-province" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Provinsi</Label>
              <select
                id="leaderboard-province"
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

            <div className="space-y-2">
              <Label htmlFor="leaderboard-city" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Kota/Kab</Label>
              <select
                id="leaderboard-city"
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

            <div className="space-y-2">
              <Label htmlFor="leaderboard-level" className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Level</Label>
              <select
                id="leaderboard-level"
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
        </div>

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
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[40%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                </colgroup>
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left">Pemain</th>
                    <th scope="col" className="px-5 py-3 text-left">Provinsi</th>
                    <th scope="col" className="px-5 py-3 text-left">Kota/Kab</th>
                    <th scope="col" className="px-5 py-3 text-left">Level</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ranked.map((p) => (
                    <tr key={p.userId} className="h-14">
                      <td className="px-5 py-2 align-middle">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-6 shrink-0 text-center text-xs font-bold text-slate-500">{p.rank}</span>
                          <div className="min-w-0">
                            <Link href={`/players/${p.userId}`} className="block truncate font-semibold text-slate-900 hover:text-matchpoin-navy">
                              {p.name}
                            </Link>
                            <span className="block truncate text-[10px] text-slate-400">
                              MPR {Math.round(p.rating)} · {p.wins}W {p.losses}L
                              {p.isProvisional ? " · Kalibrasi" : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-2 align-middle text-xs text-slate-600">
                        <span className="block truncate">{p.province || "-"}</span>
                      </td>
                      <td className="px-5 py-2 align-middle text-xs text-slate-600">
                        <span className="block truncate">{p.cityName || "-"}</span>
                      </td>
                      <td className="px-5 py-2 align-middle">
                        <Badge variant="outline" className="text-[10px] font-semibold text-slate-600">
                          {p.level}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!isLoading && !loadError && communityRankings.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-200 px-5 py-4">
              <Building2 className="h-4 w-4 text-matchpoin-tennis" />
              <h2 className="font-heading text-sm font-bold text-slate-900">Peringkat Komunitas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed text-sm">
                <colgroup>
                  <col className="w-[10%]" />
                  <col className="w-[42%]" />
                  <col className="w-[18%]" />
                  <col className="w-[15%]" />
                  <col className="w-[15%]" />
                </colgroup>
                <thead className="bg-slate-50 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-200">
                  <tr>
                    <th scope="col" className="px-5 py-3 text-left">#</th>
                    <th scope="col" className="px-5 py-3 text-left">Komunitas</th>
                    <th scope="col" className="px-5 py-3 text-left">Kota</th>
                    <th scope="col" className="px-5 py-3 text-left">Anggota</th>
                    <th scope="col" className="px-5 py-3 text-left">Rata-rata MPR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {communityRankings.map((c, index) => (
                    <tr key={c.id} className="h-14">
                      <td className="px-5 py-2 align-middle text-xs font-bold text-slate-500">{index + 1}</td>
                      <td className="px-5 py-2 align-middle">
                        <Link href={`/communities/${c.id}`} className="block truncate font-semibold text-slate-900 hover:text-matchpoin-navy">
                          {c.name}
                        </Link>
                        <span className="block truncate text-[10px] text-slate-400">{c.totalWins} kemenangan anggota</span>
                      </td>
                      <td className="px-5 py-2 align-middle text-xs text-slate-600">
                        <span className="block truncate">{c.city || "-"}</span>
                      </td>
                      <td className="px-5 py-2 align-middle text-xs text-slate-600">{c.memberCount}</td>
                      <td className="px-5 py-2 align-middle">
                        <span className="font-extrabold font-heading text-matchpoin-navy">{c.averageRating}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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