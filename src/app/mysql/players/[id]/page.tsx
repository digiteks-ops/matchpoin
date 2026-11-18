"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, MapPin, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fetchMySqlPublicPlayer, type MySqlPublicPlayer } from "@/lib/mysql/public-player-client";

export default function MySqlPlayerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [player, setPlayer] = useState<MySqlPublicPlayer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    fetchMySqlPublicPlayer(id)
      .then((result) => {
        if (!result) setErrorMessage("Profil pemain tidak ditemukan atau tidak publik.");
        else setPlayer(result);
      })
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Gagal memuat profil pemain."))
      .finally(() => setIsLoading(false));
  }, [id]);

  if (isLoading) return <div className="flex flex-1 items-center justify-center text-sm text-slate-500">Memuat profil pemain...</div>;
  if (!player) return <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center text-sm text-slate-600">{errorMessage || "Profil tidak ditemukan."}<Link href="/mysql/players"><Button variant="outline">Kembali ke pemain</Button></Link></div>;

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto max-w-4xl space-y-5 px-4 sm:px-6">
        <Link href="/mysql/players" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-matchpoin-navy"><ArrowLeft className="h-3.5 w-3.5" />Kembali ke direktori MySQL</Link>
        <div className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-center">
          {player.avatarUrl ? <Image src={player.avatarUrl} alt={player.displayName} width={96} height={96} className="rounded-full object-cover" /> : <div className="flex h-24 w-24 items-center justify-center rounded-full bg-matchpoin-navy text-3xl font-bold text-white">{player.displayName.charAt(0).toUpperCase()}</div>}
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-extrabold text-slate-900">{player.displayName}</h1>{player.isVerifiedPlayer && <Badge variant="success">Terverifikasi</Badge>}</div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500"><MapPin className="h-4 w-4" />{[player.cityName, player.province].filter(Boolean).join(", ") || "Lokasi belum diisi"}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Badge variant="secondary">{player.selfAssessedLevel || "Level belum diatur"}</Badge><Badge variant="secondary">{player.preferredHand === "left" ? "Kidal" : "Kanan"}</Badge><Badge variant="secondary">{player.backhand === "one_handed" ? "Backhand satu tangan" : "Backhand dua tangan"}</Badge></div>
          </div>
          <UserRound className="hidden h-8 w-8 text-slate-300 sm:block" />
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <Card>
            <CardHeader><CardDescription>Rating & rekam tanding</CardDescription><CardTitle>{player.showRating ? (player.currentRating ?? 1).toFixed(2) : "Disembunyikan"}</CardTitle></CardHeader>
            {player.showRating && <CardContent className="space-y-2 text-sm"><p>Pertandingan: {player.matchesPlayed ?? 0}</p><p>Menang: {player.wins ?? 0} · Kalah: {player.losses ?? 0}</p><p>Win rate: {player.winRate}%</p><p>Peak: {(player.peakRating ?? player.currentRating ?? 1).toFixed(2)}</p></CardContent>}
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle>Profil pemain</CardTitle><CardDescription>Informasi profil publik yang dibagikan oleh pemain.</CardDescription></CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div><p className="text-xs text-slate-500">Bio</p><p className="whitespace-pre-wrap">{player.bio || "Belum ada bio."}</p></div>
              <div><p className="text-xs text-slate-500">Frekuensi bermain</p><p className="capitalize">{player.playFrequency || "Belum diatur"}</p></div>
              <div><p className="text-xs text-slate-500">Kategori yang diminati</p><p className="capitalize">{player.preferredCategories.join(", ") || "Belum diatur"}</p></div>
              <div><p className="text-xs text-slate-500">Waktu bermain</p><p className="capitalize">{player.preferredTimes.join(", ") || "Belum diatur"}</p></div>
              {player.playingSince && <div><p className="text-xs text-slate-500">Mulai bermain</p><p>{player.playingSince}</p></div>}
            </CardContent>
          </Card>
        </div>
        <Card><CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center"><p className="text-sm text-slate-600">Email dan data privat tidak ditampilkan.</p><Link href="/mysql/matches"><Button variant="tennis" className="font-bold text-matchpoin-navy">Lihat pertandingan</Button></Link></CardContent></Card>
      </div>
    </div>
  );
}
