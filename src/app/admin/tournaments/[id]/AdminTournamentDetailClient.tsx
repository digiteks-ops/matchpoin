"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  Plus,
  Trophy,
  Users,
  XCircle,
} from "lucide-react";
import { formatIndonesianDate } from "@/lib/utils";
import type {
  ManagedCategory,
  ManagedLeague,
  ManagedRegistration,
} from "@/lib/supabase/tournament-admin-service";

interface AdminTournamentDetailClientProps {
  initialLeague: ManagedLeague;
}

function statusBadge(status: string) {
  if (status === "pending") {
    return <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-800">Pending</Badge>;
  }
  if (status === "accepted" || status === "confirmed") {
    return <Badge variant="success">Diterima</Badge>;
  }
  if (status === "rejected") {
    return <Badge variant="destructive">Ditolak</Badge>;
  }
  return <Badge variant="secondary">{status}</Badge>;
}

function entryUserIds(entry: ManagedRegistration): string[] {
  return [entry.userId, entry.partnerUserId].filter((value): value is string => Boolean(value));
}

function entryLabel(entry: ManagedRegistration): string {
  return entry.partnerName ? `${entry.playerName} & ${entry.partnerName}` : entry.playerName;
}

function matchStatusLabel(status: string): string {
  if (status === "open") return "Terbuka";
  if (status === "full") return "Penuh";
  if (status === "in_progress") return "Berlangsung";
  if (status === "completed") return "Selesai";
  if (status === "cancelled") return "Dibatalkan";
  if (status === "disputed") return "Sengketa";
  return status;
}

