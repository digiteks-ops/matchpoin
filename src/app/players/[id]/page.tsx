"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GuestModal } from "@/components/ui/guest-modal";
import { createClient } from "@/lib/supabase/client";
import {
  fetchMySqlPublicPlayer,
  isMySqlPublicPlayerReads,
} from "@/lib/mysql/public-player-client";
import {
  ArrowLeft,
  MapPin,
  ShieldCheck,
  Send,
  Loader2,
  AlertTriangle,
  Pencil,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface PublicPlayerProfile {
  display_name: string | null;
  bio: string | null;
  playing_since: string | null;
  preferred_hand: string | null;
  backhand: string | null;
  play_frequency: string | null;
  preferred_categories: string[];
  preferred_times: string[];
  self_assessed_level: string | null;
  is_verified_player: boolean;
}

interface PublicPlayerRating {
  current_rating: number | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
}

export default function PublicPlayerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id as string;

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<PublicPlayerProfile | null>(null);
  const [rating, setRating] = useState<PublicPlayerRating | null>(null);
  const [showRating, setShowRating] = useState(true);
  const [locationLabel, setLocationLabel] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        if (isMySqlPublicPlayerReads()) {
          setCurrentUser(null);
          const publicPlayer = await fetchMySqlPublicPlayer(playerId);
          if (!publicPlayer) {
            setNotFound(true);
            return;
          }
          setProfile({
            display_name: publicPlayer.displayName,
            bio: publicPlayer.bio,
            playing_since: publicPlayer.playingSince,
            preferred_hand: publicPlayer.preferredHand,
            backhand: publicPlayer.backhand,
            play_frequency: publicPlayer.playFrequency,
            preferred_categories: publicPlayer.preferredCategories,
            preferred_times: publicPlayer.preferredTimes,
            self_assessed_level: publicPlayer.selfAssessedLevel,
            is_verified_player: publicPlayer.isVerifiedPlayer,
          });
          setShowRating(publicPlayer.showRating);
          setRating(
            publicPlayer.showRating
              ? {
                  current_rating: publicPlayer.currentRating,
                  matches_played: publicPlayer.matchesPlayed,
                  wins: publicPlayer.wins,
                  losses: publicPlayer.losses,
                }
              : null
          );
          setLocationLabel(
            [publicPlayer.cityName, publicPlayer.province].filter(Boolean).join(", ")
          );
          return;
        }

        const supabase = createClient();

        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        setCurrentUser(authUser);

        const { data: publicPlayer, error } = await supabase
          .from("public_players")
          .select("*")
          .eq("user_id", playerId)
          .maybeSingle();

        if (error || !publicPlayer) {
          setNotFound(true);
          return;
        }

        setProfile({
          display_name: publicPlayer.display_name,
          bio: publicPlayer.bio,
          playing_since: publicPlayer.playing_since,
          preferred_hand: publicPlayer.preferred_hand,
          backhand: publicPlayer.backhand,
          play_frequency: publicPlayer.play_frequency,
          preferred_categories: publicPlayer.preferred_categories ?? [],
          preferred_times: publicPlayer.preferred_times ?? [],
          self_assessed_level: publicPlayer.self_assessed_level,
          is_verified_player: publicPlayer.is_verified_player ?? false,
        });
        const ratingVisible = publicPlayer.show_rating !== false;
        setShowRating(ratingVisible);

        if (publicPlayer.city_name) {
          setLocationLabel([publicPlayer.city_name, publicPlayer.province].filter(Boolean).join(", "));
        } else {
          setLocationLabel("");
        }

        if (!ratingVisible) {
          setRating(null);
          return;
        }

        const { data: ratingData, error: ratingError } = await supabase
          .from("player_ratings")
          .select("current_rating,matches_played,wins,losses")
          .eq("user_id", playerId)
          .maybeSingle();
        if (ratingError) throw ratingError;
        setRating(ratingData);
      } catch (err) {
        console.error("Error loading public player profile:", err);
        setLoadError("Gagal memuat profil pemain. Coba lagi.");
      } finally {
        setIsLoading(false);
      }
    }

    if (playerId) loadData();
  }, [playerId]);

  const handleInvite = () => {
    if (!currentUser) {
      setIsGuestModalOpen(true);
      return;
    }
    router.push(`/matches/new?invite=${playerId}`);
  };

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

  if (loadError || notFound || !profile) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-bold font-heading text-slate-900">
            {loadError ? "Profil Tidak Tersedia" : "Profil Tidak Ditemukan"}
          </h2>
          <p className="text-xs text-slate-500">
            {loadError || "Profil pemain ini tidak tersedia atau telah diatur menjadi privat."}
          </p>
          <div className="pt-2">
            <Link href="/players">
              <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold">
                Kembali ke Direktori
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const currentRating = Number(rating?.current_rating ?? 1000);
  const isSelf = currentUser?.id === playerId;
  const displayName = profile.display_name || "Pemain MATCHPOIN";

  const getRatingCategory = (r: number) => {
    if (r >= 2500) return "Expert";
    if (r >= 2000) return "Advanced";
    if (r >= 1500) return "Intermediate";
    return "Beginner";
  };

  const handLabel = profile.preferred_hand === "left" ? "Kidal (Left)" : "Kanan (Right)";
  const backhandLabel = profile.backhand === "one_handed" ? "Satu Tangan" : "Dua Tangan";

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href="/players"
            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy transition-colors gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Cari Pemain
          </Link>
          {!currentUser && (
            <span className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-full font-semibold">
              Mode Tamu
            </span>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <div className="w-20 sm:w-24 h-20 sm:h-24 rounded-full bg-matchpoin-navy text-white flex items-center justify-center text-3xl font-extrabold font-heading shadow-sm">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-900">{displayName}</h1>
                {profile.is_verified_player && (
                  <Badge variant="success" className="text-[10px]">
                    Terverifikasi
                  </Badge>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                <span>{locationLabel || "Lokasi belum diisi"}</span>
              </p>
              <div className="flex items-center gap-2 pt-1 text-xs text-slate-500">
                <span>Dominan: <strong>{handLabel}</strong></span>
                <span>•</span>
                <span>Backhand: <strong>{backhandLabel}</strong></span>
              </div>
            </div>
          </div>

          <div className="w-full sm:w-auto">
            {isSelf ? (
              <Link href="/profile/edit" className="w-full block">
                <Button variant="outline" className="w-full sm:w-auto gap-2">
                  <Pencil className="w-4 h-4" />
                  Edit Profil Saya
                </Button>
              </Link>
            ) : (
              <Button
                variant="tennis"
                size="lg"
                onClick={handleInvite}
                className="w-full sm:w-auto text-matchpoin-navy font-bold gap-2"
              >
                <Send className="w-4 h-4" />
                Undang Bertanding
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-6">
            {showRating ? (
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardDescription className="text-xs uppercase font-bold text-slate-500">
                    DTR Rating
                  </CardDescription>
                  <div className="flex items-baseline justify-between mt-1">
                    <div className="text-4xl font-extrabold font-heading text-matchpoin-navy">
                      {Math.round(currentRating)}
                    </div>
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-800 border-emerald-300 font-bold">
                      {getRatingCategory(currentRating)}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 pt-3">
                  <div className="text-xs text-slate-600 flex justify-between py-1 border-b border-slate-100">
                    <span>Status Rating:</span>
                    <span className="font-semibold text-slate-800">
                      {rating?.matches_played && rating.matches_played > 0 ? "Resmi" : "Provisori"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 flex justify-between py-1 border-b border-slate-100">
                    <span>Pertandingan:</span>
                    <span className="font-bold text-slate-800">{rating?.matches_played ?? 0}</span>
                  </div>
                  <div className="text-xs text-slate-600 flex justify-between py-1 border-b border-slate-100">
                    <span>Menang:</span>
                    <span className="font-bold text-emerald-600">{rating?.wins ?? 0}</span>
                  </div>
                  <div className="text-xs text-slate-600 flex justify-between py-1">
                    <span>Kalah:</span>
                    <span className="font-bold text-rose-600">{rating?.losses ?? 0}</span>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200">
                <CardContent className="p-4 text-xs text-slate-500">
                  Pemain memilih untuk menyembunyikan rating dan statistik.
                </CardContent>
              </Card>
            )}

            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Verifikasi MATCHPOIN</span>
              </div>
                <p className="text-slate-500 leading-relaxed text-[11px]">
                  Rating publik dari hasil pertandingan terkonfirmasi.
                </p>
            </div>
          </div>

          <div className="md:col-span-2 space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-slate-800">Tentang Pemain</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs">
                {profile.bio ? (
                  <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                    &ldquo;{profile.bio}&rdquo;
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 italic">Pemain belum menulis deskripsi profil.</p>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold">Level Skill</span>
                    <span className="text-xs font-bold text-slate-800 capitalize">{profile.self_assessed_level || "beginner"}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold">Frekuensi Main</span>
                    <span className="text-xs font-bold text-slate-800 capitalize">{profile.play_frequency || "Fleksibel"}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="block text-[10px] text-slate-400 uppercase font-semibold">Tangan Main</span>
                    <span className="text-xs font-bold text-slate-800">{handLabel}</span>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">Waktu Main Pilihan:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.preferred_times && profile.preferred_times.length > 0 ? (
                      profile.preferred_times.map((t) => (
                        <Badge key={t} variant="secondary" className="capitalize text-xs">
                          {t}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-slate-400 italic text-xs">Fleksibel</span>
                    )}
                  </div>
                </div>

                <div className="pt-1 space-y-2">
                  <span className="text-xs font-bold text-slate-700 block">Kategori Pertandingan:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.preferred_categories && profile.preferred_categories.length > 0 ? (
                      profile.preferred_categories.map((c) => (
                        <Badge key={c} variant="secondary" className="capitalize text-xs">
                          {c}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-slate-400 italic text-xs">Tunggal & Ganda</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <GuestModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        title="Masuk untuk Mengirim Undangan"
        description={`Untuk mengundang ${displayName} bertanding, silakan masuk ke akun MATCHPOIN Anda.`}
        actionText="Masuk"
        redirectTo={`/players/${playerId}`}
      />
    </div>
  );
}