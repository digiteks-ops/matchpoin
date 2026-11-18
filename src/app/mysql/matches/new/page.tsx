"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readErrorMessage } from "@/lib/errors";
import type { MatchCategory, MatchType, UmpirePreference } from "@/lib/matches/constants";
import { fetchMySqlPublicPlayers, type MySqlPublicPlayer } from "@/lib/mysql/public-player-client";

const categories: { id: MatchCategory; label: string }[] = [
  { id: "mens_singles", label: "Tunggal putra" },
  { id: "womens_singles", label: "Tunggal putri" },
  { id: "mens_doubles", label: "Ganda putra" },
  { id: "womens_doubles", label: "Ganda putri" },
  { id: "mixed_doubles", label: "Ganda campuran" },
];

function localDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function MySqlNewMatchPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [courtName, setCourtName] = useState("");
  const [province, setProvince] = useState("");
  const [cityName, setCityName] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [category, setCategory] = useState<MatchCategory>("mens_doubles");
  const [matchType, setMatchType] = useState<MatchType>("open");
  const [players, setPlayers] = useState<MySqlPublicPlayer[]>([]);
  const [partnerUserId, setPartnerUserId] = useState("");
  const [opponentUserId, setOpponentUserId] = useState("");
  const [opponentPartnerUserId, setOpponentPartnerUserId] = useState("");
  const [playerLoadError, setPlayerLoadError] = useState("");
  const [umpireOption, setUmpireOption] = useState<UmpirePreference>("tanpa_wasit");
  const [umpireName, setUmpireName] = useState("");
  const [minRating, setMinRating] = useState(1);
  const [maxRating, setMaxRating] = useState(10);
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isDoubles = category.includes("doubles");
  const isPrivateDoubles = isDoubles && matchType === "private";

  useEffect(() => {
    if (!isPrivateDoubles) return;
    fetchMySqlPublicPlayers(500)
      .then(({ players: result }) => setPlayers(result))
      .catch((error: unknown) =>
        setPlayerLoadError(error instanceof Error ? error.message : "Gagal memuat pemain.")
      );
  }, [isPrivateDoubles]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/mysql/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          courtName: courtName.trim(),
          province: province.trim(),
          cityName: cityName.trim(),
          matchDate,
          startTime,
          durationMinutes,
          category,
          matchType: isDoubles ? matchType : "private",
          partnerUserId: isPrivateDoubles ? partnerUserId : undefined,
          opponentUserId: isPrivateDoubles ? opponentUserId : undefined,
          opponentPartnerUserId: isPrivateDoubles ? opponentPartnerUserId : undefined,
          umpireOption,
          umpireName: umpireOption === "dengan_wasit" ? umpireName.trim() : undefined,
          minRating,
          maxRating,
        }),
      });
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Gagal membuat pertandingan."));
        return;
      }
      const result = (await response.json()) as { matchId?: string };
      if (!result.matchId) {
        setErrorMessage("Pertandingan tersimpan, tetapi ID tidak diterima. Periksa daftar pertandingan.");
        return;
      }
      router.replace(`/mysql/matches/${result.matchId}`);
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal membuat pertandingan.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        <Link href="/mysql/matches" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-matchpoin-navy">
          <ArrowLeft className="h-3.5 w-3.5" />Kembali ke Pertandingan
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900">Buat Pertandingan</h1>
          <p className="mt-1 text-sm text-slate-600">Buat pertandingan baru. Pertandingan tunggal hanya tersedia sebagai privat.</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Detail pertandingan</CardTitle>
            <CardDescription>Pastikan jadwal berada di waktu mendatang dan data lapangan benar.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-5">
              {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
              <div className="space-y-2"><Label htmlFor="mysql-match-title">Judul</Label><Input id="mysql-match-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={100} required disabled={isSubmitting} placeholder="Contoh: Friendly doubles Minggu pagi" /></div>
              <div className="space-y-2"><Label htmlFor="mysql-match-description">Keterangan (opsional)</Label><Textarea id="mysql-match-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={2000} rows={3} disabled={isSubmitting} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="mysql-match-category">Kategori</Label><select id="mysql-match-category" value={category} onChange={(event) => { const next = event.target.value as MatchCategory; setCategory(next); if (next.includes("singles")) setMatchType("private"); }} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" disabled={isSubmitting}>{categories.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-type">Visibilitas</Label><select id="mysql-match-type" value={isDoubles ? matchType : "private"} onChange={(event) => setMatchType(event.target.value as MatchType)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" disabled={isSubmitting || !isDoubles}><option value="open">Terbuka</option><option value="private">Privat</option></select><p className="text-[11px] text-slate-500">{isDoubles && matchType === "open" ? "Pemain lain dapat menemukan dan bergabung." : "Hanya peserta pertandingan yang dapat melihat detail."}</p></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-duration">Durasi</Label><select id="mysql-match-duration" value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" disabled={isSubmitting}><option value={60}>60 menit</option><option value={90}>90 menit</option><option value={120}>120 menit</option><option value={180}>180 menit</option></select></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-date">Tanggal</Label><Input id="mysql-match-date" type="date" min={localDateValue()} value={matchDate} onChange={(event) => setMatchDate(event.target.value)} required disabled={isSubmitting} /></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-time">Waktu mulai (WITA)</Label><Input id="mysql-match-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} required disabled={isSubmitting} /></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-court">Nama lapangan</Label><Input id="mysql-match-court" value={courtName} onChange={(event) => setCourtName(event.target.value)} minLength={2} maxLength={160} required disabled={isSubmitting} /></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-city">Kota</Label><Input id="mysql-match-city" value={cityName} onChange={(event) => setCityName(event.target.value)} required maxLength={120} disabled={isSubmitting} placeholder="Makassar" /></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-province">Provinsi</Label><Input id="mysql-match-province" value={province} onChange={(event) => setProvince(event.target.value)} required maxLength={120} disabled={isSubmitting} placeholder="Sulawesi Selatan" /></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-umpire">Wasit</Label><select id="mysql-match-umpire" value={umpireOption} onChange={(event) => setUmpireOption(event.target.value as UmpirePreference)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" disabled={isSubmitting}><option value="tanpa_wasit">Tanpa wasit</option><option value="dengan_wasit">Dengan wasit</option></select></div>
                {umpireOption === "dengan_wasit" && <div className="space-y-2 sm:col-span-2"><Label htmlFor="mysql-match-umpire-name">Nama wasit (opsional)</Label><Input id="mysql-match-umpire-name" value={umpireName} onChange={(event) => setUmpireName(event.target.value)} maxLength={160} disabled={isSubmitting} /></div>}
              </div>
              {isPrivateDoubles && (
                <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div><h3 className="text-sm font-bold text-slate-800">Pilih susunan pemain</h3><p className="mt-1 text-xs text-slate-500">Tuan rumah dan tiga pemain terpilih langsung dimasukkan ke pertandingan privat.</p></div>
                  {playerLoadError && <p role="alert" className="text-xs text-red-700">{playerLoadError}</p>}
                  <div className="space-y-2">
                    <Label htmlFor="mysql-match-partner">Partner Anda</Label>
                    <select id="mysql-match-partner" value={partnerUserId} onChange={(event) => setPartnerUserId(event.target.value)} required disabled={isSubmitting} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                      <option value="">Pilih pemain</option>
                      {players.map((player) => <option key={player.userId} value={player.userId} disabled={[opponentUserId, opponentPartnerUserId].includes(player.userId)}>{player.displayName} · {player.cityName}</option>)}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mysql-match-opponent">Pemain lawan</Label>
                    <select id="mysql-match-opponent" value={opponentUserId} onChange={(event) => setOpponentUserId(event.target.value)} required disabled={isSubmitting} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                      <option value="">Pilih pemain</option>
                      {players.map((player) => <option key={player.userId} value={player.userId} disabled={[partnerUserId, opponentPartnerUserId].includes(player.userId)}>{player.displayName} · {player.cityName}</option>)}
                    </select>
                  </div>
                    <div className="space-y-2">
                      <Label htmlFor="mysql-match-opponent-partner">Partner lawan</Label>
                      <select id="mysql-match-opponent-partner" value={opponentPartnerUserId} onChange={(event) => setOpponentPartnerUserId(event.target.value)} required disabled={isSubmitting} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
                        <option value="">Pilih pemain</option>
                      {players.map((player) => <option key={player.userId} value={player.userId} disabled={[partnerUserId, opponentUserId].includes(player.userId)}>{player.displayName} · {player.cityName}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="mysql-match-min-rating">Rating minimum</Label><Input id="mysql-match-min-rating" type="number" min={1} max={10} step={0.1} value={minRating} onChange={(event) => setMinRating(Number(event.target.value))} required disabled={isSubmitting} /></div>
                <div className="space-y-2"><Label htmlFor="mysql-match-max-rating">Rating maksimum</Label><Input id="mysql-match-max-rating" type="number" min={1} max={10} step={0.1} value={maxRating} onChange={(event) => setMaxRating(Number(event.target.value))} required disabled={isSubmitting} /></div>
              </div>
            </CardContent>
            <CardFooter><Button type="submit" className="w-full font-bold" disabled={isSubmitting}>{isSubmitting ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Menyimpan...</span> : "Buat Pertandingan"}</Button></CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
