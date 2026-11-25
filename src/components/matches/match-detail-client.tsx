"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
import { normalizeImageUrl } from "@/lib/utils/image";
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
  Swords,
} from "lucide-react";

export interface ViewerInfo {
  id: string | null;
  isParticipant: boolean;
  isOrganizer: boolean;
  isPending: boolean;
  isInvited: boolean;
  inviteId: string | null;
  team: 1 | 2 | null;
  isAdmin?: boolean;
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
  const isSinglesMatch = requiredPlayers === 2;
  const hostId = match.organizerId;
  const hostStoredTeam: 1 | 2 = 1;
  const side2Team: 1 | 2 = 2;
  // Pending requests do not reserve a slot: only confirmed players decide
  // whether a team still has room for another application.
  const team1Confirmed = match.participants.filter((player) => (player.team ?? 1) === 1).length;
  const team2Confirmed = match.participants.filter((player) => player.team === 2).length;
  const hostTeamAvailable = team1Confirmed < playersPerTeam;
  const opponentTeamAvailable = team2Confirmed < playersPerTeam;

  const sortTeamMembers = (members: typeof match.participants) =>
    [...members].sort((a, b) => {
      const aHost = a.userId === hostId || a.isOrganizer ? 0 : 1;
      const bHost = b.userId === hostId || b.isOrganizer ? 0 : 1;
      return aHost - bHost || a.fullName.localeCompare(b.fullName);
    });
  const team1Members = sortTeamMembers(match.participants.filter(
    (participant) =>
      participant.userId === hostId ||
      participant.isOrganizer ||
      participant.team === hostStoredTeam
  ));
  const team2Members = sortTeamMembers(match.participants.filter(
    (participant) => !team1Members.some((member) => member.userId === participant.userId)
  ));
  const finalTeam1 = team1Members;
  const finalTeam2 = isSinglesMatch ? team2Members.slice(0, 1) : team2Members;
  const team1Players = finalTeam1.length;
  const team2Players = finalTeam2.length;
  const hostFallback = "Host";
  const oppFallback = match.status === "open" ? "Terbuka" : "Lawan";
  const team1Label = finalTeam1.map((participant) => participant.fullName).join(" & ") || hostFallback;
  const team2Label = finalTeam2.map((participant) => participant.fullName).join(" & ") || oppFallback;
  const hostSideScore = result ? (hostStoredTeam === 1 ? result.team1Score : result.team2Score) : 0;
  const oppSideScore = result ? (hostStoredTeam === 1 ? result.team2Score : result.team1Score) : 0;
  const hostSideWon = result ? result.winnerTeam === hostStoredTeam : false;
  const winnerLabel = result ? (hostSideWon ? team1Label : team2Label) : "";
  const raceTo = match.raceToScore || 8;
  const switchAt = match.courtSwitchAt || 4;
  const liveHostScore = showResultForm && team1Score !== "" ? Math.max(0, Number(team1Score) || 0) : hostSideScore;
  const liveOppScore = showResultForm && team2Score !== "" ? Math.max(0, Number(team2Score) || 0) : oppSideScore;
  const courtChangeReached = Math.max(liveHostScore, liveOppScore) >= switchAt && Math.min(liveHostScore, liveOppScore) < switchAt;
  const matchHasStartedOrScoring = Boolean(result) || showResultForm || match.status === "in_progress" || match.status === "full";

  const submitterName = useMemo(() => {
    if (!result?.submittedBy) return "Pemain";
    return (
      match.participants.find((p) => p.userId === result.submittedBy)?.fullName ||
      match.pendingRequests.find((p) => p.userId === result.submittedBy)?.fullName ||
      "Pemain"
    );
  }, [match.participants, match.pendingRequests, result?.submittedBy]);

  // Kedua belah pihak boleh mengirim skor: host maupun lawan yang sudah
  // terkonfirmasi. Pengirim pertama menjadi hasil "pending", pihak lain lalu
  // mengonfirmasi atau menyanggahnya.
  const canSubmitResult =
    (viewer.isOrganizer || viewer.isParticipant) &&
    match.status !== "cancelled" &&
    (!result || result.status === "pending");
  const canConfirm =
    Boolean(result) &&
    result?.status === "pending" &&
    (viewer.isParticipant || viewer.isOrganizer) &&
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

