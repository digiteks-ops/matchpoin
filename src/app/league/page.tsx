"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, Trophy, Users, CheckCircle2, AlertCircle, Loader2, MapPin, ListChecks } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface StandingRow {
  entryId: string;
  name: string;
  avatarUrl: string | null;
  province: string | null;
  cityName: string | null;
  points: number;
  wins: number;
  losses: number;
  matchesPlayed: number;
  gamesFor: number;
  gamesAgainst: number;
  gameDiff: number;
  rank: number;
  needsTiebreak: boolean;
}

interface ParticipantRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  province: string | null;
  cityName: string | null;
  joinedAt: string | null;
  status: string;
}

interface LeagueRow {
  id: string;
  name: string;
  category: string;
  season: string;
  start_date: string;
  end_date: string;
  status: string;
  max_participants: number;
}

const CATEGORIES = [
  { id: "mens_singles", label: "Men's Singles", desc: "Tunggal putra, 1 lawan 1." },
  { id: "womens_singles", label: "Women's Singles", desc: "Tunggal putri, 1 lawan 1." },
  { id: "mens_doubles", label: "Men's Doubles", desc: "Ganda putra, 2 lawan 2." },
  { id: "womens_doubles", label: "Women's Doubles", desc: "Ganda putri, 2 lawan 2." },
  { id: "mixed_doubles", label: "Mixed Doubles", desc: "Ganda campuran, 2 lawan 2." },
] as const;

type RegStep = 1 | 2 | 3;

const REG_OPEN = "2026-11-15";
const REG_CLOSE = "2026-12-31";

