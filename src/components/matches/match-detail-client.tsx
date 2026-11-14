"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhotoUpload } from "@/components/matches/photo-upload";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import type { OpenMatchDetail } from "@/lib/services/match-service";
import type { MatchResultView } from "@/lib/services/rating-service";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";
import { ERROR_GENERIC, ERROR_NETWORK, isOffline, logError } from "@/lib/errors";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Users,
  Trophy,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Send,
  XCircle,
  Check,
  Camera,
} from "lucide-react";

export interface ViewerInfo {
  id: string | null;
  isParticipant: boolean;
  isOrganizer: boolean;
  isPending: boolean;
  isInvited: boolean;
  inviteId: string | null;
  team: 1 | 2 | null;
}

interface MatchDetailClientProps {
  match: OpenMatchDetail;
  result: MatchResultView | null;
  viewer: ViewerInfo;
}

const RESULT_STATUS_LABEL: Record<MatchResultView["status"], string> = {
  pending: "Menunggu Konfirmasi",
  confirmed: "Terkonfirmasi",
  under_review: "Dalam Peninjauan",
};

function remainingTime(deadline: string | null): string {
  if (!deadline) return "-";
  const ms = new Date(deadline).getTime() - Date.now();
  if (Number.isNaN(ms)) return "-";
  if (ms <= 0) return "Waktu sanggahan telah berakhir";
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours} jam ${minutes} menit lagi`;
  return `${minutes} menit lagi`;
}

export function MatchDetailClient({ match, result: initialResult, viewer }: MatchDetailClientProps) {
  const router = useRouter();
  const busyRef = useRef(false);
  const [result, setResult] = useState<MatchResultView | null>(initialResult);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showResultForm, setShowResultForm] = useState(false);
  const [showDisputeForm, setShowDisputeForm] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);

  useEffect(() => {
    setResult(initialResult);
  }, [initialResult]);

  useEffect(() => {
    if (result?.status !== "pending") return;
    let cancelled = false;

    async function sync() {
      try {
        const res = await fetch(`/api/matches/${match.id}/sync`, { method: "POST" });
        const json = (await res.json()) as { synced?: boolean };
        if (!cancelled && json.synced) {
          router.refresh();
        }
      } catch {
        // Sync is best-effort; the server remains the source of truth.
      }
    }

    sync();
    return () => {
      cancelled = true;
    };
  }, [match.id, result?.status, router]);

  const isFull = match.currentPlayers >= match.maxPlayers;
  const requiredPlayers = match.maxPlayers;
  const playersPerTeam = Math.ceil(requiredPlayers / 2);
  const team1Players = match.participants.filter((p) => p.team === 1).length;
  const team2Players = match.participants.filter((p) => p.team === 2).length;

  const submitterName = useMemo(() => {
    if (!result?.submittedBy) return "Pemain";
    return (
      match.participants.find((p) => p.userId === result.submittedBy)?.fullName ||
      match.pendingRequests.find((p) => p.userId === result.submittedBy)?.fullName ||
      "Pemain"
    );
  }, [match.participants, match.pendingRequests, result?.submittedBy]);

  const canSubmitResult =
    viewer.isParticipant &&
    match.status !== "cancelled" &&
    (!result || (result.status === "pending" && result.submittedBy === viewer.id));
  const canConfirm =
    Boolean(result) &&
    result?.status === "pending" &&
    viewer.isParticipant &&
    result?.submittedBy !== viewer.id;

  const callApi = async (
    url: string,
    body?: unknown
  ): Promise<Record<string, unknown> | null> => {
    // Ignore repeat clicks while a request is already in flight (double submit).
    if (busyRef.current) return null;

    setError(null);
    setNotice(null);
    busyRef.current = true;
    setIsBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok || json.success === false) {
        setError(typeof json.message === "string" ? json.message : ERROR_GENERIC);
        return null;
      }
      return json;
    } catch (err) {
      logError("match.action", err, { url });
      setError(isOffline() ? ERROR_NETWORK : ERROR_GENERIC);
      return null;
    } finally {
      busyRef.current = false;
      setIsBusy(false);
    }
  };

  const handleJoin = async () => {
    const json = await callApi(`/api/matches/${match.id}/join`);
    if (json) {
      setNotice("Permohonan terkirim.");
      router.refresh();
    }
  };

  const handleAccept = async (participantUserId: string) => {
    const json = await callApi(`/api/matches/${match.id}/accept`, { participantUserId });
    if (json) {
      setNotice("Peserta diterima.");
      router.refresh();
    }
  };

  const handleReject = async (participantUserId: string) => {
    const json = await callApi(`/api/matches/${match.id}/reject`, { participantUserId });
    if (json) {
      setNotice("Permohonan ditolak.");
      router.refresh();
    }
  };

  const handleInviteResponse = async (action: "accept" | "decline") => {
    if (!viewer.inviteId) return;
    const json = await callApi(`/api/invites/${viewer.inviteId}/respond`, { action });
    if (json) {
      setNotice(action === "accept" ? "Undangan diterima." : "Undangan ditolak.");
      router.refresh();
    }
  };

  const handleCancelInvite = async (participantUserId: string) => {
    const json = await callApi(`/api/matches/${match.id}/reject`, { participantUserId });
    if (json) {
      setNotice("Undangan dibatalkan.");
      router.refresh();
    }
  };

  const handleCancel = async () => {
    if (!window.confirm("Batalkan pertandingan ini?")) return;
    const json = await callApi(`/api/matches/${match.id}/cancel`);
    if (json) {
      setNotice("Pertandingan dibatalkan.");
      router.refresh();
    }
  };

  const handleSubmitResult = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;

    const t1 = Number(team1Score);
    const t2 = Number(team2Score);

    if (!Number.isInteger(t1) || !Number.isInteger(t2) || t1 < 0 || t2 < 0) {
      setError("Skor harus bilangan bulat non-negatif.");
      return;
    }
    if (t1 === t2) {
      setError("Pertandingan tenis tidak boleh seri.");
      return;
    }
    if (photoUrls.length === 0) {
      setError("Foto bukti hasil pertandingan wajib diunggah sebelum mengirim hasil.");
      return;
    }
    if (match.participants.length < requiredPlayers) {
      setError(
        `Peserta belum lengkap: ${match.categoryLabel} membutuhkan ${requiredPlayers} pemain, baru ${match.participants.length} pemain terkonfirmasi.`
      );
      return;
    }
    if (team1Players < playersPerTeam || team2Players < playersPerTeam) {
      setError(
        `Susunan tim belum lengkap: ${playersPerTeam} pemain per tim dibutuhkan (Tim 1: ${team1Players} pemain, Tim 2: ${team2Players} pemain).`
      );
      return;
    }

    const winnerTeam = t1 > t2 ? 1 : 2;
    const json = await callApi(`/api/matches/${match.id}/submit-result`, {
      team1Score: t1,
      team2Score: t2,
      winnerTeam,
      photoUrls,
    });

    if (json) {
      const submitted = json.result as MatchResultView | undefined;
      if (submitted) setResult(submitted);
      setShowResultForm(false);
      setNotice("Hasil terkirim. Lawan punya 48 jam untuk konfirmasi.");
      router.refresh();
    }
  };

  const handleConfirm = async () => {
    const json = await callApi(`/api/matches/${match.id}/confirm`);
    if (json) {
      setNotice(typeof json.message === "string" ? json.message : "Hasil dikonfirmasi.");
      router.refresh();
    }
  };

  const handleDispute = async (event: React.FormEvent) => {
    event.preventDefault();
    const json = await callApi(`/api/matches/${match.id}/dispute`, { reason: disputeReason });
    if (json) {
      const updated = json.result as MatchResultView | undefined;
      if (updated) setResult(updated);
      setShowDisputeForm(false);
      setDisputeReason("");
      setNotice("Sanggahan terkirim. Hasil sedang ditinjau.");
      router.refresh();
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 max-w-5xl space-y-6">
        <LoadingOverlay isBusy={isBusy} message="Memproses aksi pertandingan..." />
        <div className="flex items-center justify-between">
          <Link
            href="/matches"
            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Pertandingan
          </Link>
          {!viewer.id && (
            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">
              Mode Tamu
            </Badge>
          )}
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{notice}</span>
          </div>
        )}

        <Card className="border-slate-200">
          <CardHeader className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-slate-900">{match.title}</h1>
                <p className="text-sm text-slate-500 mt-1">{match.categoryLabel}</p>
              </div>
              <Badge variant={match.status === "open" ? "tennis" : "secondary"} className={match.status === "open" ? "text-matchpoin-navy" : ""}>
                {match.status === "open"
                  ? "Open"
                  : match.status === "full"
                  ? "Penuh"
                  : match.status === "cancelled"
                  ? "Dibatalkan"
                  : match.status}
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span className="capitalize">
                  {formatIndonesianDate(match.matchDate, {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span>
                  {formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)} WIB · {match.durationMinutes} menit
                </span>
              </div>
              <div className="flex items-start gap-2 sm:col-span-2">
                <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="text-slate-800">{match.courtName}</strong>
                  {match.courtAddress ? ` — ${match.courtAddress}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-400" />
                <span>
                  <strong className="text-slate-800">{match.currentPlayers}</strong>/{match.maxPlayers} pemain
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-slate-400" />
                <span>Penyelenggara: <strong className="text-slate-800">{match.organizerName}</strong></span>
              </div>
            </div>

            {match.description && (
              <p className="text-sm text-slate-600 bg-slate-50 border border-slate-100 rounded-xl p-3">
                {match.description}
              </p>
            )}

            <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
              <Badge variant="secondary">{match.umpireOption === "dengan_wasit" ? "Dengan Wasit" : "Tanpa Wasit"}</Badge>
              {match.umpireName && <Badge variant="secondary">Wasit: {match.umpireName}</Badge>}
              <Badge variant="secondary">Rating {match.minRating.toFixed(2)} – {match.maxRating.toFixed(2)}</Badge>
              <Badge variant="secondary">Race to {match.raceToScore}</Badge>
              <Badge variant="secondary">Tukar lapangan di {match.courtSwitchAt}</Badge>
              {match.courtSwapped && <Badge variant="secondary">Lapangan sudah ditukar</Badge>}
              {match.status !== "cancelled" && (
                <Badge variant={isFull ? "secondary" : "outline"} className={isFull ? "" : "border-emerald-200 text-emerald-700"}>
                  {isFull ? "Slot penuh" : `${match.availableSlots} slot tersedia`}
                </Badge>
              )}
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Peserta</CardTitle>
                <CardDescription className="text-xs">
                  {match.participants.length} pemain terkonfirmasi
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {match.participants.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada peserta.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {match.participants.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/60">
                        <div className="w-9 h-9 rounded-full bg-matchpoin-navy text-white flex items-center justify-center text-xs font-bold">
                          {p.fullName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-800 truncate">{p.fullName}</p>
                          <p className="text-[10px] text-slate-400">
                            {p.isOrganizer ? "Penyelenggara" : `Tim ${p.team ?? 1}`} · Rating {p.rating.toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {viewer.isOrganizer && match.pendingRequests.length > 0 && match.status === "open" && (
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Permohonan Bergabung</CardTitle>
                  <CardDescription className="text-xs">Terima atau tolak pemain yang mengajukan slot.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {match.pendingRequests.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{p.fullName}</p>
                        <p className="text-[10px] text-slate-400">Rating {p.rating.toFixed(2)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="tennis"
                        className="text-matchpoin-navy text-[11px]"
                        disabled={isBusy}
                        onClick={() => handleAccept(p.userId)}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <Check className="w-3.5 h-3.5 mr-1" />
                        )}
                        Terima
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px]"
                        disabled={isBusy}
                        onClick={() => handleReject(p.userId)}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                        )}
                        Tolak
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {viewer.isOrganizer && match.invitedPlayers.length > 0 && match.status === "open" && (
              <Card className="border-slate-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Undangan Terkirim</CardTitle>
                  <CardDescription className="text-xs">Menunggu jawaban pemain yang diundang.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {match.invitedPlayers.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-slate-100">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{p.fullName}</p>
                        <p className="text-[10px] text-slate-400">Rating {p.rating.toFixed(2)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px] text-red-600"
                        disabled={isBusy}
                        onClick={() => handleCancelInvite(p.userId)}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                        )}
                        Batalkan
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card className="border-slate-200">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Hasil Pertandingan</CardTitle>
                  {result && (
                    <Badge
                      variant={
                        result.status === "confirmed"
                          ? "success"
                          : result.status === "under_review"
                          ? "outline"
                          : "secondary"
                      }
                      className={
                        result.status === "under_review"
                          ? "border-amber-200 text-amber-700"
                          : result.status === "pending"
                          ? "bg-amber-50 text-amber-700"
                          : ""
                      }
                    >
                      {RESULT_STATUS_LABEL[result.status]}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!result ? (
                  <div className="text-center py-6 space-y-3">
                    <p className="text-xs text-slate-500">Belum ada hasil yang dikirim.</p>
                    {canSubmitResult && (
                      <Button variant="tennis" className="text-matchpoin-navy font-bold" onClick={() => setShowResultForm((v) => !v)}>
                        <Send className="w-4 h-4 mr-2" />
                        Kirim Hasil
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 items-center gap-3 text-center">
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Tim 1</p>
                        <p className="text-3xl font-extrabold font-heading text-matchpoin-navy">{result.team1Score}</p>
                      </div>
                      <div className="text-xs font-bold text-slate-400">VS</div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] uppercase font-bold text-slate-400">Tim 2</p>
                        <p className="text-3xl font-extrabold font-heading text-matchpoin-navy">{result.team2Score}</p>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1">
                      <p>
                        Pemenang: <strong className="text-slate-900">Tim {result.winnerTeam}</strong>
                      </p>
                      <p>
                        Dikirim oleh <strong className="text-slate-800">{submitterName}</strong>
                      </p>
                      {result.status === "pending" && (
                        <p className="text-amber-700">
                          Batas sanggahan: {remainingTime(result.disputeDeadline)} (divalidasi waktu server).
                        </p>
                      )}
                      {result.status === "under_review" && result.disputeReason && (
                        <p className="text-amber-700">Alasan sanggahan: {result.disputeReason}</p>
                      )}
                      {result.status === "confirmed" && (
                        <p className="text-emerald-700">Hasil terkonfirmasi. MATCHPOIN Rating telah diperbarui.</p>
                      )}
                    </div>

                    {result.photoUrls.length > 0 && (
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400 mb-2 flex items-center gap-1">
                          <Camera className="w-3.5 h-3.5" />
                          Foto Pertandingan
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {result.photoUrls.map((url) => (
                            <a key={url} href={url} target="_blank" rel="noreferrer" className="block">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="Foto pertandingan" className="w-20 h-20 rounded-lg object-cover border border-slate-200" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {canConfirm && !showDisputeForm && (
                      <div className="flex flex-wrap gap-2 pt-2">
                        <Button variant="tennis" className="text-matchpoin-navy font-bold" disabled={isBusy} onClick={handleConfirm}>
                          {isBusy ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin mr-2" />
                              Memproses...
                            </>
                          ) : (
                            <>
                              <Check className="w-4 h-4 mr-2" />
                              Konfirmasi Skor
                            </>
                          )}
                        </Button>
                        <Button variant="outline" disabled={isBusy} onClick={() => setShowDisputeForm(true)}>
                          <ShieldAlert className="w-4 h-4 mr-2" />
                          Sanggah
                        </Button>
                      </div>
                    )}

                    {showDisputeForm && (
                      <form onSubmit={handleDispute} className="space-y-2 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <Label htmlFor="disputeReason">Alasan Sanggahan</Label>
                        <Textarea
                          id="disputeReason"
                          rows={2}
                          value={disputeReason}
                          onChange={(e) => setDisputeReason(e.target.value)}
                          placeholder="Jelaskan koreksi skor yang Anda ketahui..."
                          required
                        />
                        <div className="flex gap-2 justify-end">
                          <Button type="button" variant="outline" size="sm" onClick={() => setShowDisputeForm(false)}>
                            Batal
                          </Button>
                          <Button type="submit" size="sm" variant="tennis" className="text-matchpoin-navy font-bold" disabled={isBusy}>
                            {isBusy ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                                Mengirim...
                              </>
                            ) : (
                              "Kirim Sanggahan"
                            )}
                          </Button>
                        </div>
                      </form>
                    )}

                    {canSubmitResult && result.status === "pending" && result.submittedBy === viewer.id && !showResultForm && (
                      <Button variant="outline" size="sm" onClick={() => setShowResultForm(true)}>
                        Ubah skor sebelum dikonfirmasi
                      </Button>
                    )}
                  </div>
                )}

                {showResultForm && canSubmitResult && (
                  <form
                    onSubmit={handleSubmitResult}
                    aria-busy={isBusy}
                    className="space-y-4 p-4 rounded-xl border border-slate-200 bg-slate-50/60"
                  >
                    <div className="rounded-lg bg-white border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1">
                      <p className="font-bold text-slate-700">Persyaratan pengiriman hasil</p>
                      <p className={match.participants.length >= requiredPlayers ? "text-emerald-700" : "text-red-600"}>
                        Peserta terkonfirmasi: {match.participants.length}/{requiredPlayers} pemain
                      </p>
                      <p className={team1Players >= playersPerTeam && team2Players >= playersPerTeam ? "text-emerald-700" : "text-red-600"}>
                        Susunan tim: Tim 1 {team1Players}/{playersPerTeam} pemain, Tim 2 {team2Players}/{playersPerTeam} pemain
                      </p>
                      <p className={photoUrls.length > 0 ? "text-emerald-700" : "text-red-600"}>
                        Foto bukti hasil: {photoUrls.length > 0 ? `${photoUrls.length} foto diunggah` : "wajib diunggah"}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="team1Score">Skor Tim 1</Label>
                        <Input
                          id="team1Score"
                          type="number"
                          min={0}
                          value={team1Score}
                          onChange={(e) => setTeam1Score(e.target.value)}
                          required
                          disabled={isBusy}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="team2Score">Skor Tim 2</Label>
                        <Input
                          id="team2Score"
                          type="number"
                          min={0}
                          value={team2Score}
                          onChange={(e) => setTeam2Score(e.target.value)}
                          required
                          disabled={isBusy}
                        />
                      </div>
                    </div>

                    {viewer.id && (
                      <PhotoUpload
                        matchId={match.id}
                        userId={viewer.id}
                        value={photoUrls}
                        onChange={setPhotoUrls}
                        disabled={isBusy}
                      />
                    )}

                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setShowResultForm(false)}
                        disabled={isBusy}
                      >
                        Batal
                      </Button>
                      <Button
                        type="submit"
                        variant="tennis"
                        size="sm"
                        className="text-matchpoin-navy font-bold"
                        disabled={isBusy || photoUrls.length === 0}
                      >
                        {isBusy ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                            Mengirim...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Kirim Hasil
                          </>
                        )}
                      </Button>
                    </div>
                    {photoUrls.length === 0 && (
                      <p className="text-[11px] text-red-600 text-right">
                        Unggah foto bukti hasil terlebih dahulu untuk mengaktifkan tombol kirim.
                      </p>
                    )}
                  </form>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Aksi</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                {!viewer.id && (
                  <>
                    <p className="text-slate-500">Masuk untuk mengajukan slot atau mengirim hasil.</p>
                    <Link href={`/login?redirectTo=/matches/${match.id}`}>
                      <Button variant="tennis" className="w-full text-matchpoin-navy font-bold">
                        Masuk Akun
                      </Button>
                    </Link>
                  </>
                )}

                {viewer.id && !viewer.isParticipant && !viewer.isPending && !viewer.isInvited && match.status === "open" && !isFull && (
                  <Button variant="tennis" className="w-full text-matchpoin-navy font-bold" disabled={isBusy} onClick={handleJoin}>
                  {isBusy ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                      Memproses...
                    </>
                  ) : (
                    <>
                      <Users className="w-4 h-4 mr-2" />
                      Ajukan Slot
                    </>
                  )}
                </Button>
                )}

                {viewer.id && viewer.isPending && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                    Permohonan Anda sedang menunggu persetujuan penyelenggara.
                  </div>
                )}

                {viewer.id && viewer.isInvited && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-2">
                    <p className="text-amber-800 font-semibold">Anda diundang ke pertandingan ini.</p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="tennis"
                        className="flex-1 text-matchpoin-navy text-[11px]"
                        disabled={isBusy}
                        onClick={() => handleInviteResponse("accept")}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <Check className="w-3.5 h-3.5 mr-1" />
                        )}
                        Terima
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 text-[11px]"
                        disabled={isBusy}
                        onClick={() => handleInviteResponse("decline")}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                        )}
                        Tolak
                      </Button>
                    </div>
                  </div>
                )}

                {viewer.id && viewer.isParticipant && !result && (
                  <Button variant="tennis" className="w-full text-matchpoin-navy font-bold" onClick={() => setShowResultForm(true)}>
                    <Send className="w-4 h-4 mr-2" />
                    Kirim Hasil
                  </Button>
                )}

                {viewer.id && viewer.isOrganizer && match.status !== "cancelled" && (
                  <Button variant="outline" className="w-full text-red-600" disabled={isBusy} onClick={handleCancel}>
                    {isBusy ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        Membatalkan...
                      </>
                    ) : (
                      "Batalkan Pertandingan"
                    )}
                  </Button>
                )}

                {viewer.id && !viewer.isOrganizer && !viewer.isParticipant && match.status !== "open" && (
                  <p className="text-slate-500">Pendaftaran sudah ditutup.</p>
                )}
              </CardContent>
            </Card>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 text-xs text-slate-500">
              <p className="font-bold text-slate-700 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Alur Verifikasi
              </p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Pemenang mengirim skor.</li>
                <li>Lawan punya 48 jam untuk konfirmasi atau sanggah.</li>
                <li>Jika tidak ada sanggahan, skor otomatis dikonfirmasi.</li>
                <li>Rating diperbarui setelah konfirmasi.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}