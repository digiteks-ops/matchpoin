"use client";

import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CheckCircle2, XCircle, Loader2, AlertCircle, Clock, Users, Search, MoreHorizontal, Eye } from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";

interface PendingRegistration {
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

interface AdminTournamentsClientProps {}

export default function AdminTournamentsClient({}: AdminTournamentsClientProps) {
  const [registrations, setRegistrations] = useState<PendingRegistration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, "approving" | "rejecting" | null>>({});
  const [rejectReasons, setRejectReasons] = useState<Record<string, string>>({});
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);

  useEffect(() => {
    loadRegistrations();
  }, []);

  const loadRegistrations = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/mysql/admin/tournaments/registrations", { cache: "no-store" });
      if (!response.ok) throw new Error("Gagal memuat data");
      const data = await response.json();
      if (data.success) {
        setRegistrations(data.registrations);
      } else {
        setError(data.message || "Gagal memuat pendaftaran");
      }
    } catch (err) {
      setError("Gagal memuat pendaftaran tertunda. Coba muat ulang halaman.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleApprove = async (registration: PendingRegistration) => {
    setActionStates((prev) => ({ ...prev, [registration.id]: "approving" }));
    try {
      const response = await fetch(`/api/mysql/admin/tournaments/registrations/${registration.id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: null }),
      });
      const data = await response.json();
      if (data.success) {
        setRegistrations((prev) => prev.filter((r) => r.entryId !== registration.entryId));
      } else {
        alert(data.message || "Gagal menyetujui pendaftaran");
      }
    } catch {
      alert("Terjadi kesalahan. Coba lagi.");
    } finally {
      setActionStates((prev) => ({ ...prev, [registration.id]: null }));
    }
  };

  const openRejectModal = (registrationId: string) => {
    setShowRejectModal(registrationId);
  };

  const closeRejectModal = () => {
    setShowRejectModal(null);
  };

  const handleReject = async (registration: PendingRegistration) => {
    const reason = rejectReasons[registration.id];
    if (!reason || !reason.trim()) {
      alert("Alasan penolakan wajib diisi.");
      return;
    }
    setActionStates((prev) => ({ ...prev, [registration.id]: "rejecting" }));
    try {
      const response = await fetch(`/api/mysql/admin/tournaments/registrations/${registration.id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await response.json();
      if (data.success) {
        setRegistrations((prev) => prev.filter((r) => r.entryId !== registration.entryId));
        setRejectReasons((prev) => { const next = { ...prev }; delete next[registration.id]; return next; });
        closeRejectModal();
      } else {
        alert(data.message || "Gagal menolak pendaftaran");
      }
    } catch {
      alert("Terjadi kesalahan. Coba lagi.");
    } finally {
      setActionStates((prev) => ({ ...prev, [registration.id]: null }));
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
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto space-y-8 px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900">Persetujuan Pendaftaran Turnamen</h1>
            <p className="text-slate-600 mt-1 text-sm">Kelola pendaftaran menunggu persetujuan Super Admin untuk LIGA TENNIS IKA 17.</p>
          </div>
        </div>

        {error && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
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
            title="Tidak Ada Pendaftaran Tertunda"
            description="Semua pendaftaran turnamen telah diproses atau belum ada yang menunggu persetujuan."
          />
        ) : (
          <div className="space-y-4">
            {registrations.map((reg) => {
              const isActionLoading = actionStates[reg.id] !== undefined && actionStates[reg.id] !== null;
              const isFull = reg.currentEntries >= reg.tournamentMaxParticipants;

              return (
                <Card key={reg.id} className="border-slate-200 overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                            <Clock className="w-3.5 h-3.5" />
                            Menunggu Persetujuan
                          </span>
                          <Badge variant="outline" className="text-xs">{getCategoryLabel(reg.tournamentCategory)}</Badge>
                        </div>
                        <h3 className="text-lg font-bold text-slate-900">{reg.tournamentName}</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          Didaftarkan: {formatIndonesianDate(reg.joinedAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} {formatIndonesianTime(reg.joinedAt)} WITA
                        </p>
                      </div>
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
                        <div className="text-right sm:text-left">
                          <p className="text-xs text-slate-500">Kuota Kategori</p>
                          <p className="font-bold text-slate-900">{reg.currentEntries} / {reg.tournamentMaxParticipants}</p>
                          {isFull && (
                            <Badge variant="destructive" className="mt-1 text-[10px]">Kuota Penuh</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 pt-0">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Ketua Tim (Captain)</p>
                        <p className="font-semibold text-slate-900">{reg.playerName}</p>
                        <p className="text-xs text-slate-500 mt-1">ID: {reg.userId}</p>
                        <p className="text-xs text-slate-500">Role: {reg.entryRole === "captain" ? "Ketua Tim" : "Partner"}</p>
                      </div>
                      {reg.partnerName && reg.partnerUserId && (
                        <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Partner</p>
                          <p className="font-semibold text-slate-900">{reg.partnerName}</p>
                          <p className="text-xs text-slate-500 mt-1">ID: {reg.partnerUserId}</p>
                          <p className="text-xs text-slate-500">Role: Partner</p>
                        </div>
                      )}
                      {!reg.partnerName && reg.category.endsWith("_doubles") && (
                        <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 sm:col-span-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            Kategori Ganda Tanpa Partner
                          </p>
                          <p className="text-xs text-amber-800">Pendaftar belum memilih partner. Pastikan partner ditambahkan sebelum menyetujui.</p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-100">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRejectModal(reg.id)}
                        disabled={isActionLoading}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700 gap-1.5"
                      >
                        <XCircle className="w-4 h-4" />
                        Tolak
                      </Button>
                      <Button
                        variant="tennis"
                        size="sm"
                        onClick={() => handleApprove(reg)}
                        disabled={isActionLoading || isFull}
                        className="text-matchpoin-navy font-bold gap-1.5"
                      >
                        {isActionLoading && actionStates[reg.id] === "approving" ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Menyetujui...
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            Setujui
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {showRejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl animate-in slide-in-from-top-4 duration-200">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Tolak Pendaftaran</h2>
              <p className="text-sm text-slate-600 mb-4">Masukkan alasan penolakan yang akan dikirimkan ke pemain:</p>
              <textarea
                value={rejectReasons[showRejectModal] || ""}
                onChange={(e) => setRejectReasons((prev) => ({ ...prev, [showRejectModal!]: e.target.value }))}
                placeholder="Contoh: Kuota kategori sudah penuh / Data tidak lengkap / Tidak memenuhi syarat"
                className="w-full h-24 p-3 rounded-lg border border-slate-300 bg-white text-sm focus:border-matchpoin-tense focus:outline-none focus:ring-2 focus:ring-matchpoin-tense/20 resize-none"
                maxLength={500}
              />
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={closeRejectModal} disabled={actionStates[showRejectModal] === "rejecting"}>
                  Batal
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const reg = registrations.find((r) => r.id === showRejectModal);
                    if (reg) handleReject(reg);
                  }}
                  disabled={actionStates[showRejectModal] === "rejecting" || !rejectReasons[showRejectModal]?.trim()}
                >
                  {actionStates[showRejectModal] === "rejecting" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
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