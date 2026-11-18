"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readErrorMessage } from "@/lib/errors";

interface MatchResult {
  id: string;
  team1Score: number;
  team2Score: number;
  winnerTeam: 1 | 2;
  submittedBy: string | null;
  status: "pending" | "confirmed" | "under_review";
  submittedAt: string;
  confirmedAt: string | null;
  disputeDeadline: string | null;
  disputeReason: string | null;
  photoUrls: string[];
}

interface ResultResponse {
  success?: boolean;
  message?: string;
  match?: {
    id: string;
    title: string;
    status: string;
    matchDate: string;
    startTime: string;
    raceToScore: number;
    isOrganizer: boolean;
    viewerTeam: 1 | 2;
  };
  result?: MatchResult | null;
}

interface UploadResponse {
  uploadUrl?: string;
  objectKey?: string;
  headers?: Record<string, string>;
}

export default function MySqlMatchResultPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const matchId = params.id;
  const [match, setMatch] = useState<ResultResponse["match"]>(undefined);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [evidence, setEvidence] = useState<File | null>(null);
  const [disputeReason, setDisputeReason] = useState("");

  const loadResult = useCallback(async () => {
    try {
      const response = await fetch(`/api/mysql/matches/${matchId}/result`);
      if (response.status === 401) {
        router.replace(`/mysql/auth/login?redirectTo=${encodeURIComponent(`/mysql/matches/${matchId}/result`)}`);
        return;
      }
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Gagal memuat hasil pertandingan."));
        return;
      }
      const data = (await response.json()) as ResultResponse;
      setMatch(data.match);
      setResult(data.result || null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal memuat hasil pertandingan.");
    } finally {
      setIsLoading(false);
    }
  }, [matchId, router]);

  useEffect(() => {
    void loadResult();
  }, [loadResult]);

  const submitResult = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!match || !evidence) {
      setErrorMessage("Pilih satu foto bukti hasil sebelum mengirim.");
      return;
    }
    const firstScore = Number(team1Score);
    const secondScore = Number(team2Score);
    if (
      !Number.isInteger(firstScore) ||
      !Number.isInteger(secondScore) ||
      Math.max(firstScore, secondScore) !== match.raceToScore ||
      firstScore === secondScore
    ) {
      setErrorMessage(`Masukkan skor bilangan bulat yang berbeda; skor tertinggi harus ${match.raceToScore}.`);
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(evidence.type) || evidence.size > 1024 * 1024) {
      setErrorMessage("Foto bukti harus JPG, PNG, atau WEBP dan maksimal 1 MB.");
      return;
    }

    setIsBusy(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const uploadResponse = await fetch("/api/mysql/assets/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "evidence", matchId, contentType: evidence.type, size: evidence.size }),
      });
      if (!uploadResponse.ok) {
        setErrorMessage(await readErrorMessage(uploadResponse, "Penyimpanan bukti MySQL belum tersedia."));
        return;
      }
      const upload = (await uploadResponse.json()) as UploadResponse;
      if (!upload.uploadUrl || !upload.objectKey) {
        setErrorMessage("Layanan penyimpanan tidak mengembalikan tautan unggah yang valid.");
        return;
      }
      const putResponse = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: upload.headers,
        body: evidence,
      });
      if (!putResponse.ok) {
        setErrorMessage("Foto bukti gagal diunggah. Periksa konfigurasi CORS R2 lalu coba lagi.");
        return;
      }

      const response = await fetch(`/api/mysql/matches/${matchId}/submit-result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team1Score: firstScore,
          team2Score: secondScore,
          winnerTeam: firstScore > secondScore ? 1 : 2,
          photoUrls: [upload.objectKey],
        }),
      });
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Hasil pertandingan gagal dikirim."));
        return;
      }
      setSuccessMessage("Hasil berhasil dikirim dan menunggu konfirmasi peserta lain.");
      setEvidence(null);
      await loadResult();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Hasil pertandingan gagal dikirim.");
    } finally {
      setIsBusy(false);
    }
  };

  const postResultAction = async (action: "confirm" | "dispute") => {
    setIsBusy(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch(`/api/mysql/matches/${matchId}/${action}`, {
        method: "POST",
        ...(action === "dispute"
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason: disputeReason.trim() }),
            }
          : {}),
      });
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Tindakan hasil gagal diproses."));
        return;
      }
      setSuccessMessage(action === "confirm" ? "Hasil dikonfirmasi; rating telah diperbarui." : "Hasil disanggah dan masuk peninjauan.");
      await loadResult();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Tindakan hasil gagal diproses.");
    } finally {
      setIsBusy(false);
    }
  };

  const canConfirm =
    Boolean(match && result?.status === "pending" && result.submittedBy && match.isOrganizer === false);
  const canSubmit = Boolean(match?.isOrganizer && !result);

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Memuat hasil...</div>;
  }
  if (!match) {
    return <div className="flex-1 p-8 text-center text-sm text-slate-600">{errorMessage || "Pertandingan tidak ditemukan atau Anda bukan pesertanya."}</div>;
  }

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto max-w-3xl space-y-5 px-4 sm:px-6">
        <Link href="/mysql/dashboard" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-matchpoin-navy"><ArrowLeft className="h-3.5 w-3.5" />Kembali ke dashboard MySQL</Link>
        <Card>
          <CardHeader>
            <CardTitle>{match.title}</CardTitle>
            <CardDescription>Hasil pertandingan · Race to {match.raceToScore}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
            {successMessage && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{successMessage}</div>}
            {result ? (
              <>
                <div className="rounded-xl bg-slate-50 p-5 text-center">
                  <p className="text-xs font-semibold uppercase text-slate-500">Skor akhir</p>
                  <p className="mt-1 text-3xl font-extrabold text-matchpoin-navy">{result.team1Score} – {result.team2Score}</p>
                  <p className="mt-1 text-xs text-slate-600">Tim {result.winnerTeam} menang · {result.status === "confirmed" ? "Terkonfirmasi" : result.status === "under_review" ? "Dalam peninjauan" : "Menunggu konfirmasi"}</p>
                  {result.disputeReason && <p className="mt-3 text-left text-xs text-amber-800">Alasan sanggahan: {result.disputeReason}</p>}
                </div>
                {result.photoUrls.length > 0 && (
                  <div className="flex flex-wrap gap-3">
                    {result.photoUrls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-matchpoin-navy underline">Lihat foto bukti</a>)}
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Belum ada hasil resmi. Hanya penyelenggara dapat mengirim skor dan foto bukti.</p>
            )}
          </CardContent>
        </Card>

        {canSubmit && (
          <Card>
            <CardHeader><CardTitle className="text-base">Kirim hasil resmi</CardTitle><CardDescription className="text-xs">Unggah satu foto bukti JPG, PNG, atau WEBP (maks. 1 MB). R2 harus dikonfigurasi terlebih dahulu.</CardDescription></CardHeader>
            <form onSubmit={submitResult}>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="mysql-score-team1">Skor Tim 1</Label><Input id="mysql-score-team1" type="number" min={0} max={match.raceToScore} step={1} value={team1Score} onChange={(event) => setTeam1Score(event.target.value)} required disabled={isBusy} /></div>
                <div className="space-y-2"><Label htmlFor="mysql-score-team2">Skor Tim 2</Label><Input id="mysql-score-team2" type="number" min={0} max={match.raceToScore} step={1} value={team2Score} onChange={(event) => setTeam2Score(event.target.value)} required disabled={isBusy} /></div>
                <div className="space-y-2 sm:col-span-2"><Label htmlFor="mysql-result-evidence">Foto bukti</Label><Input id="mysql-result-evidence" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEvidence(event.target.files?.[0] ?? null)} required disabled={isBusy} /><p className="text-xs text-slate-500">{evidence ? `${evidence.name} · ${(evidence.size / 1024).toFixed(0)} KB` : "Pilih file foto skor pertandingan."}</p></div>
              </CardContent>
              <CardFooter><Button type="submit" className="w-full font-bold" disabled={isBusy}>{isBusy ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Mengirim...</span> : <span className="flex items-center gap-2"><Upload className="h-4 w-4" />Kirim Hasil</span>}</Button></CardFooter>
            </form>
          </Card>
        )}

        {canConfirm && (
          <Card>
            <CardHeader><CardTitle className="text-base">Tinjau hasil</CardTitle><CardDescription className="text-xs">Konfirmasi memperbarui rating. Jika skor tidak sesuai, kirim sanggahan sebelum tenggat.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full font-bold" onClick={() => void postResultAction("confirm")} disabled={isBusy}>Konfirmasi Hasil</Button>
              <div className="space-y-2"><Label htmlFor="mysql-dispute-reason">Alasan sanggahan</Label><Textarea id="mysql-dispute-reason" value={disputeReason} onChange={(event) => setDisputeReason(event.target.value)} maxLength={2000} rows={3} disabled={isBusy} placeholder="Jelaskan bagian skor yang perlu diperiksa." /></div>
              <Button variant="outline" className="w-full" onClick={() => void postResultAction("dispute")} disabled={isBusy || !disputeReason.trim()}>Sanggah Hasil</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
