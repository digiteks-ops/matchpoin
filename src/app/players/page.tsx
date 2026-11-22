"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerCard } from "@/components/players/player-card";
import { PlayerCardSkeleton } from "@/components/players/player-card-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { GuestModal } from "@/components/ui/guest-modal";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMySqlPublicPlayers,
  isMySqlPublicPlayerReads,
  type MySqlPublicPlayer,
} from "@/lib/mysql/public-player-client";
import { Users, Search, MapPin, UserPlus, X, Loader2 } from "lucide-react";
import type { FullPlayerProfile, City } from "@/types/database.types";
import type { User } from "@supabase/supabase-js";

interface CityOption {
  id: string;
  name: string;
  province: string;
}

function mapMySqlPlayer(player: MySqlPublicPlayer): FullPlayerProfile {
  const matchesPlayed = player.matchesPlayed ?? 0;
  const wins = player.wins ?? 0;
  const losses = player.losses ?? 0;
  return {
    userId: player.userId,
    email: null,
    fullName: player.fullName || player.displayName || "Pemain Tenis",
    displayName: player.displayName || "Pemain MATCHPOIN",
    avatarUrl: player.avatarUrl,
    gender: player.gender,
    cityId: player.cityId,
    cityName: player.cityName || "Lokasi belum diisi",
    province: player.province,
    bio: player.bio,
    preferredHand: player.preferredHand,
    backhand: player.backhand,
    playFrequency: player.playFrequency ?? "weekly",
    selfAssessedLevel: player.selfAssessedLevel ?? "beginner",
    playingSince: player.playingSince,
    preferredCategories: player.preferredCategories,
    preferredTimes: player.preferredTimes,
    currentRating: player.currentRating ?? 1000,
    peakRating: player.peakRating ?? player.currentRating ?? 1000000,
    isProvisional: matchesPlayed === 0,
    matchesPlayed,
    wins,
    losses,
    winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
    completionScore: player.completionScore,
    isProfilePublic: true,
    allowInvites: player.allowInvites,
    showRating: player.showRating,
  };
}

