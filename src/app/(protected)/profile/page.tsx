"use client";

import React, { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { calculateProfileCompletion } from "@/lib/services/player-service";
import type { PlayerStats } from "@/lib/services/match-history-service";
import {
  User,
  Edit,
  MapPin,
  Trophy,
  Calendar,
  CheckCircle2,
  Clock,
  Shield,
  Loader2,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import type { DbUser, PlayerProfile, PlayerRating, City } from "@/types/database.types";
import { MPR_STARTING_RATING } from "@/lib/rating/mpr-core.mjs";

export default function ProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<DbUser | null>(null);
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [rating, setRating] = useState<PlayerRating | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const supabase = createClient();
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();

        if (!authUser) {
          router.push("/login?redirectTo=/profile");
          return;
        }

        // Fetch user from public.users
        const { data: userData } = await supabase
          .from("users")
          .select("*")
          .eq("id", authUser.id)
          .maybeSingle();

        if (userData) {
          setUser(userData as DbUser);
          if (userData.city_id) {
            const { data: cityData } = await supabase
              .from("cities")
              .select("*")
              .eq("id", userData.city_id)
              .maybeSingle();
            if (cityData) setCity(cityData as City);
          }
        }

        // Fetch player profile
        const { data: profileData } = await supabase
          .from("player_profiles")
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (profileData) {
          setProfile(profileData as PlayerProfile);
        }

        // Fetch player rating
        const { data: ratingData } = await supabase
          .from("player_ratings")
          .select("*")
          .eq("user_id", authUser.id)
          .maybeSingle();

        if (ratingData) {
          setRating(ratingData as PlayerRating);
        }

        try {
          const historyRes = await fetch("/api/profile/history");
          const historyJson = (await historyRes.json()) as { success?: boolean; stats?: PlayerStats };
          if (historyJson.success && historyJson.stats) {
            setStats(historyJson.stats);
          }
        } catch {
          // Stats are supplementary; the profile still renders without them.
        }
      } catch (err) {
        console.error("Error loading profile:", err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-matchpoin-navy" />
          <p className="text-sm font-medium">Memuat Profil Pemain...</p>
        </div>
      </div>
    );
  }

  const completion = calculateProfileCompletion(user, profile);
  const currentRating = Number(rating?.current_rating ?? MPR_STARTING_RATING);

  const getRatingCategory = (r: number) => {
    if (r >= 2500) return "Expert";
    if (r >= 2000) return "Advanced";
    if (r >= 1500) return "Intermediate";
    return "Beginner";
  };

  const handLabel = profile?.preferred_hand === "left" ? "Kiri (Left-Handed)" : "Kanan (Right-Handed)";
  const backhandLabel = profile?.backhand === "one_handed" ? "Satu Tangan (One-Handed)" : "Dua Tangan (Two-Handed)";
  const genderLabel = user?.gender === "male" ? "Laki-laki" : user?.gender === "female" ? "Perempuan" : "Belum diatur";

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl space-y-6">
        {/* Profile Card Header */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              {user?.avatar_url ? (
                <Image
                  src={user.avatar_url}
                  alt={user.full_name || "Foto Profil"}
                  width={80}
                  height={80}
                  className="rounded-full object-cover border-4 border-slate-100 shadow-sm"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-matchpoin-navy text-white flex items-center justify-center text-2xl font-bold font-heading shadow-sm">
                  {(user?.full_name || "P").charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold font-heading text-slate-900">
                  {user?.full_name || profile?.display_name || "Pemain MATCHPOIN"}
                </h1>
                {profile?.is_verified_player && (
                  <Badge variant="success" className="text-[10px]">
                    Terverifikasi
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400" />
                <span>{city?.name || "Makassar"}, {city?.province || "Sulawesi Selatan"}</span>
              </p>
              <div className="pt-0.5">
                <Badge variant="secondary" className="text-xs">
                  {profile?.profile_visibility === "public" ? "Profil Publik" : "Profil Privat"}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
            <Link href="/profile/edit" className="w-full">
              <Button variant="tennis" className="w-full text-matchpoin-navy font-bold gap-2">
                <Edit className="w-4 h-4" />
                Edit Profil Lengkap
              </Button>
            </Link>
          </div>
        </div>

        {/* Profile Completion Bar */}
        <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Kelengkapan Profil Pemain
            </span>
            <span className="font-extrabold text-matchpoin-navy font-heading">
              {completion.percentage}%
            </span>
          </div>

          <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-matchpoin-tennis h-full rounded-full transition-all duration-500"
              style={{ width: `${completion.percentage}%` }}
            />
          </div>

          {completion.missingFields.length > 0 && (
            <p className="text-[11px] text-slate-500 pt-1">
              Lengkapi informasi berikut untuk meningkatkan peluang matchmaking:{" "}
              <strong className="text-slate-700">{completion.missingFields.join(", ")}</strong>.
            </p>
          )}
        </div>

        {/* Grid Information */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Rating & Match Records */}
          <div className="space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardDescription className="text-xs uppercase font-bold text-slate-500">
                  MPR Rating
                </CardDescription>
                <div className="flex items-baseline justify-between mt-1">
                  <div className="text-3xl font-extrabold font-heading text-matchpoin-navy">
                    {Math.round(currentRating)}
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
                    {getRatingCategory(currentRating)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 pt-2">
                <div className="text-xs text-slate-600 flex justify-between py-1 border-b border-slate-100">
                  <span>Rating Tertinggi (Peak):</span>
                  <span className="font-bold text-slate-800">
                    {Math.round(rating?.peak_rating || currentRating)}
                  </span>
                </div>
                <div className="text-xs text-slate-600 flex justify-between py-1 border-b border-slate-100">
                  <span>Pertandingan Dimainkan:</span>
                  <span className="font-bold text-slate-800">{rating?.matches_played || 0}</span>
                </div>
                <div className="text-xs text-slate-600 flex justify-between py-1 border-b border-slate-100">
                  <span>Menang (Wins):</span>
                  <span className="font-bold text-emerald-600">{rating?.wins || 0}</span>
                </div>
                <div className="text-xs text-slate-600 flex justify-between py-1">
                  <span>Kalah (Losses):</span>
                  <span className="font-bold text-rose-600">{rating?.losses || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-800">
                  Informasi Kontak
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs space-y-2 text-slate-600">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-400">Email:</span>
                  <span className="font-medium text-slate-800 truncate max-w-[150px]">{user?.email}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Nomor Telepon:</span>
                  <span className="font-medium text-slate-800">{user?.phone || "Belum diatur"}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Playing Style & Attributes */}
          <div className="md:col-span-2 space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-800">
                  Atribut Permainan Tenis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="block text-[11px] text-slate-400 font-semibold mb-1">Tangan Dominan</span>
                    <span className="text-sm font-bold text-slate-800">{handLabel}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="block text-[11px] text-slate-400 font-semibold mb-1">Gaya Backhand</span>
                    <span className="text-sm font-bold text-slate-800">{backhandLabel}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="block text-[11px] text-slate-400 font-semibold mb-1">Jenis Kelamin</span>
                    <span className="text-sm font-bold text-slate-800">{genderLabel}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="block text-[11px] text-slate-400 font-semibold mb-1">Frekuensi Bermain</span>
                    <span className="text-sm font-bold text-slate-800 capitalize">
                      {profile?.play_frequency || "Belum ditentukan"}
                    </span>
                  </div>
                </div>

                {profile?.bio ? (
                  <div className="pt-2">
                    <h4 className="text-xs font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                      Bio & Pengalaman
                    </h4>
                    <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {profile.bio}
                    </p>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-slate-400 text-xs">
                    Belum ada bio atau cerita tenis yang ditambahkan.
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-800">
                  Preferensi Matchmaking
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div>
                  <span className="text-slate-500 font-medium block mb-1">Waktu Bermain Pilihan:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile?.preferred_times && profile.preferred_times.length > 0 ? (
                      profile.preferred_times.map((t) => (
                        <Badge key={t} variant="secondary" className="capitalize">
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">Fleksibel / Belum ditentukan</span>
                    )}
                  </div>
                </div>

                <div className="pt-2">
                  <span className="text-slate-500 font-medium block mb-1">Kategori Pertandingan:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile?.preferred_categories && profile.preferred_categories.length > 0 ? (
                      profile.preferred_categories.map((c) => (
                        <Badge key={c} variant="secondary" className="capitalize">
                          {c}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">Semua Kategori (Singles & Doubles)</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Match Statistics & Recent History */}
        <Card className="border-slate-200">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-slate-800">Statistik & Riwayat</CardTitle>
              <CardDescription className="text-xs">
                5 pertandingan terakhir beserta perubahan rating MPR.
              </CardDescription>
            </div>
            <Link href="/profile/history">
              <Button variant="outline" size="sm" className="text-xs">
                Lihat Pertandingan
              </Button>
            </Link>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Total</p>
                <p className="text-xl font-extrabold font-heading text-slate-800">{stats?.totalMatches ?? 0}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                <p className="text-[10px] uppercase font-semibold text-emerald-600">Menang</p>
                <p className="text-xl font-extrabold font-heading text-emerald-700">{stats?.wins ?? 0}</p>
              </div>
              <div className="p-3 bg-rose-50 rounded-xl border border-rose-100 text-center">
                <p className="text-[10px] uppercase font-semibold text-rose-600">Kalah</p>
                <p className="text-xl font-extrabold font-heading text-rose-700">{stats?.losses ?? 0}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-center">
                <p className="text-[10px] uppercase font-semibold text-slate-400">Win Rate</p>
                <p className="text-xl font-extrabold font-heading text-matchpoin-navy">{stats?.winPercentage ?? 0}%</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 border border-slate-100 rounded-xl">
                <p className="text-slate-400 uppercase text-[10px] font-semibold">Tunggal</p>
                <p className="font-bold text-slate-800 mt-0.5">
                  {stats?.singlesWins ?? 0}M · {stats?.singlesLosses ?? 0}K
                </p>
              </div>
              <div className="p-3 border border-slate-100 rounded-xl">
                <p className="text-slate-400 uppercase text-[10px] font-semibold">Ganda</p>
                <p className="font-bold text-slate-800 mt-0.5">
                  {stats?.doublesWins ?? 0}M · {stats?.doublesLosses ?? 0}K
                </p>
              </div>
            </div>

            {stats && stats.recentMatches.length > 0 && (
              <div className="space-y-1.5 pt-1">
                {stats.recentMatches.slice(0, 5).map((entry) => (
                  <Link
                    key={`${entry.id}-${entry.matchDate}`}
                    href={`/matches/${entry.id}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border border-slate-100 hover:bg-slate-50 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-800 truncate">{entry.title}</p>
                      <p className="text-[10px] text-slate-400">{entry.categoryLabel}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {entry.scoreA !== null && entry.scoreB !== null ? (
                        <p className="font-bold text-slate-800">{entry.scoreA}–{entry.scoreB}</p>
                      ) : (
                        <p className="text-slate-400">-</p>
                      )}
                      {entry.ratingChange !== null && (
                        <p
                          className={`text-[10px] font-bold ${
                            entry.ratingChange > 0
                              ? "text-emerald-600"
                              : entry.ratingChange < 0
                              ? "text-rose-600"
                              : "text-slate-500"
                          }`}
                          title={
                            entry.ratingBefore !== null && entry.ratingAfter !== null
                              ? `${Math.round(entry.ratingBefore)} → ${Math.round(entry.ratingAfter)}`
                              : undefined
                          }
                        >
                          MPR {entry.ratingChange > 0 ? "+" : ""}
                          {Math.round(entry.ratingChange)}
                        </p>
                      )}
                      <p
                        className={`text-[10px] font-semibold ${
                          entry.result === "win"
                            ? "text-emerald-600"
                            : entry.result === "loss"
                            ? "text-rose-600"
                            : "text-slate-400"
                        }`}
                      >
                        {entry.result === "win"
                          ? "Menang"
                          : entry.result === "loss"
                          ? "Kalah"
                          : entry.resultStatus === "pending"
                          ? "Pending"
                          : "—"}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
