"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2, Clock } from "lucide-react";
import type { FullPlayerProfile } from "@/types/database.types";
import {
  formatLastSeen,
  formatLastSeenExact,
  LAST_SEEN_NEVER_LABEL,
} from "@/lib/players/last-seen-core.mjs";
import { ratingTierLabel, ratingTierOf } from "@/lib/rating/rating-tier-core.mjs";

interface PlayerCardProps {
  player: FullPlayerProfile;
  onInvite?: (player: FullPlayerProfile) => void;
  isInviting?: boolean;
}

export function PlayerCard({ player, onInvite, isInviting = false }: PlayerCardProps) {
  const getRatingBadgeColor = (rating: number) => {
    const tier = ratingTierOf(rating);
    if (tier === "expert") return "bg-rose-100 text-rose-800 border-rose-300";
    if (tier === "advanced") return "bg-purple-100 text-purple-800 border-purple-300";
    if (tier === "intermediate") return "bg-amber-100 text-amber-800 border-amber-300";
    return "bg-blue-100 text-blue-800 border-blue-300";
  };

  const getRatingTier = (rating: number) => ratingTierLabel(rating);

  const handLabel =
    player.preferredHand === "left"
      ? "Kidal (Left)"
      : "Kanan (Right)";

  const levelLabel =
    player.selfAssessedLevel === "expert"
      ? "Expert"
      : player.selfAssessedLevel === "advanced"
      ? "Advanced"
      : player.selfAssessedLevel === "intermediate"
      ? "Intermediate"
      : "Beginner";

  return (
    <Card className="hover:shadow-md transition-all duration-200 border-slate-200/90 flex flex-col justify-between overflow-hidden group">
      <div>
        {/* Top Header with Avatar & Rating */}
        <CardHeader className="p-4 pb-3 flex flex-row items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              {player.avatarUrl ? (
                <Image
                  src={player.avatarUrl}
                  alt={player.displayName}
                  width={48}
                  height={48}
                  className="rounded-full object-cover border-2 border-white shadow-sm"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-matchpoin-navy text-white flex items-center justify-center font-bold font-heading text-lg shadow-sm">
                  {player.displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <div className="space-y-0.5">
              <Link
                href={`/players/${player.userId}`}
                className="font-bold font-heading text-slate-900 hover:text-matchpoin-navy transition-colors text-base line-clamp-1"
              >
                {player.displayName}
              </Link>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>{[player.cityName, player.province].filter(Boolean).join(", ") || "Makassar"}</span>
              </div>
              <div
                className="flex items-center gap-1.5 text-[11px] text-slate-400"
                title={formatLastSeenExact(player.lastSeenAt) || LAST_SEEN_NEVER_LABEL}
              >
                <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                <span className="truncate">
                  Login: {formatLastSeen(player.lastSeenAt)}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end">
            <div
              className={`px-2.5 py-1 rounded-lg border text-xs font-black font-heading tracking-tight ${getRatingBadgeColor(
                player.currentRating
              )}`}
              title="MPR (MatchPoin Rating) — rating setiap pemain terbuka untuk semua pemain"
            >
              {Math.round(player.currentRating)}
              {player.isProvisional && (
                <span
                  className="ml-1 text-[9px] font-normal text-amber-700"
                  title="Masih kalibrasi: 2 pertandingan pertama"
                >
                  (K)
                </span>
              )}
            </div>
            <span className="text-[10px] text-slate-400 font-medium mt-0.5">
              {getRatingTier(player.currentRating)}
            </span>
          </div>
        </CardHeader>

        {/* Content Details */}
        <CardContent className="p-4 pt-1 space-y-3">
          {player.bio && (
            <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed italic">
              &ldquo;{player.bio}&rdquo;
            </p>
          )}

          {/* Attributes tags */}
          <div className="flex flex-wrap gap-1.5 text-[11px]">
            <Badge variant="secondary" className="font-normal text-slate-600 bg-slate-100">
              {handLabel}
            </Badge>
            <Badge variant="secondary" className="font-normal text-slate-600 bg-slate-100">
              {levelLabel}
            </Badge>
            {player.playFrequency && (
              <Badge variant="secondary" className="font-normal text-slate-600 bg-slate-100">
                Main: {player.playFrequency}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-3 gap-1 bg-slate-50 rounded-lg p-2 text-center text-xs border border-slate-100">
            <div>
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Tanding</span>
              <span className="font-bold text-slate-800">{player.matchesPlayed}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Menang</span>
              <span className="font-bold text-emerald-600">{player.wins}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 uppercase font-semibold">Win Rate</span>
              <span className="font-bold text-slate-800">{player.winRate}%</span>
            </div>
          </div>
        </CardContent>
      </div>

      {/* Action Buttons */}
      <div className="p-4 pt-0 grid grid-cols-2 gap-2">
        <Link href={`/players/${player.userId}`} className="w-full">
          <Button variant="outline" size="sm" className="w-full text-xs">
            Lihat Profil
          </Button>
        </Link>
        <Button
          variant="tennis"
          size="sm"
          className="w-full text-xs text-matchpoin-navy font-bold"
          onClick={() => onInvite?.(player)}
          disabled={isInviting}
        >
          {isInviting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Undang Tanding"}
        </Button>
      </div>
    </Card>
  );
}
