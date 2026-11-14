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
  userId: string;
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
}

interface ParticipantRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  province: string | null;
  cityName: string | null;
  joinedAt: string | null;
}

interface LeagueRow {
  id: string;
  name: string;
  category: string;
  season: string;
  start_date: string;
  end_date: string;
  status: "upcoming" | "active" | "finished";
  max_players: number;
}

const CATEGORIES = [
  { id: "mens_singles", label: "Men's Singles", desc: "Tunggal putra, 1 lawan 1." },
  { id: "womens_singles", label: "Women's Singles", desc: "Tunggal putri, 1 lawan 1." },
  { id: "mens_doubles", label: "Men's Doubles", desc: "Ganda putra, 2 lawan 2." },
  { id: "womens_doubles", label: "Women's Doubles", desc: "Ganda putri, 2 lawan 2." },
  { id: "mixed_doubles", label: "Mixed Doubles", desc: "Ganda campuran, 2 lawan 2." },
] as const;

type RegStep = 1 | 2 | 3;

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

      const { data: leagueRow } = await supabase
        .from("leagues")
        .select("id, name, category, season, start_date, end_date, status, max_players")
        .eq("category", category)
        .eq("season", "Q1 2027")
        .maybeSingle();

      const lg = (leagueRow as LeagueRow | null) ?? null;
      setLeague(lg);

      if (!lg) {
        setParticipants([]);
        setStandings([]);
        return;
      }

      const { data: partRows } = await supabase
        .from("league_participants")
        .select("user_id, joined_at")
        .eq("league_id", lg.id)
        .order("joined_at", { ascending: true });

      const userIds = Array.from(new Set((partRows ?? []).map((p: any) => p.user_id as string)));
      const joinedMap = new Map<string, string | null>();
      (partRows ?? []).forEach((p: any) => joinedMap.set(p.user_id, p.joined_at ?? null));

      let participantList: ParticipantRow[] = [];
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from("player_profiles")
          .select("user_id, display_name, users(city_id, cities(name, province))")
          .in("user_id", userIds);

        const profileMap = new Map<string, any>();
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
          };
        });
      }
      setParticipants(participantList);

      if (userIds.length === 0) {
        setStandings([]);
        return;
      }

      const participantSet = new Set(userIds);
      const { data: results } = await supabase
        .from("match_results")
        .select("match_id, team1_score, team2_score, winner_team")
        .eq("status", "confirmed");

      const matchIds = Array.from(new Set((results ?? []).map((r: any) => r.match_id as string)));
      if (matchIds.length === 0) {
        setStandings(participantList.map((p, i) => ({
          ...p, points: 0, wins: 0, losses: 0, matchesPlayed: 0, gamesFor: 0, gamesAgainst: 0, gameDiff: 0, rank: i + 1,
        })));
        return;
      }

      const [{ data: matchRows }, { data: mpRows }] = await Promise.all([
        supabase.from("matches").select("id, metadata").in("id", matchIds),
        supabase.from("match_participants").select("match_id, user_id, team").in("match_id", matchIds),
      ]);

      const categoryMatchIds = new Set<string>();
      (matchRows ?? []).forEach((m: any) => {
        const meta = m.metadata && typeof m.metadata === "object" ? m.metadata : {};
        const c = (meta as any).category ?? "mens_singles";
        if (c === category) categoryMatchIds.add(m.id);
      });

      const teamsByMatch: Record<string, { t1: string[]; t2: string[] }> = {};
      (mpRows ?? []).forEach((p: any) => {
        if (!categoryMatchIds.has(p.match_id)) return;
        if (!participantSet.has(p.user_id)) return;
        if (!teamsByMatch[p.match_id]) teamsByMatch[p.match_id] = { t1: [], t2: [] };
        if (p.team === 1) teamsByMatch[p.match_id].t1.push(p.user_id);
        if (p.team === 2) teamsByMatch[p.match_id].t2.push(p.user_id);
      });

      const stats = new Map<string, { points: number; wins: number; losses: number; mp: number; gf: number; ga: number }>();
      userIds.forEach((uid) => stats.set(uid, { points: 0, wins: 0, losses: 0, mp: 0, gf: 0, ga: 0 }));

      (results ?? []).forEach((r: any) => {
        if (!categoryMatchIds.has(r.match_id)) return;
        const teams = teamsByMatch[r.match_id];
        if (!teams) return;
        const t1s = r.team1_score ?? 0;
        const t2s = r.team2_score ?? 0;
        const t1Won = r.winner_team === 1;
        const t2Won = r.winner_team === 2;
        teams.t1.forEach((uid) => {
          const s = stats.get(uid); if (!s) return;
          s.mp += 1; s.gf += t1s; s.ga += t2s;
          if (t1Won) { s.wins += 1; s.points += 3; } else if (t2Won) { s.losses += 1; }
        });
        teams.t2.forEach((uid) => {
          const s = stats.get(uid); if (!s) return;
          s.mp += 1; s.gf += t2s; s.ga += t1s;
          if (t2Won) { s.wins += 1; s.points += 3; } else if (t1Won) { s.losses += 1; }
        });
      });

      const rows: StandingRow[] = participantList.map((p) => {
        const s = stats.get(p.userId)!;
        return {
          userId: p.userId,
          name: p.name,
          avatarUrl: p.avatarUrl,
          province: p.province,
          cityName: p.cityName,
          points: s.points,
          wins: s.wins,
          losses: s.losses,
          matchesPlayed: s.mp,
          gamesFor: s.gf,
          gamesAgainst: s.ga,
          gameDiff: s.gf - s.ga,
          rank: 0,
        };
      });
      rows.sort((a, b) => b.points - a.points || b.gameDiff - a.gameDiff || b.gamesFor - a.gamesFor || b.wins - a.wins || a.name.localeCompare(b.name));
      rows.forEach((r, i) => (r.rank = i + 1));
      setStandings(rows);
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
        .from("leagues")
        .select("id, name, category, season, start_date, end_date, status, max_players")
        .eq("category", cat)
        .eq("season", "Q1 2027")
        .maybeSingle();
      const leagueRow = (lg as LeagueRow | null) ?? null;
      setRegLeague(leagueRow);
      if (!leagueRow) {
        setRegParticipantsCount(0);
        setRegAlready(false);
        return;
      }
      const { count } = await supabase
        .from("league_participants")
        .select("id", { count: "exact", head: true })
        .eq("league_id", leagueRow.id);
      setRegParticipantsCount(count ?? 0);
      if (uid) {
        const { data: existing } = await supabase
          .from("league_participants")
          .select("id")
          .eq("league_id", leagueRow.id)
          .eq("user_id", uid)
          .maybeSingle();
        setRegAlready(Boolean(existing));
      } else {
        setRegAlready(false);
      }
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
      if (regLeague.status !== "active" && regLeague.status !== "upcoming") {
        setRegError("Pendaftaran kategori ini tidak tersedia atau sudah ditutup.");
        return;
      }
      if (regParticipantsCount >= regLeague.max_players) {
        setRegError("Kuota kategori ini sudah penuh.");
        return;
      }
      if (regAlready) {
        setRegError("Anda sudah terdaftar di kategori liga ini.");
        return;
      }
      const supabase = createClient();
      const { error } = await supabase
        .from("league_participants")
        .insert({ league_id: regLeague.id, user_id: currentUser.id });
      if (error) {
        if (error.code === "23505") setRegError("Anda sudah terdaftar di kategori liga ini.");
        else setRegError(error.message || "Pendaftaran gagal. Coba lagi.");
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
  const regOpenOk = regLeague && (regLeague.status === "active" || regLeague.status === "upcoming") && regParticipantsCount < regLeague.max_players;

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto px-4 sm:px-6 space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-matchpoin-navy bg-white border border-slate-200 px-3 py-1 rounded-full">
              <Trophy className="w-3.5 h-3.5 text-matchpoin-tennis" />
              <span>Season 1 League · Q1 2027</span>
            </div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900 tracking-tight">Liga Season 1 MATCHPOIN</h1>
            <p className="text-slate-600 text-xs sm:text-sm max-w-xl leading-relaxed">
              Daftar per kategori, lihat peserta & klasemen. Poin: Menang 3 · Kalah 0 · WO 8–0 (3 poin). Hanya hasil terverifikasi.
            </p>
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
                    <div className="font-semibold text-slate-800">{regCatMeta.label} — {regLeague?.season ?? "Q1 2027"}</div>
                    <div>Status: <Badge variant={regOpenOk ? "outline" : "secondary"} className="text-[10px]">{regLeague?.status ?? "tidak tersedia"}</Badge></div>
                    <div>Kuota: {regParticipantsCount}/{regLeague?.max_players ?? 12} peserta · {regOpenOk ? "Pendaftaran dibuka" : "Pendaftaran tidak tersedia/penuh/ditutup"}</div>
                    {regAlready && <div className="text-emerald-700 font-semibold">Anda sudah terdaftar di kategori ini.</div>}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setRegOpen(false)}>Batal</Button>
                    <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold" disabled={!currentUser || !regOpenOk || regAlready || regLoading}
                      onClick={() => { setRegError(null); setRegStep(2); }}>
                      Lanjut Konfirmasi
                    </Button>
                  </div>
                  {!currentUser && <p className="text-amber-700">Masuk akun untuk mendaftar liga. <Link href="/login?redirectTo=/league" className="underline font-semibold">Masuk</Link></p>}
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
                    <div><span className="text-slate-500">Kuota saat ini:</span> <strong>{regParticipantsCount}/{regLeague?.max_players ?? 12}</strong></div>
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
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <p className="font-semibold text-slate-800">Pendaftaran Berhasil</p>
                  <p className="text-slate-600">Anda telah terdaftar di <strong>{regCatMeta.label}</strong> dan otomatis masuk ke daftar peserta & klasemen kategori ini.</p>
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
              <div className="font-bold text-slate-800">{selectedCategoryMeta.label} · {league?.season ?? "Q1 2027"}</div>
              <div className="text-slate-500">Status liga: <strong className="capitalize">{league?.status ?? "tidak tersedia"}</strong> · Peserta terdaftar: <strong>{participants.length}</strong>/{league?.max_players ?? 12}</div>
              <div className="text-slate-500">Periode: {league?.start_date ?? "-"} s/d {league?.end_date ?? "-"}</div>
            </div>
            <Badge variant={league && (league.status === "active" || league.status === "upcoming") ? "outline" : "secondary"} className="w-fit">
              {league && (league.status === "active" || league.status === "upcoming") ? "Pendaftaran terbuka (sesuai kuota)" : "Tidak menerima pendaftaran"}
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
                        <Badge variant="outline" className="text-[10px] shrink-0">Terdaftar</Badge>
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
                      <div key={s.userId} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-xs">
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