export default function PlayersDirectoryPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [players, setPlayers] = useState<FullPlayerProfile[]>([]);
  const [cities, setCities] = useState<CityOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProvince, setSelectedProvince] = useState<string>("all");
  const [selectedCityId, setSelectedCityId] = useState<string>("all");
  const [selectedLevel, setSelectedLevel] = useState<string>("all");
  const [selectedFormat, setSelectedFormat] = useState<string>("all");

  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [selectedPlayerForInvite, setSelectedPlayerForInvite] = useState<FullPlayerProfile | null>(null);
  const [invitingPlayerId, setInvitingPlayerId] = useState<string | null>(null);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        if (isMySqlPublicPlayerReads()) {
          setCurrentUser(null);
          const result = await fetchMySqlPublicPlayers(100, "name");
          setCities(
            result.cities.map(({ id, name, province }) => ({ id, name, province }))
          );
          setPlayers(result.players.map(mapMySqlPlayer));
          return;
        }

        const supabase = createClient();

        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        setCurrentUser(authUser);

        const [citiesResult, publicPlayersResult] = await Promise.all([
          supabase.from("cities").select("*").eq("is_active", true).order("sort_order", { ascending: true }),
          supabase
            .from("public_players")
            .select("*")
            .order("display_name", { ascending: true })
            .limit(100),
        ]);

        if (citiesResult.error) throw citiesResult.error;
        if (publicPlayersResult.error) throw publicPlayersResult.error;
        if (citiesResult.data) {
          setCities(
            (citiesResult.data as City[]).map(({ id, name, province }) => ({
              id,
              name,
              province,
            }))
          );
        }

        const rawPlayers = (publicPlayersResult.data ?? []) as any[];

        const formatted: FullPlayerProfile[] = rawPlayers
          .filter((p) => p.user_id !== authUser?.id)
          .map((p) => {
            const matchesPlayed = p.matches_played ?? 0;
            const wins = p.wins ?? 0;
            const losses = p.losses ?? 0;

            return {
              userId: p.user_id,
              email: null, // STRICT PRIVACY: NEVER expose email to other players
              fullName: p.full_name || p.display_name || "Pemain Tenis",
              displayName: p.display_name || "Pemain MATCHPOIN",
              avatarUrl:
                p.avatar_url && /^https?:\/\//i.test(p.avatar_url) ? p.avatar_url : null,
              gender: p.gender || null,
              cityId: p.city_id || null,
              cityName: p.city_name || "Lokasi belum diisi",
              province: p.province || null,
              bio: p.bio,
              preferredHand: p.preferred_hand === "left" ? "left" : "right",
              backhand: p.backhand === "one_handed" ? "one_handed" : "two_handed",
              playFrequency:
                p.play_frequency === "daily" ||
                p.play_frequency === "biweekly" ||
                p.play_frequency === "monthly" ||
                p.play_frequency === "occasional"
                  ? p.play_frequency
                  : "weekly",
              selfAssessedLevel:
                p.self_assessed_level === "intermediate" || p.self_assessed_level === "advanced"
                  ? p.self_assessed_level
                  : "beginner",
              playingSince: p.playing_since,
              preferredCategories: p.preferred_categories ?? [],
              preferredTimes: p.preferred_times ?? [],
              currentRating: Number(p.current_rating ?? 1000),
              peakRating: Number(p.peak_rating ?? p.current_rating ?? 1000),
              isProvisional: matchesPlayed === 0,
              matchesPlayed,
              wins,
              losses,
              winRate: matchesPlayed > 0 ? Math.round((wins / matchesPlayed) * 100) : 0,
              completionScore: p.completion_score ?? 50,
              isProfilePublic: true,
              allowInvites: p.allow_invites ?? true,
              showRating: p.show_rating !== false,
            };
          });

        setPlayers(formatted);
      } catch (err) {
        console.error("Error loading players directory:", err);
        setLoadError("Gagal memuat daftar pemain. Coba lagi.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const provinces = useMemo(() => {
    const set = new Set<string>();
    cities.forEach((c) => {
      if (c.province) set.add(c.province);
    });
    players.forEach((p) => {
      if (p.province) set.add(p.province);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [cities, players]);

  const filteredCities = useMemo(() => {
    if (selectedProvince === "all") return cities;
    return cities.filter((c) => c.province === selectedProvince);
  }, [cities, selectedProvince]);

  useEffect(() => {
    if (selectedCityId === "all") return;
    if (!filteredCities.some((c) => c.id === selectedCityId)) {
      setSelectedCityId("all");
    }
  }, [filteredCities, selectedCityId]);

  const handleInvitePlayer = (player: FullPlayerProfile) => {
    if (!currentUser) {
      setSelectedPlayerForInvite(player);
      setIsGuestModalOpen(true);
      return;
    }
    setInvitingPlayerId(player.userId);
    router.push(`/matches/new?invite=${player.userId}`);
  };

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName =
          p.fullName.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q);
        const matchesBio = p.bio?.toLowerCase().includes(q) || false;
        if (!matchesName && !matchesBio) return false;
      }

      if (selectedProvince !== "all" && p.province !== selectedProvince) return false;
      if (selectedCityId !== "all" && p.cityId !== selectedCityId) return false;

      if (selectedLevel !== "all" && p.selfAssessedLevel !== selectedLevel) return false;

      if (selectedFormat !== "all") {
        const categories = p.preferredCategories ?? [];
        if (selectedFormat === "singles") {
          if (!categories.some((c) => c === "singles" || c === "mens_singles" || c === "womens_singles")) {
            return false;
          }
        } else if (selectedFormat === "doubles") {
          if (!categories.some((c) => c === "doubles" || c === "mens_doubles" || c === "womens_doubles")) {
            return false;
          }
        } else if (selectedFormat === "mixed_doubles") {
          if (!categories.includes("mixed_doubles")) return false;
        }
      }

      return true;
    });
  }, [players, searchQuery, selectedProvince, selectedCityId, selectedLevel, selectedFormat]);

  const clearFilters = () => {
    setSearchQuery("");
    setSelectedProvince("all");
    setSelectedCityId("all");
    setSelectedLevel("all");
    setSelectedFormat("all");
  };

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    selectedProvince !== "all" ||
    selectedCityId !== "all" ||
    selectedLevel !== "all" ||
    selectedFormat !== "all";

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <MapPin className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Direktori Pemain</span>
            </div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">
              Cari Lawan Bermain
            </h1>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Temukan pemain dengan level sepadan. Undang tanding atau buat pertandingan terbuka.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link href="/leaderboard" onClick={() => setLeaderboardLoading(true)}>
              <Button variant="outline" className="gap-2" disabled={leaderboardLoading}>
                {leaderboardLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
                Leaderboard
              </Button>
            </Link>
            {!currentUser ? (
              <Link href="/register" onClick={() => setRegisterLoading(true)}>
                <Button variant="tennis" className="text-matchpoin-navy font-bold gap-2" disabled={registerLoading}>
                  {registerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  Daftar Pemain
                </Button>
              </Link>
            ) : (
              <Link href="/matches">
                <Button variant="tennis" className="text-matchpoin-navy font-bold">
                  Buat Pertandingan
                </Button>
              </Link>
            )}
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <Input
                type="search"
                placeholder="Cari nama pemain atau kata kunci..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-slate-50 border-slate-200 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  aria-label="Hapus pencarian"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <select
              value={selectedProvince}
              onChange={(e) => {
                setSelectedProvince(e.target.value);
                setSelectedCityId("all");
              }}
              className="h-10 w-full md:w-48 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
              aria-label="Filter provinsi"
            >
              <option value="all">Semua Provinsi</option>
              {provinces.map((prov) => (
                <option key={prov} value={prov}>
                  {prov}
                </option>
              ))}
            </select>

            <select
              value={selectedCityId}
              onChange={(e) => setSelectedCityId(e.target.value)}
              className="h-10 w-full md:w-52 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
              aria-label="Filter kota/kabupaten"
            >
              <option value="all">Semua Kota/Kabupaten</option>
              {filteredCities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={selectedLevel}
              onChange={(e) => setSelectedLevel(e.target.value)}
              className="h-10 w-full md:w-40 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
              aria-label="Filter level"
            >
              <option value="all">Semua Level</option>
              <option value="beginner">Pemula</option>
              <option value="intermediate">Menengah</option>
              <option value="advanced">Mahir</option>
            </select>

            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="h-10 w-full md:w-44 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
              aria-label="Filter format"
            >
              <option value="all">Semua Format</option>
              <option value="singles">Tunggal</option>
              <option value="doubles">Ganda</option>
              <option value="mixed_doubles">Ganda Campuran</option>
            </select>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
              <span className="text-slate-500">
                Menampilkan <strong>{filteredPlayers.length}</strong> pemain.
              </span>
              <button onClick={clearFilters} className="text-matchpoin-navy font-bold hover:underline">
                Reset Filter
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, idx) => (
              <PlayerCardSkeleton key={idx} />
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {loadError}
          </div>
        ) : filteredPlayers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlayers.map((player) => (
              <PlayerCard
                key={player.userId}
                player={player}
                onInvite={handleInvitePlayer}
                isInviting={invitingPlayerId === player.userId}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="Tidak Ada Pemain Ditemukan"
            description={
              hasActiveFilters
                ? "Tidak ada pemain yang cocok dengan filter ini. Coba ubah filter pencarian."
                : "Belum ada pemain publik. Jadilah yang pertama bergabung!"
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset Filter
                </Button>
              ) : (
                <Link href="/register">
                  <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold">
                    Daftar Pemain
                  </Button>
                </Link>
              )
            }
          />
        )}

        {!currentUser && (
          <div className="bg-matchpoin-navy rounded-2xl p-6 text-white flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
            <div className="space-y-1 text-center sm:text-left">
              <h3 className="text-base font-bold font-heading">Ingin mengundang pemain bertanding?</h3>
              <p className="text-xs text-slate-300 max-w-lg leading-relaxed">
                Buat akun gratis untuk mengirim undangan, membuat pertandingan terbuka, dan meningkatkan DTR (Dynamic Tennis Rating).
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/login">
                <Button variant="outline" size="sm" className="border-white/30 text-white bg-transparent hover:bg-white/10 text-xs">
                  Masuk
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold text-xs">
                  Daftar
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      <GuestModal
        isOpen={isGuestModalOpen}
        onClose={() => {
          setIsGuestModalOpen(false);
          setSelectedPlayerForInvite(null);
        }}
        title="Masuk untuk Mengundang Pemain"
        description={
          selectedPlayerForInvite
            ? `Untuk mengundang ${selectedPlayerForInvite.displayName} bertanding, silakan masuk atau daftarkan akun MATCHPOIN.`
            : "Aktivitas mengirim undangan pertandingan memerlukan akun MATCHPOIN."
        }
        actionText="Masuk"
        redirectTo={`/players/${selectedPlayerForInvite?.userId || ""}`}
      />
    </div>
  );
}