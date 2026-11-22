"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TournamentLeaderboard } from "@/components/tournaments/tournament-leaderboard";
import { AlertCircle, Calendar, CheckCircle2, Clock, Loader2, MapPin, Trophy, Users } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { formatIndonesianDate } from "@/lib/utils";
import {
  IKA17_CATEGORIES,
  IKA17_END_DATE,
  IKA17_LEAGUE_NAME,
  IKA17_MAIN_EVENT_END,
  IKA17_MAIN_EVENT_START,
  IKA17_MIN_MATCHES,
  IKA17_QUOTA,
  IKA17_REGISTRATION_DEADLINE,
  IKA17_START_DATE,
  ika17Category,
} from "@/lib/tournaments/ika17";

interface TournamentRow {
  id: string;
  name: string;
  category: string;
  season: string;
  league_key: string | null;
  league_name: string | null;
  start_date: string;
  end_date: string;
  main_event_start_date: string | null;
  main_event_end_date: string | null;
  registration_deadline: string | null;
  status: string;
  max_participants: number;
  registration_count: number;
  pending_count: number;
  is_registered: boolean;
  my_status: string | null;
}

interface PartnerOption {
  id: string;
  name: string;
  gender: string | null;
}

const dateLabel = (value: string | null | undefined) =>
  value ? formatIndonesianDate(value, { day: "numeric", month: "long", year: "numeric" }) : "-";

function statusLabel(status: string | null): string | null {
  if (status === "pending") return "Menunggu persetujuan";
  if (status === "accepted" || status === "confirmed") return "Diterima";
  if (status === "rejected") return "Ditolak";
  return null;
}