export default function AdminTournamentDetailClient({
  initialLeague,
}: AdminTournamentDetailClientProps) {
  const [league, setLeague] = useState<ManagedLeague>(initialLeague);
  const [activeCategoryId, setActiveCategoryId] = useState(
    initialLeague.categories[0]?.id ?? ""
  );
  const [actionId, setActionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ManagedRegistration | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({
    leagueName: initialLeague.leagueName,
    startDate: initialLeague.startDate,
    endDate: initialLeague.endDate,
    registrationDeadline: initialLeague.registrationDeadline ?? "",
    mainEventStart: initialLeague.mainEventStart ?? "",
    mainEventEnd: initialLeague.mainEventEnd ?? "",
  });
  const [team1EntryId, setTeam1EntryId] = useState("");
  const [team2EntryId, setTeam2EntryId] = useState("");
  const [matchDate, setMatchDate] = useState("");
  const [matchTime, setMatchTime] = useState("16:00");
  const [courtName, setCourtName] = useState("");
  const [isCreatingMatch, setIsCreatingMatch] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [matchNotice, setMatchNotice] = useState<string | null>(null);
  const [cancellingMatchId, setCancellingMatchId] = useState<string | null>(null);

  const activeCategory: ManagedCategory | undefined = useMemo(
    () => league.categories.find((category) => category.id === activeCategoryId) ?? league.categories[0],
    [activeCategoryId, league.categories]
  );

  useEffect(() => {
    if (!activeCategory && league.categories[0]) {
      setActiveCategoryId(league.categories[0].id);
    }
  }, [activeCategory, league.categories]);

  useEffect(() => {
    setTeam1EntryId("");
    setTeam2EntryId("");
    setMatchError(null);
    setMatchNotice(null);
  }, [activeCategoryId]);

  const reload = async () => {
    const id = league.categories[0]?.id;
    if (!id) return;
    const response = await fetch(`/api/admin/tournaments/${id}`, { cache: "no-store" });
    const payload = (await response.json()) as { success?: boolean; league?: ManagedLeague; message?: string };
    if (response.ok && payload.success && payload.league) {
      setLeague(payload.league);
    }
  };

  const acceptedEntries = useMemo(
    () =>
      (activeCategory?.registrations ?? []).filter(
        (entry) => entry.status === "accepted" || entry.status === "confirmed"
      ),
    [activeCategory]
  );

  const activeMatches = useMemo(
    () => league.matches.filter((match) => match.category === activeCategory?.category),
    [activeCategory, league.matches]
  );

  const decide = async (entry: ManagedRegistration, action: "approve" | "reject", reason?: string) => {
    setError(null);
    setNotice(null);
    setActionId(entry.id);
    try {
      const response = await fetch(`/api/admin/tournaments/registrations/${entry.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "reject" ? { reason } : { reason: null }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Aksi gagal.");
      }
      setNotice(payload.message || "Pendaftaran diproses.");
      setRejectTarget(null);
      setRejectReason("");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aksi gagal.");
    } finally {
      setActionId(null);
    }
  };

  const saveInfo = async () => {
    const id = activeCategory?.id ?? league.categories[0]?.id;
    if (!id) return;
    setEditError(null);
    setIsSavingInfo(true);
    try {
      const response = await fetch(`/api/admin/tournaments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leagueName: infoForm.leagueName,
          startDate: infoForm.startDate,
          endDate: infoForm.endDate,
          registrationDeadline: infoForm.registrationDeadline || null,
          mainEventStart: infoForm.mainEventStart || null,
          mainEventEnd: infoForm.mainEventEnd || null,
        }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Gagal menyimpan info turnamen.");
      }
      setNotice(payload.message || "Info turnamen diperbarui.");
      setIsEditing(false);
      await reload();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Gagal menyimpan info turnamen.");
    } finally {
      setIsSavingInfo(false);
    }
  };

  const createMatch = async () => {
    if (!activeCategory) return;
    setMatchError(null);
    setMatchNotice(null);

    const team1 = acceptedEntries.find((entry) => entry.entryId === team1EntryId);
    const team2 = acceptedEntries.find((entry) => entry.entryId === team2EntryId);
    if (!team1 || !team2) {
      setMatchError("Pilih tim A dan tim B dari pendaftar yang sudah diterima.");
      return;
    }
    if (team1.entryId === team2.entryId) {
      setMatchError("Tim A dan tim B tidak boleh sama.");
      return;
    }
    if (!matchDate || !matchTime || !courtName.trim()) {
      setMatchError("Tanggal, jam, dan lapangan wajib diisi.");
      return;
    }

    setIsCreatingMatch(true);
    try {
      const response = await fetch(`/api/admin/tournaments/${activeCategory.id}/matches`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: activeCategory.category,
          team1UserIds: entryUserIds(team1),
          team2UserIds: entryUserIds(team2),
          matchDate,
          startTime: matchTime,
          courtName: courtName.trim(),
          title: `${league.leagueName} — ${activeCategory.name}`,
        }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Gagal membuat pertandingan.");
      }
      setMatchNotice(payload.message || "Pertandingan dibuat.");
      setTeam1EntryId("");
      setTeam2EntryId("");
      setMatchDate("");
      setCourtName("");
      await reload();
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Gagal membuat pertandingan.");
    } finally {
      setIsCreatingMatch(false);
    }
  };

  const cancelMatch = async (matchId: string) => {
    if (!activeCategory) return;
    if (!window.confirm("Batalkan pertandingan ini?")) return;
    setCancellingMatchId(matchId);
    setMatchError(null);
    try {
      const response = await fetch(
        `/api/admin/tournaments/${activeCategory.id}/matches/${matchId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "Dibatalkan oleh admin turnamen." }),
        }
      );
      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Gagal membatalkan pertandingan.");
      }
      setMatchNotice(payload.message || "Pertandingan dibatalkan.");
      await reload();
    } catch (err) {
      setMatchError(err instanceof Error ? err.message : "Gagal membatalkan pertandingan.");
    } finally {
      setCancellingMatchId(null);
    }
  };

  const startEditing = () => {
    setInfoForm({
      leagueName: league.leagueName,
      startDate: league.startDate,
      endDate: league.endDate,
      registrationDeadline: league.registrationDeadline ?? "",
      mainEventStart: league.mainEventStart ?? "",
      mainEventEnd: league.mainEventEnd ?? "",
    });
    setEditError(null);
    setIsEditing(true);
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <Link
              href="/admin/tournaments"
              className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-matchpoin-navy"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Kembali ke Manajemen Turnamen
            </Link>
            <h1 className="font-heading text-3xl font-extrabold text-slate-900">{league.leagueName}</h1>
            <p className="text-sm text-slate-600">
              {league.season} · {formatIndonesianDate(league.startDate, { day: "numeric", month: "long", year: "numeric" })} –{" "}
              {formatIndonesianDate(league.endDate, { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <Button variant="outline" className="gap-2" onClick={startEditing}>
            <Pencil className="h-4 w-4" />
            Edit Info Liga
          </Button>
        </div>

        {notice && (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {notice}
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Periode Liga</p>
              <p className="text-sm font-bold text-slate-900">{formatIndonesianDate(league.startDate)}</p>
              <p className="text-xs text-slate-500">s.d. {formatIndonesianDate(league.endDate)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Main Event</p>
              <p className="text-sm font-bold text-slate-900">
                {league.mainEventStart ? formatIndonesianDate(league.mainEventStart) : "-"}
              </p>
              <p className="text-xs text-slate-500">
                {league.mainEventEnd ? `s.d. ${formatIndonesianDate(league.mainEventEnd)}` : ""}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Batas Pendaftaran</p>
              <p className="text-sm font-bold text-slate-900">
                {league.registrationDeadline ? formatIndonesianDate(league.registrationDeadline) : "-"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-1 p-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Kategori</p>
              <p className="text-sm font-bold text-slate-900">{league.categories.length} kategori</p>
              <p className="text-xs text-slate-500">Kuota 24 per kategori</p>
            </CardContent>
          </Card>
        </section>

        {isEditing && (
          <Card className="border-matchpoin-navy/20">
            <CardHeader>
              <CardTitle className="text-lg">Edit Info Turnamen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="leagueName">Nama Liga</Label>
                <Input
                  id="leagueName"
                  value={infoForm.leagueName}
                  onChange={(event) => setInfoForm((prev) => ({ ...prev, leagueName: event.target.value }))}
                  disabled={isSavingInfo}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="leagueStart">Mulai Liga</Label>
                  <Input
                    id="leagueStart"
                    type="date"
                    value={infoForm.startDate}
                    onChange={(event) => setInfoForm((prev) => ({ ...prev, startDate: event.target.value }))}
                    disabled={isSavingInfo}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leagueEnd">Selesai Liga</Label>
                  <Input
                    id="leagueEnd"
                    type="date"
                    value={infoForm.endDate}
                    onChange={(event) => setInfoForm((prev) => ({ ...prev, endDate: event.target.value }))}
                    disabled={isSavingInfo}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mainEventStart">Mulai Main Event</Label>
                  <Input
                    id="mainEventStart"
                    type="date"
                    value={infoForm.mainEventStart}
                    onChange={(event) => setInfoForm((prev) => ({ ...prev, mainEventStart: event.target.value }))}
                    disabled={isSavingInfo}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mainEventEnd">Selesai Main Event</Label>
                  <Input
                    id="mainEventEnd"
                    type="date"
                    value={infoForm.mainEventEnd}
                    onChange={(event) => setInfoForm((prev) => ({ ...prev, mainEventEnd: event.target.value }))}
                    disabled={isSavingInfo}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="registrationDeadline">Batas Pendaftaran</Label>
                  <Input
                    id="registrationDeadline"
                    type="date"
                    value={infoForm.registrationDeadline}
                    onChange={(event) => setInfoForm((prev) => ({ ...prev, registrationDeadline: event.target.value }))}
                    disabled={isSavingInfo}
                  />
                </div>
              </div>
              {editError && <p className="text-xs text-red-600">{editError}</p>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSavingInfo}>
                  Batal
                </Button>
                <Button variant="tennis" className="font-bold text-matchpoin-navy" onClick={saveInfo} disabled={isSavingInfo}>
                  {isSavingInfo ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Simpan
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {league.categories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setActiveCategoryId(category.id)}
                className={`rounded-xl border px-4 py-2 text-xs font-bold transition-colors ${
                  activeCategory?.id === category.id
                    ? "border-matchpoin-navy bg-matchpoin-navy text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                {category.name}
                <span className="ml-2 opacity-70">
                  {category.acceptedCount}/{category.maxParticipants}
                </span>
              </button>
            ))}
          </div>

          {activeCategory && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg">{activeCategory.name}</CardTitle>
                      <p className="mt-1 text-xs text-slate-500">
                        Kuota diterima {activeCategory.acceptedCount}/{activeCategory.maxParticipants} ·{" "}
                        {activeCategory.pendingCount} pending · {activeCategory.rejectedCount} ditolak
                      </p>
                    </div>
                    <Users className="h-5 w-5 text-slate-400" />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${
                        activeCategory.acceptedCount >= activeCategory.maxParticipants
                          ? "bg-rose-500"
                          : "bg-matchpoin-tennis"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          Math.round(
                            (activeCategory.acceptedCount / activeCategory.maxParticipants) * 100
                          )
                        )}%`,
                      }}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeCategory.registrations.length === 0 ? (
                    <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
                      Belum ada pendaftar pada kategori ini.
                    </p>
                  ) : (
                    activeCategory.registrations.map((entry) => {
                      const busy = actionId === entry.id;
                      return (
                        <div key={entry.id} className="rounded-xl border border-slate-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <p className="font-bold text-slate-900">{entryLabel(entry)}</p>
                              <p className="text-xs text-slate-500">
                                {entry.gender === "male" ? "Putra" : entry.gender === "female" ? "Putri" : "Gender belum diisi"}
                                {entry.partnerName ? " · tim ganda" : ""}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                Didaftarkan:{" "}
                                {entry.joinedAt
                                  ? `${formatIndonesianDate(entry.joinedAt)} ${new Date(entry.joinedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WITA`
                                  : "-"}
                              </p>
                            </div>
                            {statusBadge(entry.status)}
                          </div>

                          {entry.status === "pending" && (
                            <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                              <Button
                                variant="outline"
                                size="sm"
                                className="gap-1.5 text-red-600"
                                disabled={busy}
                                onClick={() => {
                                  setRejectTarget(entry);
                                  setRejectReason("");
                                }}
                              >
                                <XCircle className="h-4 w-4" />
                                Tolak
                              </Button>
                              <Button
                                variant="tennis"
                                size="sm"
                                className="gap-1.5 font-bold text-matchpoin-navy"
                                disabled={busy || activeCategory.acceptedCount >= activeCategory.maxParticipants}
                                onClick={() => {
                                  if (window.confirm(`Setujui pendaftaran ${entryLabel(entry)}?`)) {
                                    decide(entry, "approve");
                                  }
                                }}
                              >
                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                Terima
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Plus className="h-5 w-5 text-matchpoin-navy" />
                      Buat Pertandingan
                    </CardTitle>
                    <p className="text-xs text-slate-500">
                      Pilih tim dari pendaftar yang sudah diterima pada kategori {activeCategory.name}.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {acceptedEntries.length < 2 ? (
                      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                        Minimal 2 peserta/tim diterima untuk membuat pertandingan.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="team1">Tim A</Label>
                          <select
                            id="team1"
                            value={team1EntryId}
                            onChange={(event) => setTeam1EntryId(event.target.value)}
                            disabled={isCreatingMatch}
                            className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Pilih tim A</option>
                            {acceptedEntries.map((entry) => (
                              <option key={entry.entryId} value={entry.entryId}>
                                {entryLabel(entry)}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="team2">Tim B</Label>
                          <select
                            id="team2"
                            value={team2EntryId}
                            onChange={(event) => setTeam2EntryId(event.target.value)}
                            disabled={isCreatingMatch}
                            className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                          >
                            <option value="">Pilih tim B</option>
                            {acceptedEntries
                              .filter((entry) => entry.entryId !== team1EntryId)
                              .map((entry) => (
                                <option key={entry.entryId} value={entry.entryId}>
                                  {entryLabel(entry)}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="matchDate">Tanggal</Label>
                            <Input
                              id="matchDate"
                              type="date"
                              value={matchDate}
                              onChange={(event) => setMatchDate(event.target.value)}
                              disabled={isCreatingMatch}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="matchTime">Jam</Label>
                            <Input
                              id="matchTime"
                              type="time"
                              value={matchTime}
                              onChange={(event) => setMatchTime(event.target.value)}
                              disabled={isCreatingMatch}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="courtName">Lapangan</Label>
                          <Input
                            id="courtName"
                            value={courtName}
                            onChange={(event) => setCourtName(event.target.value)}
                            placeholder="Contoh: Lapangan Tenis Unhas"
                            disabled={isCreatingMatch}
                          />
                        </div>
                        {matchError && <p className="text-xs text-red-600">{matchError}</p>}
                        {matchNotice && <p className="text-xs text-emerald-700">{matchNotice}</p>}
                        <Button
                          variant="tennis"
                          className="w-full gap-2 font-bold text-matchpoin-navy"
                          onClick={createMatch}
                          disabled={isCreatingMatch || !team1EntryId || !team2EntryId}
                        >
                          {isCreatingMatch ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                          Buat Pertandingan
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Trophy className="h-5 w-5 text-matchpoin-navy" />
                      Pertandingan Kategori Ini
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {activeMatches.length === 0 ? (
                      <p className="rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                        Belum ada pertandingan.
                      </p>
                    ) : (
                      activeMatches.map((match) => (
                        <div key={match.id} className="rounded-xl border border-slate-200 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-slate-900">{match.title}</p>
                              <p className="text-[11px] text-slate-500">
                                {formatIndonesianDate(match.matchDate)} · {match.startTime.slice(0, 5)} WITA
                              </p>
                              <p className="mt-1 text-[11px] text-slate-600">
                                {match.team1.join(" & ") || "-"} vs {match.team2.join(" & ") || "-"}
                              </p>
                            </div>
                            <Badge variant={match.status === "cancelled" ? "destructive" : "outline"}>
                              {matchStatusLabel(match.status)}
                            </Badge>
                          </div>
                          {match.status !== "cancelled" && (
                            <div className="mt-2 flex justify-end">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600"
                                disabled={cancellingMatchId === match.id}
                                onClick={() => cancelMatch(match.id)}
                              >
                                {cancellingMatchId === match.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  "Batalkan"
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </section>
      </div>

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-lg">Tolak Pendaftaran</CardTitle>
              <p className="text-xs text-slate-500">{entryLabel(rejectTarget)}</p>
            </CardHeader>
            <CardContent className="space-y-3">
              <Label htmlFor="rejectReason">Alasan penolakan</Label>
              <textarea
                id="rejectReason"
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                className="h-24 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm"
                maxLength={500}
                placeholder="Contoh: kuota penuh / data tidak lengkap"
              />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectTarget(null)} disabled={actionId !== null}>
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  disabled={actionId !== null || !rejectReason.trim()}
                  onClick={() => decide(rejectTarget, "reject", rejectReason.trim())}
                >
                  {actionId ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                  Tolak
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
