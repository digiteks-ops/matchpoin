"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  Clock,
  Users,
} from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";

interface ManagedLeagueSummary {
  id: string;
  leagueKey: string;
  leagueName: string;
  season: string;
  startDate: string;
  endDate: string;
  categoryCount: number;
}

interface Registration {
  id: string;
  tournamentId: string;
  tournamentName: string;
  tournamentCategory: string;
  tournamentMaxParticipants: number;
  userId: string;
  category: string;
  entryId: string;
  entryRole: string;
  partnerUserId: string | null;
  status: string;
  joinedAt: string;
  playerName: string;
  partnerName: string | null;
  currentEntries: number;
}

interface RegistrationStats {
  pending: number;
  accepted: number;
  declined: number;
}

interface LeagueOption {
  id: string;
  name: string;
  category: string;
}

interface AdminTournamentsClientProps {
  leagues: ManagedLeagueSummary[];
}

const STATUS_OPTIONS = [
  { value: "", label: "Semua status" },
  { value: "pending", label: "Menunggu" },
  { value: "accepted", label: "Diterima" },
  { value: "rejected", label: "Ditolak" },
];

function statusBadge(status: string) {
  if (status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700">
        <Clock className="h-3.5 w-3.5" /> Menunggu
      </span>
    );
  }
  if (status === "accepted" || status === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" /> Diterima
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-700">
      <XCircle className="h-3.5 w-3.5" /> Ditolak
    </span>
  );
}