function todayJakarta(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Makassar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isRegistrationPeriodOpen(): boolean {
  const today = todayJakarta();
  return today >= REG_OPEN && today <= REG_CLOSE;
}

function isRegistrationClosed(): boolean {
  return todayJakarta() > REG_CLOSE;
}

function pickCity(rel: unknown): { name: string; province: string } | null {
  if (!rel || typeof rel !== "object") return null;
  const cities = (rel as { cities?: { name: string; province: string } | { name: string; province: string }[] | null }).cities;
  if (!cities) return null;
  return Array.isArray(cities) ? cities[0] ?? null : cities;
}

export default function LeaguePage() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [category, setCategory] = useState<string>("mens_singles");
  const [league, setLeague] = useState<LeagueRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [countdown, setCountdown] = useState({ days: 0, hours: 0, minutes: 0 });

  const [regOpen, setRegOpen] = useState(false);
  const [regStep, setRegStep] = useState<RegStep>(1);
  const [regCategory, setRegCategory] = useState<string>("mens_singles");
  const [regLeague, setRegLeague] = useState<LeagueRow | null>(null);
  const [regParticipantsCount, setRegParticipantsCount] = useState(0);
  const [regProfile, setRegProfile] = useState<{ name: string; city: string; province: string } | null>(null);
  const [regAlready, setRegAlready] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState(false);

  const [provinceFilter, setProvinceFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  const selectedCategoryMeta = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
  }, []);

  useEffect(() => {
    loadLeagueData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  useEffect(() => {
    if (!league?.end_date) return;
    const endDate = new Date(`${league.end_date}T23:59:59+07:00`);
    const tick = () => {
      const diff = endDate.getTime() - Date.now();
      if (diff <= 0) {
        setCountdown({ days: 0, hours: 0, minutes: 0 });
        return;
      }
      setCountdown({
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
      });
    };
    tick();
    const interval = setInterval(tick, 60000);
    return () => clearInterval(interval);
  }, [league?.end_date]);

  async function loadLeagueData() {
    setIsLoading(true);
    setProvinceFilter("all");
    setCityFilter("all");
    try {
      const supabase = createClient();

      // `tournaments` is the league container on this project; `leagues` was
      // never created, so the previous query always came back empty.
      const { data: leagueRow } = await supabase
        .from("tournaments")
        .select("id, name, category, season, start_date, end_date, status, max_participants, is_league")
        .eq("category", category)
        .eq("is_league", true)
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle();

      const lg = (leagueRow as LeagueRow | null) ?? null;
      setLeague(lg);

      if (!lg) {
        setParticipants([]);
        setStandings([]);
        return;
      }

const { data: partRows } = await supabase
        .from("tournament_participants")
        .select("entry_id, user_id, joined_at, status")
        .eq("tournament_id", lg.id)
        .neq("status", "rejected")
        .order("joined_at", { ascending: true });

      const entries = (partRows ?? []) as {
        entry_id: string;
        user_id: string;
        joined_at: string | null;
        status: string;
      }[];

      const userIds = Array.from(new Set(entries.map((e) => e.user_id)));
      const joinedMap = new Map<string, string | null>();
      const statusMap = new Map<string, string>();
      entries.forEach((e) => {
        joinedMap.set(e.user_id, e.joined_at ?? null);
        statusMap.set(e.user_id, e.status);
      });

      let participantList: ParticipantRow[] = [];
      const profileMap = new Map<string, any>();

      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("player_profiles")
          .select("user_id, display_name, users(city_id, cities(name, province))")
          .in("user_id", userIds);

        (profiles ?? []).forEach((p: any) => profileMap.set(p.user_id, p));

        participantList = userIds.map((uid) => {
          const p = profileMap.get(uid);
          const city = pickCity(p?.users ?? null);
          return {
            userId: uid,
            name: p?.display_name || "Pemain MATCHPOIN",
            avatarUrl: null,
            province: city?.province ?? null,
            cityName: city?.name ?? null,
            joinedAt: joinedMap.get(uid) ?? null,
            status: statusMap.get(uid) ?? "confirmed",
          };
        });
      }
      setParticipants(participantList);

      if (userIds.length === 0) {
        setStandings([]);
        return;
      }

      const entryUsers = new Map<string, string[]>();
      entries.forEach((e) => {
        const list = entryUsers.get(e.entry_id) ?? [];
        list.push(e.user_id);
        entryUsers.set(e.entry_id, list);
      });

      const labelFor = (entryId: string): string => {
        const names = (entryUsers.get(entryId) ?? [])
          .map((uid) => profileMap.get(uid)?.display_name)
          .filter(Boolean);
        return names.length > 0 ? names.join(" & ") : "Peserta";
      };

      // Standings are computed by `recompute_league_standings` in the database
      // (3 points per win, ranked by points -> game diff -> games won). The page
      // only reads them; duplicating the ranking here is what previously let the
      // client and the server disagree.
      const { data: standingRows } = await supabase
        .from("league_standings")
        .select("entry_id, position, played, won, lost, games_won, games_lost, game_diff, points, needs_tiebreak")
        .eq("tournament_id", lg.id)
        .order("position", { ascending: true, nullsFirst: false });

      const base = (
        entryId: string,
        position: number,
        s?: {
          played: number;
          won: number;
          lost: number;
          games_won: number;
          games_lost: number;
          game_diff: number;
          points: number;
          needs_tiebreak: boolean;
        }
      ): StandingRow => {
        const first = profileMap.get(entryUsers.get(entryId)?.[0] ?? "");
        const city = pickCity(first?.users ?? null);
        return {
          entryId,
          name: labelFor(entryId),
          avatarUrl: null,
          province: city?.province ?? null,
          cityName: city?.name ?? null,
          points: s?.points ?? 0,
          wins: s?.won ?? 0,
          losses: s?.lost ?? 0,
          matchesPlayed: s?.played ?? 0,
          gamesFor: s?.games_won ?? 0,
          gamesAgainst: s?.games_lost ?? 0,
          gameDiff: s?.game_diff ?? 0,
          rank: position,
          needsTiebreak: s?.needs_tiebreak ?? false,
        };
      };

      const standingList: StandingRow[] = (standingRows ?? []).map((r: any, i) =>
        base(r.entry_id, r.position ?? i + 1, r)
      );

      if (standingList.length === 0) {
        // Before the first result is verified the table is empty: show every
        // registered entry with zeroes instead of an empty panel.
        setStandings(
          Array.from(entryUsers.keys()).map((entryId, i) => base(entryId, i + 1))
        );
        return;
      }

      setStandings(standingList);
    } catch (err) {
      console.error("Error loading league:", err);
      setParticipants([]);
      setStandings([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function openRegistration() {
    setRegOpen(true);
    setRegStep(1);
    setRegCategory(category);
    setRegError(null);
    setRegSuccess(false);
    setRegLoading(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
      if (!user) {
        setRegProfile(null);
      } else {
        const { data: prof } = await supabase
          .from("player_profiles")
          .select("display_name, users(full_name, cities(name, province))")
          .eq("user_id", user.id)
          .maybeSingle();
        const city = pickCity((prof as any)?.users ?? null);
        setRegProfile({
          name: (prof as any)?.display_name || (prof as any)?.users?.full_name || "Pemain MATCHPOIN",
          city: city?.name ?? "",
          province: city?.province ?? "",
        });
      }
      await prepareRegCategory(category, user?.id ?? null);
    } finally {
      setRegLoading(false);
    }
  }

  async function prepareRegCategory(cat: string, uid: string | null) {
    setRegError(null);
    setRegLoading(true);
    try {
      const supabase = createClient();
      const { data: lg } = await supabase
        .from("tournaments")
        .select("id, name, category, season, start_date, end_date, status, max_participants, is_league")
        .eq("category", cat)
        .eq("is_league", true)
        .order("start_date", { ascending: true })
        .limit(1)
        .maybeSingle();
      const leagueRow = (lg as LeagueRow | null) ?? null;
      setRegLeague(leagueRow);
      if (!leagueRow) {
        setRegParticipantsCount(0);
        setRegAlready(false);
        return;
      }

      // Quota counts entries, not rows: a doubles pair shares one entry_id.
      // Include both confirmed and pending entries for quota/check
      const { data: partRows } = await supabase
        .from("tournament_participants")
        .select("entry_id, user_id, status")
        .eq("tournament_id", leagueRow.id);

      const entries = (partRows ?? []) as { entry_id: string; user_id: string; status: string }[];
      const activeEntries = entries.filter((e) => e.status !== 'rejected');
      setRegParticipantsCount(new Set(activeEntries.map((e) => e.entry_id)).size);

      setRegAlready(Boolean(uid) && activeEntries.some((e) => e.user_id === uid));
    } finally {
      setRegLoading(false);
    }
  }

  async function onRegCategoryChange(cat: string) {
    setRegCategory(cat);
    await prepareRegCategory(cat, currentUser?.id ?? null);
  }

  async function confirmRegistration() {
    if (!currentUser || !regLeague || regLoading) return;
    setRegError(null);
    setRegLoading(true);
    try {
      if (!isRegistrationPeriodOpen()) {
        setRegError(isRegistrationClosed() ? "Pendaftaran telah ditutup (batas 31 Desember 2026)." : "Pendaftaran dibuka mulai 15 November 2026.");
        return;
      }
      if (regLeague.status !== "registration_open") {
        setRegError("Pendaftaran kategori ini tidak tersedia.");
        return;
      }
      if (regParticipantsCount >= regLeague.max_participants) {
        setRegError("Kuota kategori ini sudah penuh.");
        return;
      }
      if (regAlready) {
        setRegError("Anda sudah terdaftar di kategori liga ini.");
        return;
      }

      // All rules (open window, one entry per player, quota, gender for mixed
      // doubles) are enforced by register_for_league() in the database.
      const res = await fetch("/api/tournaments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: regLeague.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };
      if (!res.ok || !data.success) {
        setRegError(data.message || "Pendaftaran gagal. Coba lagi.");
        return;
      }
      setRegSuccess(true);
      setRegStep(3);
      await loadLeagueData();
      await prepareRegCategory(regCategory, currentUser.id);
    } finally {
      setRegLoading(false);
    }
  }

  const provinces = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => { if (p.province) set.add(p.province); });
    return Array.from(set).sort();
  }, [participants]);

  const citiesForProvince = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => {
      if (provinceFilter !== "all" && p.province !== provinceFilter) return;
      if (p.cityName) set.add(p.cityName);
    });
    return Array.from(set).sort();
  }, [participants, provinceFilter]);

  useEffect(() => {
    if (cityFilter !== "all" && !citiesForProvince.includes(cityFilter)) setCityFilter("all");
  }, [citiesForProvince, cityFilter]);

  const filteredParticipants = useMemo(() => participants.filter((p) => {
    if (provinceFilter !== "all" && p.province !== provinceFilter) return false;
    if (cityFilter !== "all" && p.cityName !== cityFilter) return false;
    return true;
  }), [participants, provinceFilter, cityFilter]);

  const filteredStandings = useMemo(() => standings.filter((s) => {
    if (provinceFilter !== "all" && s.province !== provinceFilter) return false;
    if (cityFilter !== "all" && s.cityName !== cityFilter) return false;
    return true;
  }), [standings, provinceFilter, cityFilter]);

  const regCatMeta = CATEGORIES.find((c) => c.id === regCategory) ?? CATEGORIES[0];
  const regPeriodOpen = isRegistrationPeriodOpen();
  const regClosed = isRegistrationClosed();
  const regOpenOk = regLeague && regPeriodOpen && regLeague.status === "registration_open" && regParticipantsCount < regLeague.max_participants;

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>{league?.season || "Season 1 League"}</span>
            </div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">Liga Season 1 MATCHPOIN</h1>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Daftar per kategori, lihat peserta & klasemen. Pendaftaran: 15 Nov 2026 – 31 Des 2026 (WITA). Poin: Menang 3 · Kalah 0 · WO 8–0 (3 poin).
            </p>
            <Badge variant={regPeriodOpen ? "outline" : "secondary"} className={regPeriodOpen ? "border-emerald-200 text-emerald-700 bg-emerald-50 w-fit" : "w-fit"}>
              Status Pendaftaran: {regPeriodOpen ? "OPEN" : regClosed ? "CLOSED" : "Belum Dibuka"}
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button variant="tennis" className="text-matchpoin-navy font-bold" onClick={openRegistration}>
              Daftar Season 1 League
            </Button>
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
              <Clock className="w-5 h-5 text-matchpoin-navy mb-1 mx-auto" />
              <div className="text-xs font-bold text-matchpoin-navy">{countdown.days}H {countdown.hours}J {countdown.minutes}M</div>
              <div className="text-[10px] text-slate-500">sisa periode liga</div>
            </div>
          </div>
        </div>

        {regOpen && (
          <Card className="border-matchpoin-navy/20 bg-white">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-base">Pendaftaran Liga</CardTitle>
                <button className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setRegOpen(false)}>Tutup</button>
              </div>
              <CardDescription className="text-xs">Langkah {regStep} dari 3 — Pilih kategori, konfirmasi, selesai.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              {regLoading && <div className="flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Memuat...</div>}
              {regError && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" /><span>{regError}</span></div>}

              {regStep === 1 && (
                <div className="space-y-3">
                  <p className="font-semibold text-slate-700">Langkah 1 — Pilih Kategori Liga</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CATEGORIES.map((c) => (
                      <button key={c.id} onClick={() => onRegCategoryChange(c.id)}
                        className={`text-left p-3 rounded-lg border transition-all ${regCategory === c.id ? "border-matchpoin-navy bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <div className="font-semibold text-slate-800">{c.label}</div>
                        <div className="text-[11px] text-slate-500">{c.desc}</div>
                      </button>
                    ))}
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-800">{regCatMeta.label} — {regLeague?.season ?? "-"}</div>
                    <div>Status Pendaftaran: <Badge variant={regOpenOk ? "outline" : "secondary"} className="text-[10px]">{regPeriodOpen ? "OPEN" : regClosed ? "CLOSED" : "Belum Dibuka"}</Badge></div>
                    <div>Kuota: {regParticipantsCount}/{regLeague?.max_participants ?? 12} peserta · {regOpenOk ? "Dapat mendaftar" : "Tidak dapat mendaftar (periode/kuota/status)"}</div>
                    {regAlready && <div className="text-emerald-700 font-semibold">Anda sudah terdaftar di kategori ini.</div>}
                    {!regLeague && <div className="text-amber-700">Data liga kategori ini belum tersedia.</div>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRegOpen(false)}>Batal</Button>
                    <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold" disabled={!currentUser || !regOpenOk || regAlready || regLoading}
                      onClick={() => { setRegError(null); setRegStep(2); }}>
                      Lanjut Konfirmasi
                    </Button>
                  </div>
                  {!currentUser && <p className="text-amber-700">Masuk untuk mendaftar liga. <Link href="/auth/login?redirectTo=/league" className="underline font-semibold">Masuk</Link></p>}
                </div>
              )}

              {regStep === 2 && (
                <div className="space-y-3">
                  <p className="font-semibold text-slate-700">Langkah 2 — Konfirmasi Pendaftaran</p>
                  <div className="p-3 rounded-lg border border-slate-200 space-y-1">
                    <div><span className="text-slate-500">Kategori:</span> <strong>{regCatMeta.label}</strong></div>
                    <div><span className="text-slate-500">Liga:</span> <strong>{regLeague?.name} {regLeague?.season}</strong></div>
                    <div><span className="text-slate-500">Nama:</span> <strong>{regProfile?.name ?? "-"}</strong></div>
                    <div><span className="text-slate-500">Lokasi:</span> <strong>{[regProfile?.city, regProfile?.province].filter(Boolean).join(", ") || "Belum diisi di profil"}</strong></div>
                    <div><span className="text-slate-500">Kuota saat ini:</span> <strong>{regParticipantsCount}/{regLeague?.max_participants ?? 12}</strong></div>
                  </div>
                  <p className="text-slate-500">Pastikan data profil benar. Satu pemain hanya dapat terdaftar 1x per kategori liga.</p>
                  <div className="flex justify-between gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRegStep(1)} disabled={regLoading}>Kembali</Button>
                    <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold" onClick={confirmRegistration} disabled={regLoading || !currentUser || regAlready}>
                      {regLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Mendaftarkan...</> : "Konfirmasi Pendaftaran"}
                    </Button>
                  </div>
                </div>
              )}

{regStep === 3 && regSuccess && (
                <div className="space-y-3 text-center py-2">
                  <Clock className="w-10 h-10 text-amber-600 mx-auto" />
                  <p className="font-semibold text-slate-800">Pendaftaran Diterima</p>
                  <p className="text-slate-600">Pendaftaran Anda untuk <strong>{regCatMeta.label}</strong> telah diterima dan <strong>menunggu persetujuan Super Admin</strong>.</p>
                  <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    Status: Menunggu Persetujuan. Anda akan mendapat notifikasi setelah Super Admin meninjau pendaftaran.
                  </p>
                  <div className="flex justify-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setCategory(regCategory); setRegOpen(false); }}>Lihat Klasemen Kategori</Button>
                    <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold" onClick={() => setRegOpen(false)}>Selesai</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex gap-2 overflow-x-auto pb-2">
          {CATEGORIES.map((c) => (
            <button key={c.id} onClick={() => setCategory(c.id)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all whitespace-nowrap ${category === c.id ? "bg-matchpoin-navy text-white border-matchpoin-navy" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}>
              {c.label}
            </button>
          ))}
        </div>

        <Card className="border-slate-200">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="font-bold text-slate-800">{selectedCategoryMeta.label} · {league?.season ?? "-"}</div>
              <div className="text-slate-500">Status liga: <strong className="capitalize">{league?.status ?? "tidak tersedia"}</strong> · Peserta terdaftar: <strong>{participants.length}</strong>/{league?.max_participants ?? 12}</div>
              <div className="text-slate-500">Periode liga: {league?.start_date ?? "-"} s/d {league?.end_date ?? "-"}</div>
              <div className="text-slate-500">Periode pendaftaran: 15 Nov 2026 – 31 Des 2026 (WITA)</div>
            </div>
            <Badge variant={regPeriodOpen ? "outline" : "secondary"} className="w-fit">
              {regPeriodOpen ? "Pendaftaran OPEN" : regClosed ? "Pendaftaran CLOSED" : "Pendaftaran belum dibuka"}
            </Badge>
          </CardContent>
        </Card>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row gap-3">
          <select value={provinceFilter} onChange={(e) => { setProvinceFilter(e.target.value); setCityFilter("all"); }}
            className="h-10 w-full sm:w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            <option value="all">Semua Provinsi</option>
            {provinces.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}
            className="h-10 w-full sm:w-56 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
            <option value="all">Semua Kota/Kabupaten</option>
            {citiesForProvince.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          {(provinceFilter !== "all" || cityFilter !== "all") && (
            <Button variant="outline" size="sm" onClick={() => { setProvinceFilter("all"); setCityFilter("all"); }}>Reset Filter Lokasi</Button>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white border border-slate-200 animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="border-slate-200">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><Users className="w-4 h-4" /> Peserta Terdaftar ({filteredParticipants.length})</CardTitle>
                <CardDescription className="text-xs">Hanya pemain terdaftar di kategori {selectedCategoryMeta.label}.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredParticipants.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">Belum ada peserta terdaftar {provinceFilter !== "all" || cityFilter !== "all" ? "untuk filter lokasi ini." : "di kategori ini."}</p>
                ) : (
                  <div className="divide-y divide-slate-100">
{filteredParticipants.map((p) => (
                        <div key={p.userId} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-800 truncate">{p.name}</div>
                            <div className="text-slate-500 flex items-center gap-1"><MapPin className="w-3 h-3" /> {[p.cityName, p.province].filter(Boolean).join(", ") || "Lokasi belum diisi"}</div>
                          </div>
                          <Badge
                            variant={
                              p.status === "confirmed"
                                ? "success"
                                : p.status === "pending"
                                ? "secondary"
                                : p.status === "rejected"
                                ? "destructive"
                                : "outline"
                            }
                            className="text-[10px] shrink-0"
                          >
                            {p.status === "confirmed"
                              ? "Diterima"
                              : p.status === "pending"
                              ? "Menunggu Persetujuan"
                              : p.status === "rejected"
                              ? "Ditolak"
                              : p.status}
                          </Badge>
                        </div>
                      ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 lg:col-span-1">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2"><ListChecks className="w-4 h-4" /> Klasemen Kategori</CardTitle>
                <CardDescription className="text-xs">Peserta terdaftar + poin dari hasil pertandingan terverifikasi (kategori {selectedCategoryMeta.label}).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredStandings.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">Belum ada data klasemen untuk ditampilkan.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredStandings.map((s) => (
                      <div key={s.entryId} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-xs">
                        <div className="col-span-1 font-bold text-slate-500">{s.rank}</div>
                        <div className="col-span-6 min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{s.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{[s.cityName, s.province].filter(Boolean).join(", ") || "Lokasi belum diisi"}</div>
                        </div>
                        <div className="col-span-2 text-center">
                          <div className="font-extrabold text-matchpoin-navy">{s.points}</div>
                          <div className="text-[10px] text-slate-400">poin</div>
                        </div>
                        <div className="col-span-3 text-right text-[10px] text-slate-600">
                          <div><span className="text-emerald-600 font-bold">{s.wins}</span>W · <span className="text-rose-600 font-bold">{s.losses}</span>L · {s.matchesPlayed}M</div>
                          <div>GD {s.gameDiff >= 0 ? "+" : ""}{s.gameDiff}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-start gap-3 text-xs text-slate-500">
          <Trophy className="w-4 h-4 text-matchpoin-tennis shrink-0 mt-0.5" />
          <p>
            Poin: Menang 3 · Kalah 0 · WO menang 3 (8–0) · WO kalah 0 (0–8). Klasemen dipisah per kategori, hanya peserta terdaftar & hasil terverifikasi (confirmed). Urutan: poin, selisih game, total game menang, jumlah menang.
          </p>
        </div>
      </div>
    </div>
  );
}