  const handleJoin = async (team?: 1 | 2) => {
    const json = await callApi(
      `/api/matches/${match.id}/join`,
      team ? { team } : undefined
    );
    if (json) {
      setNotice(team === 1 ? "Permohonan bergabung ke tim host terkirim." : "Permohonan lawan terkirim.");
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
    if (t1 > raceTo || t2 > raceTo) {
      setError(`Skor tidak valid. Format pertandingan Race to ${raceTo} (maksimal ${raceTo} poin).`);
      return;
    }
    if (Math.max(t1, t2) !== raceTo) {
      setError(`Pertandingan berakhir saat salah satu pihak mencapai ${raceTo} poin.`);
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
        isSinglesMatch
          ? `Susunan pertandingan belum lengkap: Host dan Lawan masing-masing harus 1 pemain (Host: ${team1Players}/1, Lawan: ${team2Players}/1).`
          : `Susunan tim belum lengkap: dibutuhkan ${playersPerTeam} pemain per tim (Host: ${team1Players}/${playersPerTeam}, Lawan: ${team2Players}/${playersPerTeam}).`
      );
      return;
    }

    const hostSideScore = t1;
    const oppSideScore = t2;
    const winnerSide: 1 | 2 = hostSideScore > oppSideScore ? hostStoredTeam : side2Team;
    const payloadTeam1Score = hostStoredTeam === 1 ? hostSideScore : oppSideScore;
    const payloadTeam2Score = hostStoredTeam === 1 ? oppSideScore : hostSideScore;
    const json = await callApi(`/api/matches/${match.id}/submit-result`, {
      team1Score: payloadTeam1Score,
      team2Score: payloadTeam2Score,
      winnerTeam: winnerSide,
      photoUrls,
    });

    if (json) {
      const submitted = json.result as MatchResultView | undefined;
      if (submitted) setResult(submitted);
      setShowResultForm(false);
      setNotice("Hasil terkirim. Lawan punya 24 jam untuk konfirmasi atau sanggahan.");
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
                {viewer.isAdmin && (
                  <a
                    href={`/admin/matches/${match.id}/result`}
                    className="mt-2 inline-flex text-xs font-semibold text-matchpoin-navy underline"
                  >
                    Input Hasil (Admin)
                  </a>
                )}
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
                  {(() => {
                    const start = `1970-01-01T${match.startTime}+08:00`;
                    const end = new Date(new Date(start).getTime() + match.durationMinutes * 60 * 1000);
                    return ` · Selesai ~${end.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false })} WIB`;
                  })()}
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
                <span>Penyelenggara (Host): <strong className="text-slate-800">{match.organizerName}</strong></span>
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
              <Badge variant="secondary">Rating MPR {Math.round(match.minRating)}+</Badge>
              <Badge variant="secondary">Race to {raceTo}</Badge>
              <Badge variant="secondary">Court change di {switchAt} poin</Badge>
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
              <CardHeader className="gap-1 p-5 pb-3 sm:p-6 sm:pb-3">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-lg">Susunan pemain</CardTitle>
                    <CardDescription className="mt-1 text-xs">
                      {match.participants.length} dari {requiredPlayers} pemain terkonfirmasi
                    </CardDescription>
                  </div>
                  {!isSinglesMatch && (
                    <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
                      {team1Players} vs {team2Players}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="grid gap-3 p-5 pt-0 sm:p-6 sm:pt-0">
                {[1, 2].map((teamNumber) => {
                  const team = teamNumber as 1 | 2;
                  const members = team === 1 ? finalTeam1 : finalTeam2;
                  const isEmpty = members.length === 0;
                  return (
                    <div key={team} className={`rounded-2xl border p-3 sm:p-4 ${team === 1 ? "border-matchpoin-navy/15 bg-matchpoin-navy/[0.03]" : "border-matchpoin-tennis/30 bg-matchpoin-tennis/10"}`}>
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold ${team === 1 ? "bg-matchpoin-navy text-white" : "bg-matchpoin-tennis text-matchpoin-navy"}`}>
                            {team === 1 ? "A" : "B"}
                          </span>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{team === 1 ? "Team A · Host Side" : "Team B · Opponent Side"}</p>
                            <p className="text-[11px] text-slate-500">{members.length}/{playersPerTeam} pemain</p>
                          </div>
                        </div>
                        {members.length === playersPerTeam && <span className="text-[11px] font-semibold text-emerald-700">Lengkap</span>}
                      </div>
                      {isEmpty ? (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-white/60 px-3 py-4 text-center text-xs text-slate-400">
                          Belum ada pemain di tim ini.
                        </div>
                      ) : (
                        <div className={`grid gap-2 ${isSinglesMatch ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
                          {members.map((participant) => (
                            <div key={participant.id} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-100 bg-white p-3">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                                {participant.fullName.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-semibold text-slate-800">{participant.fullName}</p>
                                <p className="mt-0.5 text-[10px] text-slate-400">
                                  {participant.userId === hostId || participant.isOrganizer ? "Host / Organizer" : team === 1 ? "Host's Partner" : isSinglesMatch ? "Lawan" : "Opponent Side"} · Rating {Math.round(participant.rating)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
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
                        <p className="text-[10px] text-slate-400">
                          Rating {Math.round(p.rating)} · {p.team === 2 ? "Tim Lawan" : "Tim Host"}
                        </p>
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
                        <p className="text-[10px] text-slate-400">Rating {Math.round(p.rating)}</p>
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
                <CardTitle className="text-base">Aturan Pertandingan</CardTitle>
                <CardDescription className="text-xs">Aturan berlaku untuk pertandingan ini. Skor mengikuti sistem Race to {raceTo}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ul className="list-disc list-inside space-y-1.5 text-xs text-slate-700">
                  <li><span className="font-semibold">Game Scoring:</span> 15 – 30 – 40 – Game.</li>
                  <li><span className="font-semibold">No Deuce:</span> Tidak ada advantage/deuce. Jika skor 40–40, poin berikutnya menentukan pemenang game.</li>
                  <li><span className="font-semibold">Match Format:</span> Race to {raceTo} points. Pertandingan berakhir saat salah satu pihak mencapai {raceTo} poin.</li>
                  <li><span className="font-semibold">Court Change:</span> Pemain harus bertukar sisi lapangan saat salah satu pihak mencapai {switchAt} poin (catatan aturan, bukan notifikasi live).</li>
                </ul>
              </CardContent>
            </Card>

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
                <CardDescription className="text-xs">
                  Host: {team1Label} vs Lawan: {team2Label}
                </CardDescription>
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
                        <p className="text-[10px] uppercase font-bold text-slate-400 truncate px-1" title={team1Label}>Host</p>
                        <p className="text-xs font-semibold text-slate-800 truncate px-1">{team1Label}</p>
                        <p className="text-3xl font-extrabold font-heading text-matchpoin-navy">{hostSideScore}</p>
                      </div>
                      <div className="text-xs font-bold text-slate-400">VS</div>
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                        <p className="text-[10px] uppercase font-bold text-slate-400 truncate px-1" title={team2Label}>Lawan</p>
                        <p className="text-xs font-semibold text-slate-800 truncate px-1">{team2Label}</p>
                        <p className="text-3xl font-extrabold font-heading text-matchpoin-navy">{oppSideScore}</p>
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1">
                      <p>
                        Hasil: <strong className="text-slate-900">{team1Label} vs {team2Label}</strong>
                      </p>
                      <p>
                        Pemenang: <strong className="text-slate-900">{winnerLabel}</strong>
                      </p>
                      <p>
                        Dikirim oleh <strong className="text-slate-800">{submitterName}</strong>
                      </p>
                      {result.status === "pending" && (
                        <p className="text-amber-700">
                          Batas konfirmasi/sanggahan: {remainingTime(result.disputeDeadline)} (24 jam, divalidasi waktu server).
                        </p>
                      )}
                      {result.status === "under_review" && result.disputeReason && (
                        <p className="text-amber-700">Alasan sanggahan: {result.disputeReason}</p>
                      )}
                      {result.status === "confirmed" && (
                        <p className="text-emerald-700">Hasil terkonfirmasi. MPR telah diperbarui.</p>
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
                            // normalizeImageUrl: URL lama tersimpan dengan garis
                            // miring ganda dan ditolak optimizer Next.js.
                            <a key={url} href={normalizeImageUrl(url)} target="_blank" rel="noreferrer" className="block relative w-20 h-20 rounded-lg overflow-hidden">
                              <Image
                                src={normalizeImageUrl(url)}
                                alt="Foto pertandingan"
                                fill
                                className="object-cover border border-slate-200"
                                sizes="80px"
                              />
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

                    {canSubmitResult && result.status === "pending" && !showResultForm && (
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
                    <div className="rounded-lg bg-white border border-slate-200 p-3 text-[11px] text-slate-600 space-y-1.5">
                      <p className="font-bold text-slate-700">Persyaratan Pengiriman Hasil</p>
                      <p className={match.participants.length >= requiredPlayers ? "text-emerald-700" : "text-red-600"}>
                        Peserta terkonfirmasi: {match.participants.length}/{requiredPlayers} pemain
                      </p>
                      <div className={team1Players >= playersPerTeam && team2Players >= playersPerTeam ? "text-emerald-700" : "text-red-600"}>
                        <p className="font-semibold text-slate-700">Peserta Pertandingan:</p>
                        {isSinglesMatch ? (
                          <div className="space-y-0.5">
                            <p>Host: {team1Label || "Belum terisi"}</p>
                            <p>Lawan: {team2Players > 0 ? team2Label : "Belum terisi"}</p>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <p>Host: {team1Label || "Belum terisi"} ({team1Players}/{playersPerTeam})</p>
                            <p>Lawan: {team2Players > 0 ? team2Label : "Belum terisi"} ({team2Players}/{playersPerTeam})</p>
                          </div>
                        )}
                      </div>
                      <p className={photoUrls.length > 0 ? "text-emerald-700" : "text-red-600"}>
                        Foto bukti hasil: {photoUrls.length > 0 ? `${photoUrls.length} foto diunggah` : "Wajib diunggah"}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2 p-3 rounded-lg border border-slate-200 bg-white">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Host</p>
                        <p className="text-xs font-semibold text-slate-800">{team1Label}</p>
                        {!isSinglesMatch && finalTeam1.length > 0 && (
                          <ul className="text-[11px] text-slate-600 list-disc list-inside">
                            {finalTeam1.map((m) => <li key={m.userId}>{m.fullName}{m.userId === hostId || m.isOrganizer ? " (Host)" : ""}</li>)}
                          </ul>
                        )}
                        <Label htmlFor="team1Score">Skor Host</Label>
                        <Input
                          id="team1Score"
                          type="number"
                          min={0}
                          max={raceTo}
                          value={team1Score}
                          onChange={(e) => setTeam1Score(e.target.value)}
                          required
                          disabled={isBusy}
                        />
                      </div>
                      <div className="space-y-2 p-3 rounded-lg border border-slate-200 bg-white">
                        <p className="text-[10px] uppercase font-bold text-slate-500">Lawan</p>
                        <p className="text-xs font-semibold text-slate-800">{team2Label}</p>
                        {!isSinglesMatch && finalTeam2.length > 0 && (
                          <ul className="text-[11px] text-slate-600 list-disc list-inside">
                            {finalTeam2.map((m) => <li key={m.userId}>{m.fullName}</li>)}
                          </ul>
                        )}
                        <Label htmlFor="team2Score">Skor Lawan</Label>
                        <Input
                          id="team2Score"
                          type="number"
                          min={0}
                          max={raceTo}
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
                        Masuk
                      </Button>
                    </Link>
                  </>
                )}

                {viewer.id && !viewer.isParticipant && !viewer.isPending && !viewer.isInvited && match.status === "open" && !isFull && (
                  isSinglesMatch ? (
                    <Button variant="tennis" className="w-full text-matchpoin-navy font-bold" disabled={isBusy} onClick={() => handleJoin()}>
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
                  ) : (
                    <div className="space-y-2">
                      <Button
                        variant="tennis"
                        className="w-full text-matchpoin-navy font-bold"
                        disabled={isBusy || !hostTeamAvailable}
                        onClick={() => handleJoin(1)}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        ) : (
                          <Users className="w-4 h-4 mr-2" />
                        )}
                        Gabung Tim Host
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full font-bold"
                        disabled={isBusy || !opponentTeamAvailable}
                        onClick={() => handleJoin(2)}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" />
                        ) : (
                          <Swords className="w-4 h-4 mr-2" />
                        )}
                        Ajukan sebagai Lawan
                      </Button>
                      <p className="text-[10px] leading-relaxed text-slate-500">
                        {hostTeamAvailable
                          ? "Pilih menjadi partner host atau pemain lawan. Host tetap harus menyetujui."
                          : "Tim host sudah penuh. Anda dapat mengajukan diri sebagai lawan."}
                      </p>
                    </div>
                  )
                )}

                {viewer.id && viewer.isPending && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
                    Permohonan Anda sedang menunggu persetujuan Host.
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
                <li>Semua peserta terkonfirmasi (singles 2, doubles 4).</li>
                <li>Host atau lawan terkonfirmasi input skor resmi (Race to {raceTo}).</li>
                <li>Upload foto bukti wajib.</li>
                <li>Pastikan skor sesuai, lalu submit untuk verifikasi.</li>
                <li>Lawan punya 24 jam untuk konfirmasi/sanggah.</li>
                <li>Hasil tercatat & rating diperbarui setelah terverifikasi/otomatis.</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}