export default function TournamentsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentGender, setCurrentGender] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<TournamentRow | null>(null);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [partnerUserId, setPartnerUserId] = useState("");
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [eligibilityConfirmed, setEligibilityConfirmed] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      setCurrentUser(user);
      if (!user) return;
      const { data } = await supabase
        .from("public_players")
        .select("gender")
        .eq("user_id", user.id)
        .maybeSingle();
      setCurrentGender((data as { gender?: string | null } | null)?.gender ?? null);
    });
  }, []);

  const loadTournaments = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/tournaments", { cache: "no-store" });
      const payload = (await response.json()) as {
        success?: boolean;
        tournaments?: TournamentRow[];
        message?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Gagal memuat turnamen.");
      }
      setTournaments(payload.tournaments ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat turnamen.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  const league = useMemo(() => {
    const first = tournaments[0];
    return {
      name: first?.league_name || IKA17_LEAGUE_NAME,
      start: first?.start_date || IKA17_START_DATE,
      end: first?.end_date || IKA17_END_DATE,
      mainEventStart: first?.main_event_start_date || IKA17_MAIN_EVENT_START,
      mainEventEnd: first?.main_event_end_date || IKA17_MAIN_EVENT_END,
      deadline: first?.registration_deadline || IKA17_REGISTRATION_DEADLINE,
    };
  }, [tournaments]);

  const categories = useMemo(() => {
    return IKA17_CATEGORIES.map((definition) => {
      const row = tournaments.find((entry) => entry.category === definition.id);
      return { definition, row };
    });
  }, [tournaments]);

  const openRegistration = async (row: TournamentRow) => {
    setSelected(row);
    setPartnerUserId("");
    setRegError(null);
    setRegSuccess(null);
    setPartners([]);
    setEligibilityConfirmed(false);

    const definition = ika17Category(row.category);
    if (!definition?.doubles) return;

    setPartnersLoading(true);
    try {
      const response = await fetch(
        `/api/tournaments/${row.id}/partners?category=${encodeURIComponent(row.category)}`,
        { cache: "no-store" }
      );
      const payload = (await response.json()) as {
        success?: boolean;
        partners?: PartnerOption[];
        message?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Gagal memuat calon partner.");
      }
      const allowed = (payload.partners ?? []).filter((partner) => {
        if (definition.genderRule === "male") return partner.gender === "male";
        if (definition.genderRule === "female") return partner.gender === "female";
        if (currentGender === "male") return partner.gender === "female";
        if (currentGender === "female") return partner.gender === "male";
        return true;
      });
      setPartners(allowed);
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Gagal memuat calon partner.");
    } finally {
      setPartnersLoading(false);
    }
  };

  const closeModal = () => {
    if (regLoading) return;
    setSelected(null);
    setPartnerUserId("");
    setRegError(null);
  };

  const submitRegistration = async () => {
    if (!selected) return;
    const definition = ika17Category(selected.category);
    if (!definition) return;

    setRegError(null);
    setRegSuccess(null);
    if (definition.genderRule === "male" && currentGender && currentGender !== "male") {
      setRegError("Kategori ini khusus pemain putra.");
      return;
    }
    if (definition.genderRule === "female" && currentGender && currentGender !== "female") {
      setRegError("Kategori ini khusus pemain putri.");
      return;
    }
    if (definition.doubles && !partnerUserId) {
      setRegError("Pilih partner untuk kategori ganda.");
      return;
    }

    setRegLoading(true);
    try {
      const response = await fetch("/api/tournaments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: selected.id,
          partnerUserId: definition.doubles ? partnerUserId : null,
        }),
      });
      const payload = (await response.json()) as { success?: boolean; message?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Pendaftaran gagal.");
      }
      setRegSuccess(payload.message || "Pendaftaran berhasil dikirim.");
      setPartnerUserId("");
      await loadTournaments();
    } catch (err) {
      setRegError(err instanceof Error ? err.message : "Pendaftaran gagal.");
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-6xl space-y-8 px-4 sm:px-6">
        <section className="overflow-hidden rounded-3xl border border-matchpoin-navy/10 bg-gradient-to-br from-matchpoin-navy via-matchpoin-navy to-slate-900 p-6 text-white shadow-xl sm:p-9">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-matchpoin-tennis">
                <Trophy className="h-3.5 w-3.5" />
                Liga Resmi
              </span>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight sm:text-4xl">
                {league.name}
              </h1>
              <p className="max-w-2xl text-sm leading-relaxed text-slate-200">
                Liga musim 1 dengan 5 kategori. Pendaftaran dibuka sampai{" "}
                <strong className="text-white">{dateLabel(league.deadline)}</strong>. Kuota setiap
                kategori maksimal {IKA17_QUOTA} peserta/tim dan dihitung dari pendaftar yang sudah
                diterima admin.
              </p>
              <p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-matchpoin-tennis/90 px-3 py-2 text-xs font-bold text-matchpoin-navy">
                <Trophy className="h-4 w-4" />
                Syarat Main Event: minimal {IKA17_MIN_MATCHES} pertandingan
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <div className="rounded-2xl bg-white/10 p-4 backdrop-blur">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-300">
                  <Calendar className="h-3.5 w-3.5" /> Periode Liga
                </p>
                <p className="mt-2 text-sm font-bold">{dateLabel(league.start)}</p>
                <p className="text-xs text-slate-300">s.d. {dateLabel(league.end)}</p>
              </div>
              <div className="rounded-2xl bg-matchpoin-tennis/90 p-4 text-matchpoin-navy">
                <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider">
                  <Trophy className="h-3.5 w-3.5" /> Main Event
                </p>
                <p className="mt-2 text-sm font-bold">{dateLabel(league.mainEventStart)}</p>
                <p className="text-xs">s.d. {dateLabel(league.mainEventEnd)}</p>
              </div>
            </div>
          </div>
        </section>

        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {isLoading ? (
            <div className="col-span-full flex flex-col items-center py-16 text-slate-400">
              <Loader2 className="mb-2 h-8 w-8 animate-spin text-matchpoin-navy" />
              Memuat kategori liga...
            </div>
          ) : (
            categories.map(({ definition, row }) => {
              if (!row) {
                return (
                  <Card key={definition.id} className="border-dashed border-slate-300">
                    <CardContent className="space-y-2 p-6">
                      <p className="font-bold text-slate-800">{definition.label}</p>
                      <p className="text-xs text-slate-500">Kategori belum tersedia. Hubungi admin.</p>
                    </CardContent>
                  </Card>
                );
              }

              const accepted = row.registration_count;
              const quota = row.max_participants || IKA17_QUOTA;
              const isFull = accepted >= quota;
              const deadlinePassed = Boolean(
                row.registration_deadline &&
                  new Date(`${row.registration_deadline}T23:59:59`) < new Date()
              );
              const isClosed = row.status !== "registration_open" || deadlinePassed;
              const myStatus = row.my_status;
              const isActive = myStatus === "pending" || myStatus === "accepted" || myStatus === "confirmed";
              const percent = Math.min(100, Math.round((accepted / quota) * 100));

              return (
                <Card key={definition.id} className="flex flex-col border-slate-200 transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg font-bold text-slate-900">{definition.label}</CardTitle>
                        <p className="mt-1 text-xs text-slate-500">{definition.shortLabel}</p>
                      </div>
                      <Badge variant={isFull || isClosed ? "destructive" : "success"}>
                        {isFull ? "Penuh" : isClosed ? "Ditutup" : "Dibuka"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-1 flex-col gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          Kuota diterima
                        </span>
                        <strong className={isFull ? "text-rose-600" : "text-slate-800"}>
                          {accepted}/{quota} {definition.doubles ? "tim" : "peserta"}
                        </strong>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${isFull ? "bg-rose-500" : "bg-matchpoin-tennis"}`}
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      {row.pending_count > 0 && (
                        <p className="text-[11px] text-amber-700">
                          {row.pending_count} pendaftar menunggu persetujuan admin.
                        </p>
                      )}
                    </div>

                  <label className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                    <input
                      type="checkbox"
                      checked={eligibilityConfirmed}
                      onChange={(event) => setEligibilityConfirmed(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                    />
                    <span>
                      <strong>
                        Saya menyatakan belum pernah mengikuti PORDA, PORPROV, atau PON.
                      </strong>{" "}
                      Pernyataan ini menjadi dasar verifikasi admin. Peserta yang pernah tampil di
                      ajang tersebut tidak eligible.
                    </span>
                  </label>

                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      <p className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        {definition.genderRule === "mixed"
                          ? "Wajib 1 pemain putra + 1 pemain putri dalam satu tim."
                          : definition.genderRule === "male"
                          ? "Khusus pemain putra."
                          : "Khusus pemain putri."}
                      </p>
                    </div>

                    {myStatus && (
                      <div
                        className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${
                          myStatus === "rejected"
                            ? "border-rose-200 bg-rose-50 text-rose-700"
                            : myStatus === "pending"
                            ? "border-amber-200 bg-amber-50 text-amber-800"
                            : "border-emerald-200 bg-emerald-50 text-emerald-800"
                        }`}
                      >
                        {myStatus === "pending" ? (
                          <Clock className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        Status Anda: {statusLabel(myStatus)}
                      </div>
                    )}

                    <div className="mt-auto">
                      {!currentUser ? (
                        <Link href="/login?redirectTo=/tournaments">
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            Masuk untuk Mendaftar
                          </Button>
                        </Link>
                      ) : isActive ? (
                        <Button variant="outline" size="sm" className="w-full text-xs" disabled>
                          {myStatus === "pending" ? "Menunggu Persetujuan" : "Sudah Terdaftar"}
                        </Button>
                      ) : isFull ? (
                        <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
                          Kuota Penuh ({accepted}/{quota})
                        </Button>
                      ) : isClosed ? (
                        <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
                          Pendaftaran Ditutup
                        </Button>
                      ) : (
                        <Button
                          variant="tennis"
                          size="sm"
                          className="w-full text-xs font-bold text-matchpoin-navy"
                          onClick={() => openRegistration(row)}
                        >
                          {myStatus === "rejected" ? "Daftar Ulang" : "Daftar"}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </section>

        <TournamentLeaderboard />

        <section className="rounded-2xl border border-slate-200 bg-white p-5 text-xs text-slate-600">
          <p className="text-sm font-bold text-slate-800">Ketentuan Liga Tennis IKA17</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>Periode liga: {dateLabel(league.start)} – {dateLabel(league.end)}.</li>
            <li>Main event: {dateLabel(league.mainEventStart)} – {dateLabel(league.mainEventEnd)}.</li>
            <li>
              <strong className="text-rose-700">
                Peserta dilarang pernah mengikuti PORDA, PORPROV, atau PON.
              </strong>{" "}
              Pemain yang pernah tampil di ajang tersebut tidak eligible untuk mengikuti liga ini.
            </li>
            <li>
              <strong className="text-slate-800">
                Syarat lolos ke Main Event: minimal {IKA17_MIN_MATCHES} pertandingan
              </strong>{" "}
              yang tercatat selama periode liga.
            </li>
            <li>Setiap kategori maksimal {IKA17_QUOTA} peserta (single) atau {IKA17_QUOTA} tim (ganda).</li>
            <li>Kuota dihitung dari pendaftar berstatus diterima (accepted).</li>
            <li>Pendaftaran masuk sebagai pending dan harus disetujui admin.</li>
            <li>Ganda campuran wajib 1 pemain putra + 1 pemain putri.</li>
          </ul>
        </section>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <CardHeader>
              <CardTitle className="text-lg">Daftar {ika17Category(selected.category)?.label}</CardTitle>
              <p className="text-xs text-slate-500">
                {selected.name} · Kuota {selected.registration_count}/{selected.max_participants || IKA17_QUOTA}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {regSuccess ? (
                <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{regSuccess}</span>
                </div>
              ) : (
                <>
                  {ika17Category(selected.category)?.doubles && (
                    <div className="space-y-2">
                      <label htmlFor="partner" className="text-sm font-semibold text-slate-800">
                        Partner
                      </label>
                      <select
                        id="partner"
                        value={partnerUserId}
                        onChange={(event) => setPartnerUserId(event.target.value)}
                        disabled={partnersLoading || regLoading}
                        className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                      >
                        <option value="">
                          {partnersLoading ? "Memuat pemain..." : "Pilih partner"}
                        </option>
                        {partners.map((partner) => (
                          <option key={partner.id} value={partner.id}>
                            {partner.name}
                            {partner.gender === "male" ? " (Putra)" : partner.gender === "female" ? " (Putri)" : ""}
                          </option>
                        ))}
                      </select>
                      {ika17Category(selected.category)?.genderRule === "mixed" && (
                        <p className="text-[11px] text-slate-500">
                          Ganda campuran wajib terdiri dari 1 pemain putra dan 1 pemain putri.
                          {currentGender === "male"
                            ? " Pilih partner putri."
                            : currentGender === "female"
                            ? " Pilih partner putra."
                            : " Lengkapi jenis kelamin profil Anda terlebih dahulu."}
                        </p>
                      )}
                      {partners.length === 0 && !partnersLoading && (
                        <p className="text-[11px] text-amber-700">
                          Belum ada calon partner yang sesuai. Lengkapi profil pemain lain atau hubungi admin.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    Pendaftaran akan dikirim dengan status <strong>pending</strong>. Anda dapat
                    melihat statusnya di kartu kategori setelah admin memproses.
                    <span className="mt-2 block font-semibold text-slate-800">
                      Syarat lolos Main Event: minimal {IKA17_MIN_MATCHES} pertandingan selama
                      periode liga.
                    </span>
                  </div>
                </>
              )}

              {regError && (
                <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={closeModal} disabled={regLoading}>
                  {regSuccess ? "Tutup" : "Batal"}
                </Button>
                {!regSuccess && (
                  <Button
                    variant="tennis"
                    className="font-bold text-matchpoin-navy"
                    onClick={submitRegistration}
                    disabled={
                      regLoading ||
                      !eligibilityConfirmed ||
                      (ika17Category(selected.category)?.doubles && !partnerUserId)
                    }
                  >
                    {regLoading ? (
                      <>
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                        Memproses...
                      </>
                    ) : (
                      "Kirim Pendaftaran"
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
