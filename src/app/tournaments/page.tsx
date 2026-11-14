"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, Trophy, Users, Calendar, MapPin, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface TournamentRow {
  id: string;
  name: string;
  category: string;
  season: string;
  registration_start: string;
  registration_end: string;
  event_start_date: string;
  event_end_date: string;
  status: "upcoming" | "active" | "finished";
  max_players: number;
}

interface ParticipantRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  joinedAt: string | null;
}

const CATEGORIES = [
  { id: "mens_singles", label: "Men's Singles" },
  { id: "womens_singles", label: "Women's Singles" },
  { id: "mens_doubles", label: "Men's Doubles" },
  { id: "womens_doubles", label: "Women's Doubles" },
  { id: "mixed_doubles", label: "Mixed Doubles" },
] as const;

function categoryLabel(id: string): string {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.label : id;
}

function isRegistrationOpen(regStart: string, regEnd: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = new Date(regStart);
  start.setHours(0, 0, 0, 0);
  const end = new Date(regEnd);
  end.setHours(0, 0, 0, 0);
  return today >= start && today <= end;
}

export default function TournamentsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [regOpen, setRegOpen] = useState(false);
  const [selectedTournament, setSelectedTournament] = useState<TournamentRow | null>(null);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState(false);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [participantsCount, setParticipantsCount] = useState(0);
  const [alreadyRegistered, setAlreadyRegistered] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
  }, []);

  useEffect(() => {
    loadTournaments();
  }, []);

  async function loadTournaments() {
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { data: rows } = await supabase
        .from("tournaments")
        .select("id, name, category, season, registration_start, registration_end, event_start_date, event_end_date, status, max_players")
        .order("registration_start", { ascending: true });

      setTournaments((rows ?? []) as unknown as TournamentRow[]);
    } catch (err) {
      console.error("Error loading tournaments:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function openRegistration(t: TournamentRow) {
    setSelectedTournament(t);
    setRegError(null);
    setRegSuccess(false);
    setRegOpen(true);
    setRegLoading(true);
    try {
      const supabase = createClient();
      const { count } = await supabase
        .from("tournament_participants")
        .select("id", { count: "exact", head: true })
        .eq("tournament_id", t.id);
      setParticipantsCount(count ?? 0);

      if (currentUser) {
        const { data: existing } = await supabase
          .from("tournament_participants")
          .select("id")
          .eq("tournament_id", t.id)
          .eq("user_id", currentUser.id)
          .maybeSingle();
        setAlreadyRegistered(Boolean(existing));
      } else {
        setAlreadyRegistered(false);
      }

      const { data: partRows } = await supabase
        .from("tournament_participants")
        .select("user_id, joined_at")
        .eq("tournament_id", t.id)
        .order("joined_at", { ascending: true });

      const userIds = Array.from(new Set((partRows ?? []).map((p: any) => p.user_id as string)));
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("player_profiles")
          .select("user_id, display_name")
          .in("user_id", userIds);
        const profileMap = new Map<string, any>();
        (profiles ?? []).forEach((p: any) => profileMap.set(p.user_id, p));
        setParticipants(
          userIds.map((uid) => ({
            userId: uid,
            name: profileMap.get(uid)?.display_name || "Pemain MATCHPOIN",
            avatarUrl: null,
            joinedAt: null,
          }))
        );
      } else {
        setParticipants([]);
      }
    } finally {
      setRegLoading(false);
    }
  }

  async function confirmRegistration() {
    if (!currentUser || !selectedTournament) return;
    setRegError(null);
    setRegLoading(true);
    try {
      const t = selectedTournament;

      // Check registration window
      if (!isRegistrationOpen(t.registration_start, t.registration_end)) {
        setRegError("Pendaftaran turnamen ini sudah ditutup di luar jadwal pendaftaran.");
        return;
      }

      if (t.status !== "upcoming" && t.status !== "active") {
        setRegError("Pendaftaran untuk turnamen ini sudah ditutup.");
        return;
      }
      if (participantsCount >= t.max_players) {
        setRegError("Kuota peserta turnamen ini sudah penuh.");
        return;
      }
      if (alreadyRegistered) {
        setRegError("Anda sudah terdaftar di turnamen ini.");
        return;
      }

      const supabase = createClient();
      const { error } = await supabase
        .from("tournament_participants")
        .insert({ tournament_id: t.id, user_id: currentUser.id });

      if (error) {
        if (error.code === "23505") {
          setRegError("Anda sudah terdaftar di turnamen ini.");
        } else {
          setRegError(error.message || "Pendaftaran gagal. Coba lagi.");
        }
        return;
      }

      setRegSuccess(true);
      setParticipantsCount(participantsCount + 1);
      setAlreadyRegistered(true);
      await loadTournaments();
    } finally {
      setRegLoading(false);
    }
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const filtered = useMemo(() => {
    return tournaments.filter((t) => {
      const regStart = new Date(t.registration_start);
      regStart.setHours(0, 0, 0, 0);
      const regEnd = new Date(t.registration_end);
      regEnd.setHours(0, 0, 0, 0);
      return now >= regStart && now <= regEnd;
    });
  }, [tournaments, now]);

  const statusLabel = (s: string) => {
    if (s === "upcoming") return "Akan Datang";
    if (s === "active") return "Berlangsung";
    return "Selesai";
  };

  const statusVariant = (s: string) => {
    if (s === "active") return "tennis";
    if (s === "upcoming") return "outline";
    return "secondary";
  };

  if (isLoading) {
    return (
      <div className="flex-1 bg-slate-50 py-8 md:py-12 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-matchpoin-navy" />
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Turnamen MATCHPOIN</span>
            </div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">Daftar Turnamen</h1>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Pendaftaran turnamen terbuka dari 13 November hingga 31 Desember 2026. Daftar per kategori dan bantu timmu meraih kemenangan.
            </p>
          </div>
          {!currentUser ? (
            <Link href="/login?redirectTo=/tournaments">
              <Button variant="tennis" className="text-matchpoin-navy font-bold">
                Masuk untuk Mendaftar
              </Button>
            </Link>
          ) : null}
        </div>

        {regOpen && selectedTournament && (
          <Card className="border-matchpoin-navy/20 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Daftar Turnamen</CardTitle>
                <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setRegOpen(false)}>
                  Tutup
                </button>
              </div>
              <CardDescription className="text-xs">Daftar diri sebagai peserta turnamen.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {regLoading && (
                <div className="flex items-center gap-2 text-slate-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> Memuat...
                </div>
              )}
              {regError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{regError}</span>
                </div>
              )}
              {regSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-700 flex gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>Berhasil terdaftar di turnamen {selectedTournament.name}!</span>
                </div>
              )}

              <div className="p-3 rounded-lg border border-slate-200 space-y-1">
                <div><span className="text-slate-500 text-[10px] uppercase">Turnamen:</span> <strong className="text-slate-800">{selectedTournament.name}</strong></div>
                <div><span className="text-slate-500 text-[10px] uppercase">Kategori:</span> <strong className="text-slate-800">{categoryLabel(selectedTournament.category)}</strong></div>
                <div><span className="text-slate-500 text-[10px] uppercase">Musim:</span> <strong className="text-slate-800">{selectedTournament.season}</strong></div>
                <div><span className="text-slate-500 text-[10px] uppercase">Status:</span> <Badge variant={statusVariant(selectedTournament.status)} className="text-[10px]">{statusLabel(selectedTournament.status)}</Badge></div>
                <div><span className="text-slate-500 text-[10px] uppercase">Kuota:</span> <strong className="text-slate-800">{participantsCount}/{selectedTournament.max_players}</strong></div>
                <div><span className="text-slate-500 text-[10px] uppercase">Pendaftaran:</span> <strong className="text-slate-800">{new Date(selectedTournament.registration_start).toLocaleDateString("id-ID")} – {new Date(selectedTournament.registration_end).toLocaleDateString("id-ID")}</strong></div>
              </div>

              {!currentUser && (
                <p className="text-amber-700 text-xs">Silakan masuk ke akun untuk mendaftar turnamen.</p>
              )}

              <div className="flex justify-between gap-2">
                <Button variant="outline" size="sm" onClick={() => setRegOpen(false)} disabled={regLoading}>
                  Batal
                </Button>
                <Button
                  variant="tennis"
                  size="sm"
                  className="text-matchpoin-navy font-bold"
                  onClick={confirmRegistration}
                  disabled={
                    !currentUser ||
                    regLoading ||
                    alreadyRegistered ||
                    participantsCount >= selectedTournament.max_players ||
                    !isRegistrationOpen(selectedTournament.registration_start, selectedTournament.registration_end)
                  }
                >
                  {regLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Mendaftarkan...</>
                  ) : (
                    "Konfirmasi Pendaftaran"
                  )}
                </Button>
              </div>

              {alreadyRegistered && !regSuccess && (
                <p className="text-emerald-700 font-semibold text-xs mt-2">Anda sudah terdaftar di turnamen ini.</p>
              )}
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.length === 0 ? (
            <div className="col-span-full">
              <EmptyStateTournaments />
            </div>
          ) : (
            filtered.map((t) => {
              const regOpenNow = isRegistrationOpen(t.registration_start, t.registration_end);
              const isFull = participantsCount >= t.max_players;
              const isMine = alreadyRegistered && selectedTournament?.id === t.id;
              return (
                <Card key={t.id} className="border-slate-200 hover:shadow-md transition-shadow group">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base font-semibold">{t.name}</CardTitle>
                      <Badge variant={statusVariant(t.status)} className="text-[10px]">
                        {statusLabel(t.status)}
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {categoryLabel(t.category)} · {t.season}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <Calendar className="w-3 h-3" />
                      <span>{new Date(t.event_start_date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                      <MapPin className="w-3 h-3" />
                      <span>{t.max_players} kuota peserta</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Users className="w-3 h-3" />
                      <span>{participantsCount}/{t.max_players} terdaftar</span>
                    </div>

                    <div className="pt-2">
                      {!currentUser ? (
                        <Link href="/login?redirectTo=/tournaments">
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            Masuk untuk Daftar
                          </Button>
                        </Link>
                      ) : isMine ? (
                        <Button variant="outline" size="sm" className="w-full text-xs text-emerald-700 border-emerald-200 bg-emerald-50 disabled">
                          Sudah Terdaftar
                        </Button>
                      ) : !regOpenNow ? (
                        <Button variant="secondary" size="sm" className="w-full text-xs disabled">
                          Pendaftaran Ditutup
                        </Button>
                      ) : isFull ? (
                        <Button variant="secondary" size="sm" className="w-full text-xs disabled">
                          Kuota Penuh
                        </Button>
                      ) : (
                        <Button variant="tennis" size="sm" className="w-full text-xs text-matchpoin-navy font-bold" onClick={() => openRegistration(t)}>
                          Daftar Sekarang
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-500">
          <Trophy className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <p>
            Pendaftaran turnamen terbuka dari 13 November hingga 31 Desember 2026. Setiap pemain hanya dapat terdaftar 1x per kategori turnamen. Pendaftaran otomatis ditutup setelah batas waktu pendaftaran lewat.
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyStateTournaments() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-4" />
      <h3 className="text-lg font-bold text-slate-900">Belum Ada Turnamen Tersedia</h3>
      <p className="text-slate-500 text-sm max-w-xs mx-auto">
        Saat ini belum ada turnamen yang sedang buka untuk pendaftaran. Kembali nanti.
      </p>
    </div>
  );
}
