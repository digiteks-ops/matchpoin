"use client";

import React, { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Trophy, Users, Calendar, MapPin, AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface TournamentRow {
  id: string;
  name: string;
  category: string;
  season: string;
  start_date: string;
  end_date: string;
  status: string;
  max_participants: number;
}

interface ParticipantRow {
  userId: string;
  name: string;
}

const CATEGORIES = [
  { id: "mens_singles", label: "Men's Singles" },
  { id: "mens_doubles", label: "Men's Doubles" },
  { id: "mixed_doubles", label: "Mixed Doubles" },
  { id: "womens_doubles", label: "Women's Doubles" },
] as const;

function categoryLabel(id: string): string {
  const c = CATEGORIES.find((x) => x.id === id);
  return c ? c.label : id;
}

export default function TournamentsPage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [registeredIds, setRegisteredIds] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTournament, setSelectedTournament] = useState<TournamentRow | null>(null);

  // Modal registration state
  const [regOpen, setRegOpen] = useState(false);
  const [partnerUserId, setPartnerUserId] = useState("");
  const [partnerOptions, setPartnerOptions] = useState<{ id: string; name: string }[]>([]);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
  }, []);

  const loadTournaments = useCallback(async () => {
    setIsLoading(true);
    try {
      const supabase = createClient();
      // `tournaments` is the league container; `league_participants` was never
      // created on this project, so the old query always returned empty.
      const { data: rows, error } = await supabase
        .from("tournaments")
        .select("id, name, category, season, start_date, end_date, status, max_participants, is_league")
        .order("start_date", { ascending: true });

      if (error || !rows) {
        setTournaments([]);
        return;
      }

      const list: TournamentRow[] = rows
        .filter((r: any) => r.is_league !== false)
        .map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.category || "mens_singles",
          season: r.season || "Q1 2027",
          start_date: r.start_date,
          end_date: r.end_date,
          status: r.status,
          max_participants: r.max_participants || 12,
        }));

      setTournaments(list);

      const ids = list.map((t) => t.id);
      if (ids.length === 0) return;

      const { data: partRows } = await supabase
        .from("tournament_participants")
        .select("tournament_id, user_id, entry_id")
        .in("tournament_id", ids);

      const countMap: Record<string, number> = {};
      const regMap: Record<string, boolean> = {};
      // One competition entry == one quota slot: a doubles team is two rows
      // sharing an entry_id and must only consume a single slot.
      const entrySets: Record<string, Set<string>> = {};
      ids.forEach((id) => {
        countMap[id] = 0;
        regMap[id] = false;
        entrySets[id] = new Set<string>();
      });

      (partRows ?? []).forEach((p: any) => {
        const bucket = entrySets[p.tournament_id];
        if (bucket) bucket.add(p.entry_id ?? p.user_id);
        if (currentUser && p.user_id === currentUser.id) {
          regMap[p.tournament_id] = true;
        }
      });

      Object.keys(entrySets).forEach((id) => {
        countMap[id] = entrySets[id].size;
      });

      setCounts(countMap);
      setRegisteredIds(regMap);
    } catch (err) {
      console.error("Error loading tournaments:", err);
    } finally {
      setIsLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    loadTournaments();
  }, [loadTournaments]);

  async function openRegistration(t: TournamentRow) {
    setSelectedTournament(t);
    setRegError(null);
    setRegSuccess(null);
    setPartnerUserId("");
    setRegOpen(true);
    setRegLoading(true);

    try {
      const supabase = createClient();

      // Load existing participants
      const { data: parts } = await supabase
        .from("tournament_participants")
        .select("user_id")
        .eq("tournament_id", t.id);

      const uids = (parts ?? []).map((p: any) => p.user_id);
      if (uids.length > 0) {
        const { data: usersData } = await supabase
          .from("users")
          .select("id, full_name")
          .in("id", uids);
        setParticipants(
          (usersData ?? []).map((u: any) => ({
            userId: u.id,
            name: u.full_name || "Pemain MATCHPOIN",
          }))
        );
      } else {
        setParticipants([]);
      }

      // If doubles, load available partners
      if (t.category.includes("doubles")) {
        const { data: availablePlayers } = await supabase
          .from("player_profiles")
          .select("user_id, display_name")
          .eq("is_profile_public", true)
          .neq("user_id", currentUser?.id ?? "")
          .limit(100);

        setPartnerOptions(
          (availablePlayers ?? []).map((p: any) => ({
            id: p.user_id,
            name: p.display_name || "Pemain MATCHPOIN",
          }))
        );
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
      const res = await fetch("/api/tournaments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: selectedTournament.id,
          partnerUserId: selectedTournament.category.includes("doubles") ? partnerUserId : undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setRegError(data.message || "Pendaftaran gagal.");
        return;
      }

      setRegSuccess(data.message);
      setCounts((prev) => ({
        ...prev,
        [selectedTournament.id]: (prev[selectedTournament.id] || 0) + 1,
      }));
      setRegisteredIds((prev) => ({
        ...prev,
        [selectedTournament.id]: true,
      }));
      loadTournaments();
    } catch {
      setRegError("Terjadi kesalahan jaringan.");
    } finally {
      setRegLoading(false);
    }
  }

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8 max-w-5xl">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Kompetisi Resmi</span>
            </div>
            <div className="flex items-baseline gap-2">
              <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">
                MATCHPOIN League Q1 2027
              </h1>
              <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-800 border-emerald-300 font-bold">
                Pendaftaran Buka
              </Badge>
            </div>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Format Open Challenge: Host tantangan, jadwalkan pertandingan seimbang, dan tingkatkan rating resmi Anda.
            </p>
          </div>
        </div>

        {/* Modal Registration */}
        {regOpen && selectedTournament && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
            <Card className="border-slate-200 max-w-lg w-full shadow-2xl">
              <CardHeader className="pb-3 border-b border-slate-100">
                <CardTitle className="text-lg">{selectedTournament.name}</CardTitle>
                <CardDescription className="text-xs">
                  {categoryLabel(selectedTournament.category)} · Quota: {selectedTournament.max_participants} peserta/tim
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {regError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                    <span>{regError}</span>
                  </div>
                )}
                {regSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2.5 text-xs text-emerald-800">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
                    <span>{regSuccess}</span>
                  </div>
                )}

                {selectedTournament.category.includes("doubles") && !regSuccess && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 block">Pilih Partner Tim:</label>
                    <select
                      value={partnerUserId}
                      onChange={(e) => setPartnerUserId(e.target.value)}
                      disabled={regLoading}
                      className="w-full h-10 px-3 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:border-matchpoin-tennis"
                    >
                      <option value="">-- Pilih Partner --</option>
                      {partnerOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500">
                      Partner harus terdaftar di MATCHPOIN dan belum terdaftar di kategori yang sama.
                    </p>
                  </div>
                )}

                <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <p><strong>Periode Pertandingan:</strong> 1 Januari – 31 Maret 2027</p>
                  <p><strong>Aturan:</strong> Race to 8 – No Deuce</p>
                  <p><strong>Anti-Rematch:</strong> Maksimal 1x bertemu lawan yang sama per musim</p>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRegOpen(false)}
                    disabled={regLoading}
                  >
                    Tutup
                  </Button>
                  {!regSuccess && (
                    <Button
                      type="button"
                      variant="tennis"
                      size="sm"
                      className="text-matchpoin-navy font-bold"
disabled={
                        regLoading ||
                        (selectedTournament.category.includes("doubles") && !partnerUserId)
                      }
                      onClick={confirmRegistration}
                    >
                      {regLoading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                          Memproses...
                        </>
                      ) : (
                        "Daftar Sekarang"
                      )}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Categories Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-5">
          {isLoading ? (
            <div className="col-span-full text-center py-12 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-matchpoin-navy" />
              <span>Memuat data liga...</span>
            </div>
          ) : (
            tournaments.map((t) => {
              const count = counts[t.id] ?? 0;
              const isMine = Boolean(registeredIds[t.id]);
              const isFull = count >= t.max_participants;

              return (
                <Card key={t.id} className="border-slate-200 hover:shadow-md transition-shadow group">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-base font-bold text-slate-900">{t.name}</CardTitle>
                      <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300 font-bold">
                        Buka
                      </Badge>
                    </div>
                    <CardDescription className="text-xs">
                      {categoryLabel(t.category)} · Season {t.season}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Kompetisi: 1 Jan – 31 Mar 2027</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        <strong>{count}</strong> / {t.max_participants} {t.category.includes("doubles") ? "tim" : "peserta"} terdaftar
                      </span>
                    </div>

                    <div className="pt-2">
                      {!currentUser ? (
                        <Link href="/login?redirectTo=/tournaments">
                          <Button variant="outline" size="sm" className="w-full text-xs">
                            Masuk untuk Mendaftar
                          </Button>
                        </Link>
                      ) : isMine ? (
                        <Button variant="outline" size="sm" className="w-full text-xs text-emerald-700 border-emerald-200 bg-emerald-50" disabled>
                          Sudah Terdaftar
                        </Button>
                      ) : isFull ? (
                        <Button variant="secondary" size="sm" className="w-full text-xs" disabled>
                          Kuota Penuh (12/12)
                        </Button>
                      ) : (
                        <Button
                          variant="tennis"
                          size="sm"
                          className="w-full text-xs text-matchpoin-navy font-bold"
                          onClick={() => openRegistration(t)}
                        >
                          Daftar Kategori Ini
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 text-xs text-slate-600">
          <p className="font-bold text-slate-800 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-matchpoin-tennis fill-matchpoin-tennis" />
            Ketentuan MATCHPOIN League Q1 2027
          </p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>Periode pendaftaran dibuka: <strong>15 November – 31 Desember 2026</strong>.</li>
            <li>Setiap pemain hanya dapat mendaftar 1 kali per kategori (Tunggal, Ganda Putra, Ganda Campuran, Ganda Putri).</li>
            <li>Ganda Campuran wajib 1 pemain putra dan 1 pemain putri.</li>
            <li>Semua pertandingan menggunakan format resmi <strong>Race to 8 – No Deuce</strong>.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