export default function AdminTournamentsClient({ leagues }: AdminTournamentsClientProps) {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [stats, setStats] = useState<RegistrationStats>({ pending: 0, accepted: 0, declined: 0 });
  const [tournaments, setTournaments] = useState<LeagueOption[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [tournamentFilter, setTournamentFilter] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionStates, setActionStates] = useState<Record<string, "approving" | "rejecting" | null>>({});
  const [rejectModal, setRejectModal] = useState<{ mode: "single" | "bulk"; id?: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [isBulkBusy, setIsBulkBusy] = useState(false);

  const loadRegistrations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (tournamentFilter) params.set("tournamentId", tournamentFilter);
      const response = await fetch(
        `/api/admin/tournaments/registrations${params.size ? `?${params.toString()}` : ""}`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error("Gagal memuat data");
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Gagal memuat pendaftaran");
      setRegistrations((data.registrations ?? []) as Registration[]);
      setTournaments((data.tournaments ?? []) as LeagueOption[]);
      if (data.stats) setStats(data.stats as RegistrationStats);
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat pendaftaran. Coba muat ulang.");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, tournamentFilter]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  const pendingVisible = useMemo(
    () => registrations.filter((registration) => registration.status === "pending"),
    [registrations]
  );
  const allPendingSelected =
    pendingVisible.length > 0 && pendingVisible.every((registration) => selected.has(registration.id));

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected(allPendingSelected ? new Set() : new Set(pendingVisible.map((r) => r.id)));
  };

  const approveOne = async (registration: Registration) => {
    setActionStates((prev) => ({ ...prev, [registration.id]: "approving" }));
    try {
      const response = await fetch(
        `/api/admin/tournaments/registrations/${registration.id}/approve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: null }),
        }
      );
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Gagal menyetujui pendaftaran");
    } finally {
      setActionStates((prev) => ({ ...prev, [registration.id]: null }));
    }
  };

  const handleApprove = async (registration: Registration) => {
    try {
      await approveOne(registration);
      await loadRegistrations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Setujui ${ids.length} pendaftaran terpilih?`)) return;
    setIsBulkBusy(true);
    try {
      for (const id of ids) {
        const registration = registrations.find((r) => r.id === id);
        if (registration?.status === "pending") await approveOne(registration);
      }
      await loadRegistrations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan saat menyetujui.");
      await loadRegistrations();
    } finally {
      setIsBulkBusy(false);
    }
  };

  const openReject = (mode: "single" | "bulk", id?: string) => {
    setRejectReason("");
    setRejectModal({ mode, id });
  };

  const submitReject = async () => {
    if (!rejectModal) return;
    const reason = rejectReason.trim() || null;
    const targets =
      rejectModal.mode === "bulk"
        ? Array.from(selected)
        : rejectModal.id
        ? [rejectModal.id]
        : [];
    if (targets.length === 0) {
      setRejectModal(null);
      return;
    }
    setIsBulkBusy(true);
    try {
      for (const id of targets) {
        setActionStates((prev) => ({ ...prev, [id]: "rejecting" }));
        const response = await fetch(`/api/admin/tournaments/registrations/${id}/reject`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        });
        const data = await response.json();
        setActionStates((prev) => ({ ...prev, [id]: null }));
        if (!data.success) throw new Error(data.message || "Gagal menolak pendaftaran");
      }
      setRejectModal(null);
      await loadRegistrations();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Terjadi kesalahan. Coba lagi.");
      await loadRegistrations();
    } finally {
      setIsBulkBusy(false);
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case "mens_singles": return "Tunggal Putra";
      case "womens_singles": return "Tunggal Putri";
      case "mens_doubles": return "Ganda Putra";
      case "womens_doubles": return "Ganda Putri";
      case "mixed_doubles": return "Ganda Campuran";
      default: return category;
    }
  };

  return (
    <div className="flex-1 py-8 md:py-12">
      <div className="container mx-auto space-y-8 px-4 sm:px-6">
        <div>
          <h1 className="text-2xl font-extrabold font-heading text-slate-900 sm:text-3xl">Manajemen Turnamen</h1>
          <p className="mt-1 text-sm text-slate-600">
            Kelola liga, pendaftaran, kuota, dan pertandingan Liga Tennis IKA17.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {leagues.length === 0 ? (
            <Card className="md:col-span-2">
              <CardContent className="p-6 text-sm text-slate-500">
                Belum ada liga. Jalankan seed admin untuk membuat Liga Tennis IKA17.
              </CardContent>
            </Card>
          ) : (
            leagues.map((league) => (
              <Card key={league.id} className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg font-bold text-slate-900">{league.leagueName}</CardTitle>
                      <p className="mt-1 text-xs text-slate-500">
                        {league.season} · {league.categoryCount} kategori
                      </p>
                    </div>
                    <Badge variant="tennis">{league.categoryCount} kategori</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="flex items-center gap-2 text-xs text-slate-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatIndonesianDate(league.startDate, { day: "numeric", month: "long", year: "numeric" })} –{" "}
                    {formatIndonesianDate(league.endDate, { day: "numeric", month: "long", year: "numeric" })}
                  </p>
                  <Link href={`/admin/tournaments/${league.id}`}>
                    <Button variant="tennis" className="w-full gap-2 font-bold text-matchpoin-navy">
                      Kelola Turnamen
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Menunggu</p>
              <p className="mt-1 text-2xl font-extrabold text-amber-800">{stats.pending}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Diterima</p>
              <p className="mt-1 text-2xl font-extrabold text-emerald-800">{stats.accepted}</p>
            </CardContent>
          </Card>
          <Card className="border-rose-200 bg-rose-50">
            <CardContent className="p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Ditolak</p>
              <p className="mt-1 text-2xl font-extrabold text-rose-800">{stats.declined}</p>
            </CardContent>
          </Card>
        </div>

        <div>
          <h2 className="text-xl font-bold text-slate-900">Pendaftaran</h2>
          <p className="mt-1 text-sm text-slate-600">
            Setujui atau tolak pendaftaran. Kuota hanya menghitung pendaftar yang diterima.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">
            Turnamen
            <select
              value={tournamentFilter}
              onChange={(event) => setTournamentFilter(event.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-700"
            >
              <option value="">Semua turnamen</option>
              {tournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-slate-600">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm font-normal text-slate-700"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={loadRegistrations} disabled={isLoading}>
            Muat Ulang
          </Button>
        </div>

        {selected.size > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-matchpoin-navy/20 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold text-slate-700">{selected.size} pendaftaran dipilih</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-rose-600"
                onClick={() => openReject("bulk")}
                disabled={isBulkBusy}
              >
                <XCircle className="h-4 w-4" /> Tolak terpilih
              </Button>
              <Button
                variant="tennis"
                size="sm"
                className="gap-1.5 font-bold text-matchpoin-navy"
                onClick={handleBulkApprove}
                disabled={isBulkBusy}
              >
                {isBulkBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Setujui terpilih
              </Button>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
            <Button variant="ghost" size="sm" onClick={loadRegistrations} className="ml-auto">
              Muat Ulang
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-48 animate-pulse rounded-2xl border bg-white" />
            ))}
          </div>
        ) : registrations.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Tidak Ada Pendaftaran"
            description="Belum ada pendaftaran yang cocok dengan filter saat ini."
          />
        ) : (
          <div className="space-y-4">
            {pendingVisible.length > 0 && (
              <label className="flex w-fit cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  checked={allPendingSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300"
                />
                Pilih semua yang menunggu ({pendingVisible.length})
              </label>
            )}

            {registrations.map((reg) => {
              const isPending = reg.status === "pending";
              const isActionLoading = Boolean(actionStates[reg.id]);
              const isFull = reg.currentEntries >= reg.tournamentMaxParticipants;

              return (
                <Card key={reg.id} className="overflow-hidden border-slate-200">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {isPending && (
                            <input
                              type="checkbox"
                              checked={selected.has(reg.id)}
                              onChange={() => toggleSelected(reg.id)}
                              className="h-4 w-4 rounded border-slate-300"
                              aria-label={`Pilih pendaftaran ${reg.playerName}`}
                            />
                          )}
                          {statusBadge(reg.status)}
                          <Badge variant="outline" className="text-xs">
                            {getCategoryLabel(reg.tournamentCategory)}
                          </Badge>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">{reg.tournamentName}</h3>
                        <p className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5" />
                          Didaftarkan:{" "}
                          {formatIndonesianDate(reg.joinedAt, {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}{" "}
                          {formatIndonesianTime(reg.joinedAt)} WITA
                        </p>
                      </div>
                      <div className="shrink-0 text-left sm:text-right">
                        <p className="text-xs text-slate-500">Kuota Kategori</p>
                        <p className="font-bold text-slate-900">
                          {reg.currentEntries} / {reg.tournamentMaxParticipants}
                        </p>
                        {isFull && (
                          <Badge variant="destructive" className="mt-1 text-[10px]">
                            Kuota Penuh
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                        <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Ketua Tim (Captain)
                        </p>
                        <p className="font-semibold text-slate-900">{reg.playerName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Role: {reg.entryRole === "captain" ? "Ketua Tim" : "Partner"}
                        </p>
                      </div>
                      {reg.partnerName && reg.partnerUserId && (
                        <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                            Partner
                          </p>
                          <p className="font-semibold text-slate-900">{reg.partnerName}</p>
                          <p className="mt-1 text-xs text-slate-500">Role: Partner</p>
                        </div>
                      )}
                    </div>

                    {isPending && (
                      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openReject("single", reg.id)}
                          disabled={isActionLoading || isBulkBusy}
                          className="gap-1.5 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                          <XCircle className="h-4 w-4" />
                          Tolak
                        </Button>
                        <Button
                          variant="tennis"
                          size="sm"
                          onClick={() => handleApprove(reg)}
                          disabled={isActionLoading || isBulkBusy || isFull}
                          className="gap-1.5 font-bold text-matchpoin-navy"
                        >
                          {actionStates[reg.id] === "approving" ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Menyetujui...
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="h-4 w-4" />
                              Setujui
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {rejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
              <h2 className="mb-2 text-lg font-bold text-slate-900">
                Tolak {rejectModal.mode === "bulk" ? `${selected.size} Pendaftaran` : "Pendaftaran"}
              </h2>
              <p className="mb-4 text-sm text-slate-600">
                Alasan bersifat opsional dan akan dikirim ke pemain. Kosongkan untuk memakai alasan bawaan.
              </p>
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Contoh: Kuota kategori sudah penuh / Data tidak lengkap"
                className="h-24 w-full resize-none rounded-lg border border-slate-300 bg-white p-3 text-sm focus:border-matchpoin-navy focus:outline-none focus:ring-2 focus:ring-matchpoin-tennis/20"
                maxLength={500}
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRejectModal(null)} disabled={isBulkBusy}>
                  Batal
                </Button>
                <Button variant="destructive" onClick={submitReject} disabled={isBulkBusy}>
                  {isBulkBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Menolak...
                    </>
                  ) : (
                    "Tolak & Kirim Notifikasi"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
