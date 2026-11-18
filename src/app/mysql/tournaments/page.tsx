"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Calendar, CheckCircle2, Loader2, Trophy, Users, Shield, Clock, Target, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { readErrorMessage } from "@/lib/errors";

interface Tournament {
  id: string;
  name: string;
  category: string;
  season: string;
  start_date: string;
  end_date: string;
  status: string;
  max_participants: number;
  registration_count: number;
  is_registered: boolean;
  description?: string | null;
}

interface Partner {
  id: string;
  name: string;
}

const categoryLabels: Record<string, string> = {
  mens_singles: "Tunggal Putra",
  womens_singles: "Tunggal Putri",
  mens_doubles: "Ganda Putra",
  womens_doubles: "Ganda Putri",
  mixed_doubles: "Ganda Campuran",
};

const categoryOrder = [
  "mens_singles",
  "womens_singles",
  "mens_doubles",
  "womens_doubles",
  "mixed_doubles",
];

function isDoubles(category: string) {
  return category.endsWith("_doubles");
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

function formatDateLong(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Makassar",
  }).format(new Date(`${value}T12:00:00+08:00`));
}

export default function MySqlTournamentsPage() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selected, setSelected] = useState<Tournament | null>(null);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [partnerId, setPartnerId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRegistering, setIsRegistering] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const loadTournaments = useCallback(async () => {
    setErrorMessage("");
    try {
      const response = await fetch("/api/mysql/tournaments");
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Gagal Memuat Kompetisi."));
      return;
      }
      const data = (await response.json()) as { tournaments?: Tournament[] };
      setTournaments(data.tournaments || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal Memuat Kompetisi.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTournaments();
  }, [loadTournaments]);

  const openRegistration = async (tournament: Tournament) => {
    setErrorMessage("");
    setSuccessMessage("");
    setSelected(tournament);
    setPartnerId("");
    if (!isDoubles(tournament.category)) {
      await register(tournament, null);
      return;
    }
    setIsRegistering(true);
    try {
      const response = await fetch(`/api/mysql/tournaments/${tournament.id}/partners`);
      if (response.status === 401) {
        router.push(`/mysql/auth/login?redirectTo=${encodeURIComponent("/mysql/tournaments")}`);
        return;
      }
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Gagal memuat pilihan partner."));
        return;
      }
      const data = (await response.json()) as { partners?: Partner[] };
      setPartners(data.partners || []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal memuat pilihan partner.");
    } finally {
      setIsRegistering(false);
    }
  };

  const register = async (tournament: Tournament, selectedPartnerId: string | null) => {
    setIsRegistering(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/mysql/tournaments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: tournament.id,
          partnerUserId: selectedPartnerId,
        }),
      });
      if (response.status === 401) {
        router.push(`/mysql/auth/login?redirectTo=${encodeURIComponent("/mysql/tournaments")}`);
        return;
      }
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Pendaftaran kompetisi gagal."));
        return;
      }
      const result = (await response.json()) as { message?: string };
      setSuccessMessage(result.message || "Pendaftaran berhasil.");
      setSelected(null);
      await loadTournaments();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Pendaftaran kompetisi gagal.");
    } finally {
      setIsRegistering(false);
    }
  };

  // Filter and sort IKA 17 tournaments
  const ika17Tournaments = tournaments
    .filter((t) => t.id.startsWith("ika17-"))
    .sort((a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category));

  const isIka17Open = ika17Tournaments.some((t) => t.status === "registration_open" && t.registration_count < t.max_participants);
  const totalQuota = ika17Tournaments.reduce((sum, t) => sum + t.max_participants, 0);
  const totalRegistered = ika17Tournaments.reduce((sum, t) => sum + t.registration_count, 0);

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-5xl space-y-6 px-4 sm:px-6">
        {/* Header with DAFTAR TURNAMEN button */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold uppercase text-matchpoin-navy">
              <Trophy className="h-3.5 w-3.5 text-matchpoin-tennis" /> LIGA TENNIS IKA 17
            </div>
            <h1 className="mt-2 text-3xl font-extrabold text-slate-900">LIGA TENNIS IKA 17</h1>
            <p className="mt-1 text-sm text-slate-500">Kompetisi resmi IKA 17 · Pendaftaran 1-31 Desember 2026</p>
          </div>
          {isIka17Open && (
            <Button
              variant="tennis"
              size="lg"
              className="w-full sm:w-auto font-bold text-lg gap-2"
              onClick={() => document.getElementById("categories")?.scrollIntoView({ behavior: "smooth" })}
            >
              <Trophy className="h-5 w-5" />
              DAFTAR TURNAMEN
            </Button>
          )}
        </div>

        {/* Tournament Info Card */}
        <Card className="border-matchpoin-navy/20 bg-white">
          <CardHeader className="bg-matchpoin-navy/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-xl font-bold text-matchpoin-navy">LIGA TENNIS IKA 17</CardTitle>
                <CardDescription className="mt-1">Kompetisi Tenis Resmi IKA 17 · 2027 Season</CardDescription>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-600">
                <span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Pendaftaran: 1-31 Des 2026</span>
                <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> Reguler: 1 Jan - 31 Mar 2027</span>
                <span className="flex items-center gap-1.5"><Target className="h-4 w-4" /> Main Event: 3-4 Apr 2027</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quota Summary */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center">
                <p className="text-2xl font-extrabold text-emerald-700">{totalRegistered} / {totalQuota}</p>
                <p className="text-xs text-emerald-600">Peserta Terdaftar / Total Kuota</p>
              </div>
              <div className="rounded-xl border border-matchpoin-tennis/30 bg-matchpoin-tennis/10 p-4 text-center">
                <p className="text-2xl font-extrabold text-matchpoin-navy">{ika17Tournaments.length}</p>
                <p className="text-xs text-matchpoin-navy">Kategori Kompetisi</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4 text-center">
                <p className="text-2xl font-extrabold text-slate-700">{ika17Tournaments.filter(t => t.status === "registration_open").length}</p>
                <p className="text-xs text-slate-500">Kategori Buka Pendaftaran</p>
              </div>
            </div>

            {/* Schedule */}
            <Separator />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><Calendar className="h-4 w-4 text-matchpoin-navy" /> Jadwal Resmi</h3>
              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <div className="flex items-center gap-2 mb-2"><Calendar className="h-4 w-4 text-blue-600" /><span className="font-semibold text-blue-800">Pendaftaran</span></div>
                  <p className="text-sm text-blue-700">1 – 31 Desember 2026</p>
                  <p className="text-xs text-blue-500 mt-1">Buka untuk semua kategori</p>
                </div>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 mb-2"><Clock className="h-4 w-4 text-emerald-600" /><span className="font-semibold text-emerald-800">Kompetisi Reguler</span></div>
                  <p className="text-sm text-emerald-700">1 Januari – 31 Maret 2027</p>
                  <p className="text-xs text-emerald-500 mt-1">Pertandingan liga berlangsung</p>
                </div>
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-4">
                  <div className="flex items-center gap-2 mb-2"><Target className="h-4 w-4 text-purple-600" /><span className="font-semibold text-purple-800">Main Event</span></div>
                  <p className="text-sm text-purple-700">3 – 4 April 2027</p>
                  <p className="text-xs text-purple-500 mt-1">Top 8 per kategori</p>
                </div>
              </div>
            </div>

            {/* Rules */}
            <Separator />
            <div>
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2"><Shield className="h-4 w-4 text-matchpoin-navy" /> Aturan Kompetisi</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm text-slate-700">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-matchpoin-navy mb-2 flex items-center gap-1"><Trophy className="h-4 w-4" /> Format</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li>• Race to 8 poin (no deuce)</li>
                    <li>• Ganti lapangan saat 4 poin</li>
                    <li>• Maksimal skor 8-7</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-matchpoin-navy mb-2 flex items-center gap-1"><Target className="h-4 w-4" /> Poin</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li>• Menang normal: 3 poin</li>
                    <li>• Kalah normal: 0 poin</li>
                    <li>• WO: perlu persetujuan admin</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-matchpoin-navy mb-2 flex items-center gap-1"><Shield className="h-4 w-4" /> Kualifikasi</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li>• Top 8 per kategori</li>
                    <li>• Lolos ke Main Event</li>
                    <li>• 3-4 April 2027</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-matchpoin-navy mb-2 flex items-center gap-1"><Users className="h-4 w-4" /> Kuota per Kategori</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li>• 24 entry per kategori</li>
                    <li>• Tunggal: 1 pemain/entry</li>
                    <li>• Ganda: 2 pemain/tim</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-matchpoin-navy mb-2 flex items-center gap-1"><Shield className="h-4 w-4" /> Konfirmasi Hasil</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li>• Butuh konfirmasi lawan</li>
                    <li>• 24 jam waktu sanggahan</li>
                    <li>• Sanggahan tidak update otomatis</li>
                  </ul>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <p className="font-semibold text-matchpoin-navy mb-2 flex items-center gap-1"><Users className="h-4 w-4" /> Ganda Campuran</p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    <li>• Wajib 1 putra + 1 putri</li>
                    <li>• Maks 1 putra per tim</li>
                    <li>• Maks 1 putri per tim</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Error/Success Messages */}
        {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
        {successMessage && <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{successMessage}</div>}

        {/* Categories */}
        <div id="categories">
          <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2"><Trophy className="h-6 w-6 text-matchpoin-tennis" /> Kategori Kompetisi</h2>
          {isLoading ? (
            <div className="py-16 text-center text-slate-500"><Loader2 className="mx-auto mb-2 h-7 w-7 animate-spin" />Memuat kategori...</div>
          ) : ika17Tournaments.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-sm text-slate-500">Data LIGA TENNIS IKA 17 belum tersedia.</CardContent></Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {ika17Tournaments.map((tournament) => {
                const isFull = tournament.registration_count >= tournament.max_participants;
                const isOpen = tournament.status === "registration_open";
                const quotaPercent = Math.round((tournament.registration_count / tournament.max_participants) * 100);
                return (
                  <Card key={tournament.id} className="border-matchpoin-navy/10 hover:border-matchpoin-navy/30 transition-colors">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <CardTitle className="text-lg font-bold text-slate-900">{categoryLabels[tournament.category] || tournament.category}</CardTitle>
                          <CardDescription className="mt-1">{tournament.name} · {tournament.season}</CardDescription>
                        </div>
                        <Badge variant={isOpen ? "tennis" : "secondary"} className={isOpen ? "text-matchpoin-navy" : ""}>
                          {isFull ? "Penuh" : isOpen ? "Buka" : tournament.status}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {/* Quota bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-slate-500">
                          <span>Kuota</span>
                          <span>{tournament.registration_count} / {tournament.max_participants} ({quotaPercent}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                          <div className="h-full rounded-full bg-matchpoin-tennis transition-all" style={{ width: `${Math.min(quotaPercent, 100)}%` }} />
                        </div>
                      </div>

                      {/* Dates */}
                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span className="flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />{formatDateLong(tournament.start_date)} – {formatDateLong(tournament.end_date)}</span>
                        <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" />Pendaftaran: 1-31 Des 2026</span>
                      </div>

                      {/* Description/Rules preview */}
                      {tournament.description && (
                        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] text-slate-600">
                          {tournament.description.split("\n").slice(0, 4).join("\n")}
                          {tournament.description.split("\n").length > 4 && <span className="text-matchpoin-navy font-medium"> …</span>}
                        </div>
                      )}

                      {/* Registration Actions */}
                      {tournament.is_registered ? (
                        <Button disabled variant="outline" className="w-full text-emerald-700 border-emerald-300 bg-emerald-50">
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Sudah terdaftar
                        </Button>
                      ) : !isOpen || isFull ? (
                        <Button disabled variant="secondary" className="w-full">
                          {isFull ? "Kuota penuh" : "Pendaftaran ditutup"}
                        </Button>
                      ) : (
                        <Button
                          className="w-full font-bold"
                          disabled={isRegistering}
                          onClick={() => void openRegistration(tournament)}
                        >
                          {isRegistering && selected?.id === tournament.id ? (
                            <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Memproses...</span>
                          ) : (
                            <>
                              <Trophy className="h-4 w-4" /> Daftar {categoryLabels[tournament.category] || tournament.category}
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Partner Selection Modal */}
        {selected && isDoubles(selected.category) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>Pilih Partner</CardTitle>
                <CardDescription>{selected.name} · {categoryLabels[selected.category] || selected.category}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {partners.length > 0 ? (
                  <select
                    value={partnerId}
                    onChange={(event) => setPartnerId(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                    disabled={isRegistering}
                  >
                    <option value="">Pilih partner terdaftar</option>
                    {partners.map((partner) => (
                      <option key={partner.id} value={partner.id}>{partner.name}</option>
                    ))}
                  </select>
                ) : (
                  <p className="text-xs text-slate-500">Belum ada partner yang memenuhi syarat.</p>
                )}
              </CardContent>
              <CardContent className="flex justify-end gap-2 pt-0">
                <Button variant="outline" onClick={() => setSelected(null)} disabled={isRegistering}>Batal</Button>
                <Button onClick={() => partnerId && void register(selected, partnerId)} disabled={!partnerId || isRegistering}>
                  {isRegistering ? <Loader2 className="h-4 w-4 animate-spin" /> : "Daftar Tim"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}