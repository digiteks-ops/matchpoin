"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Clock, Trophy, Users, CheckCircle2, AlertCircle, Loader2, MapPin, ListChecks } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  IKA17_CATEGORIES,
  IKA17_ELIGIBILITY_STATEMENT,
  IKA17_CLASS_LABELS,
  IKA17_INTERMEDIATE_MIN_RATING,
  ika17Category,
  IKA17_REGISTRATION_OPEN,
  IKA17_REGISTRATION_DEADLINE,
} from "@/lib/tournaments/ika17";
import { isValidWhatsapp } from "@/lib/mysql/competition-registration-core.mjs";
import { LEAGUE_WHATSAPP_GROUP_URL } from "@/lib/notifications/whatsapp-core.mjs";
import { formatIndonesianDate } from "@/lib/utils";
import { DEFAULT_CITY_NAME, DEFAULT_PROVINCE } from "@/lib/constants/location";

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
  rating?: number | null;
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

/** Bentuk respons `/api/leagues/[category]` (server-side, melewati RLS). */
interface LeagueOverviewPayload {
  participants?: Array<{
    entryId: string;
    userId: string;
    name: string;
    avatarUrl: string | null;
    province: string | null;
    cityName: string | null;
    joinedAt: string | null;
  }>;
  standings?: Array<{
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
    rating?: number | null;
  }>;
}

// Satu sumber kategori: lihat src/lib/tournaments/ika17-core.mjs. Daftar lokal
// sebelumnya masih memuat `womens_singles` dan tidak punya level/gender,
// sehingga pendaftaran kategori baru ikut gagal.
const CATEGORIES = IKA17_CATEGORIES;

interface PartnerOption {
  id: string;
  name: string;
  gender: string | null;
}

type RegStep = 1 | 2 | 3;

// Sumber tunggal: src/lib/tournaments/ika17-core.mjs.
const REG_OPEN = IKA17_REGISTRATION_OPEN;
const REG_CLOSE = IKA17_REGISTRATION_DEADLINE;

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

/** Status liga dari database (enum) ditampilkan dalam Bahasa Indonesia. */
function leagueStatusLabel(status: string | null | undefined): string {
  switch (status) {
    case "registration_open":
      return "Pendaftaran dibuka";
    case "registration_closed":
      return "Pendaftaran ditutup";
    case "in_progress":
    case "ongoing":
      return "Sedang berlangsung";
    case "completed":
    case "finished":
      return "Selesai";
    case "cancelled":
      return "Dibatalkan";
    case "upcoming":
      return "Akan datang";
    default:
      return "Tidak tersedia";
  }
}

/** Tanggal ISO (YYYY-MM-DD) -> "1 Des 2026"; nilai kosong -> "-". */
function formatLeagueDate(value: string | null | undefined): string {
  if (!value) return "-";
  const date = new Date(`${value.slice(0, 10)}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return value;
  return formatIndonesianDate(date, { day: "numeric", month: "short", year: "numeric" });
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
  const [regProfile, setRegProfile] = useState<{ name: string; city: string; province: string; gender: string | null } | null>(null);
  const [regAlready, setRegAlready] = useState(false);
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState(false);
  // Kategori ganda butuh partner; semua kategori butuh pernyataan PORDA.
  const [regPartnerId, setRegPartnerId] = useState("");
  const [regPartners, setRegPartners] = useState<PartnerOption[]>([]);
  const [regPartnersLoading, setRegPartnersLoading] = useState(false);
  const [regEligibility, setRegEligibility] = useState(false);
  // Nomor WhatsApp wajib: dipakai panitia dan menjadi syarat gabung grup liga.
  const [regWhatsapp, setRegWhatsapp] = useState("");
  // Status tombol grup WhatsApp di langkah sukses (sudah dibuka atau belum).
  const [autoJoinedGroup, setAutoJoinedGroup] = useState(false);

  const [provinceFilter, setProvinceFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");

  const selectedCategoryMeta = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];

  const loadLeagueData = useCallback(async () => {
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

      // Peserta & klasemen dibaca lewat API server. RLS
      // `tournament_participants` hanya membuka baris milik sendiri untuk
      // pemain login, sehingga query langsung dari browser selalu kosong dan
      // halaman tampil "Belum ada peserta" padahal liga sudah terisi.
      const overviewResponse = await fetch(
        `/api/leagues/${encodeURIComponent(category)}`,
        { cache: "no-store" }
      );
      if (!overviewResponse.ok) {
        setParticipants([]);
        setStandings([]);
        return;
      }

      const overview = (await overviewResponse.json()) as LeagueOverviewPayload;
      const apiParticipants = overview.participants ?? [];

      setParticipants(
        apiParticipants.map((p) => ({
          userId: p.userId,
          name: p.name || "Pemain MATCHPOIN",
          avatarUrl: p.avatarUrl ?? null,
          province: p.province ?? null,
          cityName: p.cityName ?? null,
          joinedAt: p.joinedAt ?? null,
          status: "confirmed",
        }))
      );

      const apiStandings = overview.standings ?? [];
      setStandings(
        apiStandings.map((s) => ({
          entryId: s.entryId,
          name: s.name || "Peserta",
          avatarUrl: s.avatarUrl ?? null,
          province: s.province ?? null,
          cityName: s.cityName ?? null,
          points: Number(s.points ?? 0),
          wins: Number(s.wins ?? 0),
          losses: Number(s.losses ?? 0),
          matchesPlayed: Number(s.matchesPlayed ?? 0),
          gamesFor: Number(s.gamesFor ?? 0),
          gamesAgainst: Number(s.gamesAgainst ?? 0),
          gameDiff: Number(s.gameDiff ?? 0),
          rank: Number(s.rank ?? 0) || 0,
          needsTiebreak: Boolean(s.needsTiebreak),
          rating: s.rating === null || s.rating === undefined ? null : Number(s.rating),
        }))
      );
      return;
    } catch (err) {
      console.error("Error loading league:", err);
      setParticipants([]);
      setStandings([]);
    } finally {
      setIsLoading(false);
    }
  }, [category]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user));
  }, []);

  useEffect(() => {
    loadLeagueData();
  }, [category, loadLeagueData]);

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
      let gender: string | null = null;
      if (!user) {
        setRegProfile(null);
      } else {
        const { data: prof } = await supabase
          .from("player_profiles")
          .select("display_name, users(full_name, gender, phone, cities(name, province))")
          .eq("user_id", user.id)
          .maybeSingle();
        const city = pickCity((prof as any)?.users ?? null);
        gender = (prof as any)?.users?.gender ?? null;
        // Prefill nomor WhatsApp yang sudah tersimpan di profil agar pemain
        // tidak perlu mengetik ulang setiap kali mendaftar kategori baru.
        const savedPhone = (prof as any)?.users?.phone;
        if (typeof savedPhone === "string" && savedPhone.trim()) {
          setRegWhatsapp(savedPhone.trim());
        }
        setRegProfile({
          name: (prof as any)?.display_name || (prof as any)?.users?.full_name || "Pemain MATCHPOIN",
          city: city?.name ?? "",
          province: city?.province ?? "",
          gender,
        });
      }
      await prepareRegCategory(category, user?.id ?? null, gender);
    } finally {
      setRegLoading(false);
    }
  }

  async function prepareRegCategory(cat: string, uid: string | null, gender: string | null = null) {
    setRegError(null);
    setRegLoading(true);
    // Reset pilihan per kategori: partner hanya berlaku untuk kategori ganda.
    setRegPartnerId("");
    setRegPartners([]);
    setRegEligibility(false);
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
      // Rows are limited to this category so a player registered in another
      // category never inflates the quota or trips the duplicate check.
      const { data: partRows } = await supabase
        .from("tournament_participants")
        .select("entry_id, user_id, status, category")
        .eq("tournament_id", leagueRow.id)
        .eq("category", cat);

      const entries = (partRows ?? []) as {
        entry_id: string;
        user_id: string;
        status: string;
        category: string | null;
      }[];
      const activeEntries = entries.filter((e) => e.status !== "rejected");
      setRegParticipantsCount(new Set(activeEntries.map((e) => e.entry_id)).size);

      // Duplikat dihitung per kategori: pemain boleh ikut kategori lain.
      setRegAlready(Boolean(uid) && activeEntries.some((e) => e.user_id === uid));

      // Kategori ganda: muat calon partner sejenis (campuran: lawan jenis).
      const definition = ika17Category(cat);
      if (definition?.doubles && uid) {
        setRegPartnersLoading(true);
        try {
          const response = await fetch(
            `/api/tournaments/${encodeURIComponent(leagueRow.id)}/partners?category=${encodeURIComponent(cat)}`,
            { cache: "no-store" }
          );
          const payload = (await response.json()) as {
            success?: boolean;
            partners?: PartnerOption[];
          };
          const own = (payload.partners ?? []).filter((partner) => {
            if (definition.genderRule === "male") return partner.gender === "male";
            if (definition.genderRule === "female") return partner.gender === "female";
            return true;
          });
          setRegPartners(own);
        } catch {
          setRegPartners([]);
        } finally {
          setRegPartnersLoading(false);
        }
      }
    } finally {
      setRegLoading(false);
    }
  }

  async function onRegCategoryChange(cat: string) {
    setRegCategory(cat);
    await prepareRegCategory(cat, currentUser?.id ?? null, regProfile?.gender ?? null);
  }

  async function confirmRegistration() {
    if (!currentUser || !regLeague || regLoading) return;
    setRegError(null);
    setRegLoading(true);
    try {
      if (!isRegistrationPeriodOpen()) {
        setRegError(isRegistrationClosed() ? "Pendaftaran telah ditutup (batas 31 Desember 2026)." : "Pendaftaran dibuka mulai 1 Desember 2026.");
        return;
      }
      if (regLeague.status !== "registration_open") {
        setRegError("Pendaftaran kategori ini tidak tersedia.");
        return;
      }
      if (regAlready) {
        setRegError("Anda sudah terdaftar di kategori liga ini.");
        return;
      }
      const definition = ika17Category(regCategory);
      if (definition?.doubles && !regPartnerId) {
        setRegError("Pilih partner untuk kategori ganda.");
        return;
      }
      if (!isValidWhatsapp(regWhatsapp)) {
        setRegError("Nomor WhatsApp wajib diisi dengan format yang benar, mis. 08123456789.");
        return;
      }
      if (!regEligibility) {
        setRegError("Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.");
        return;
      }

      const res = await fetch("/api/tournaments/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tournamentId: regLeague.id,
          partnerUserId: definition?.doubles ? regPartnerId : null,
          eligibilityConfirmed: regEligibility,
          whatsappNumber: regWhatsapp,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        whatsappGroupUrl?: string;
      };
      if (!res.ok || !data.success) {
        setRegError(data.message || "Pendaftaran gagal. Coba lagi.");
        return;
      }
      setRegSuccess(true);
      setRegStep(3);
      // Join otomatis: buka undangan grup WhatsApp begitu pendaftaran diterima.
      // Dipanggil sinkron di dalam handler klik agar tidak diblokir pemblokir
      // popup browser.
      const groupUrl = data.whatsappGroupUrl || LEAGUE_WHATSAPP_GROUP_URL;
      const groupWindow = window.open(groupUrl, "_blank", "noopener,noreferrer");
      setAutoJoinedGroup(Boolean(groupWindow));
      await loadLeagueData();
      await prepareRegCategory(regCategory, currentUser.id, regProfile?.gender ?? null);
    } finally {
      setRegLoading(false);
    }
  }

  const provinces = useMemo(() => {
    const set = new Set<string>();
    participants.forEach((p) => { if (p.province) set.add(p.province); });
    return Array.from(set).sort();
  }, [participants]);

  // Lokasi bawaan: Sulawesi Selatan, Kota Makassar. Diterapkan sekali saja
  // (setelah peserta termuat) agar tombol "Reset Filter Lokasi" tidak
  // langsung tertimpa kembali.
  const defaultLocationApplied = useRef(false);
  useEffect(() => {
    if (defaultLocationApplied.current) return;
    if (participants.length === 0) return;
    defaultLocationApplied.current = true;
    if (!provinces.includes(DEFAULT_PROVINCE)) return;
    setProvinceFilter(DEFAULT_PROVINCE);
    const makassar = participants.find(
      (p) =>
        p.province === DEFAULT_PROVINCE &&
        p.cityName?.toLowerCase().includes(DEFAULT_CITY_NAME.toLowerCase())
    );
    if (makassar?.cityName) setCityFilter(makassar.cityName);
  }, [participants, provinces]);

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

  const filteredStandings = useMemo(() => {
    const filtered = standings.filter((s) => {
      if (provinceFilter !== "all" && s.province !== provinceFilter) return false;
      if (cityFilter !== "all" && s.cityName !== cityFilter) return false;
      return true;
    });
    return [...filtered].sort(
      (a, b) =>
        (b.rating ?? 0) - (a.rating ?? 0) ||
        b.wins - a.wins ||
        b.matchesPlayed - a.matchesPlayed ||
        a.name.localeCompare(b.name)
    );
  }, [standings, provinceFilter, cityFilter]);

  const regCatMeta = CATEGORIES.find((c) => c.id === regCategory) ?? CATEGORIES[0];
  const regPeriodOpen = isRegistrationPeriodOpen();
  const regClosed = isRegistrationClosed();
  // Tanpa batas kuota: hanya periode dan status liga yang menentukan.
  const regOpenOk = Boolean(regLeague && regPeriodOpen && regLeague.status === "registration_open");

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
              Daftar per kategori (Single Man, Double Man, Double Woman), lihat peserta
              &amp; klasemen. Pendaftaran: 1–31 Desember 2026 (WITA). Kelas Beginner/Intermediate
              dibentuk otomatis dari hasil pertandingan. Peringkat ditentukan berdasarkan MatchPoin Rating (MPR).
            </p>
            <Badge variant={regPeriodOpen ? "outline" : "secondary"} className={regPeriodOpen ? "border-emerald-200 text-emerald-700 bg-emerald-50 w-fit" : "w-fit"}>
              Status Pendaftaran: {regPeriodOpen ? "OPEN" : regClosed ? "CLOSED" : `Dibuka ${formatLeagueDate(REG_OPEN)}`}
            </Badge>
          </div>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <Button
              variant="tennis"
              className="text-matchpoin-navy font-bold"
              onClick={openRegistration}
              disabled={!regPeriodOpen}
              title={
                regPeriodOpen
                  ? "Daftar liga"
                  : regClosed
                  ? "Pendaftaran liga sudah ditutup"
                  : `Pendaftaran dibuka ${formatLeagueDate(REG_OPEN)}`
              }
            >
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
                  <p className="text-[11px] text-slate-500">
                    Anda boleh mendaftar lebih dari satu kategori (mis. Single Man dan Double Man).
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {CATEGORIES.map((c) => (
                      <button key={c.id} onClick={() => onRegCategoryChange(c.id)}
                        disabled={regLoading}
                        className={`text-left p-3 rounded-lg border transition-all disabled:opacity-60 ${regCategory === c.id ? "border-matchpoin-navy bg-slate-50" : "border-slate-200 hover:bg-slate-50"}`}>
                        <div className="font-semibold text-slate-800">{c.label}</div>
                        <div className="text-[11px] text-slate-500">{c.eligibilityLabel}</div>
                      </button>
                    ))}
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                    <div className="font-semibold text-slate-800">{regCatMeta.label} — {regLeague?.season ?? "-"}</div>
                    <div>Status Pendaftaran: <Badge variant={regOpenOk ? "outline" : "secondary"} className="text-[10px]">{regPeriodOpen ? "OPEN" : regClosed ? "CLOSED" : `Dibuka ${formatLeagueDate(REG_OPEN)}`}</Badge></div>
                    <div>Pendaftar: {regParticipantsCount} peserta · {regOpenOk ? "Dapat mendaftar" : "Tidak dapat mendaftar (periode/status)"}</div>
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
                  {!regLeague ? (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                      Memuat data liga... Silakan tunggu.
                    </div>
                  ) : (
                    <>
                      <div className="p-3 rounded-lg border border-slate-200 space-y-1">
                        <div><span className="text-slate-500">Kategori:</span> <strong>{regCatMeta.label}</strong></div>
                        <div><span className="text-slate-500">Liga:</span> <strong>{regLeague?.name} {regLeague?.season}</strong></div>
                        <div><span className="text-slate-500">Nama:</span> <strong>{regProfile?.name ?? "-"}</strong></div>
                        <div><span className="text-slate-500">Lokasi:</span> <strong>{[regProfile?.city, regProfile?.province].filter(Boolean).join(", ") || "Belum diisi di profil"}</strong></div>
                        <div><span className="text-slate-500">Pendaftar saat ini:</span> <strong>{regParticipantsCount}</strong></div>
                      </div>

                      {ika17Category(regCategory)?.doubles && (
                        <div className="space-y-1">
                          <label htmlFor="regPartner" className="font-semibold text-slate-700">Partner</label>
                          <select
                            id="regPartner"
                            value={regPartnerId}
                            onChange={(e) => setRegPartnerId(e.target.value)}
                            disabled={regLoading || regPartnersLoading}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                          >
                            <option value="">
                              {regPartnersLoading ? "Memuat pemain..." : "Pilih partner"}
                            </option>
                            {regPartners.map((partner) => (
                              <option key={partner.id} value={partner.id}>
                                {partner.name}
                                {partner.gender === "male" ? " (Putra)" : partner.gender === "female" ? " (Putri)" : ""}
                              </option>
                            ))}
                          </select>
                          {regPartners.length === 0 && !regPartnersLoading && (
                            <p className="text-[11px] text-amber-700">
                              Belum ada calon partner yang sesuai untuk kategori ini.
                            </p>
                          )}
                        </div>
                      )}

                      <div className="rounded-lg bg-slate-50 p-2 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-700">Kelas liga otomatis</span>
                        <p className="mt-0.5">
                          Tidak ada pilihan level saat mendaftar. Hasil pertandingan menentukan
                          kelas Anda: {IKA17_CLASS_LABELS.beginner} (MPR di bawah{" "}
                          {IKA17_INTERMEDIATE_MIN_RATING}) atau {IKA17_CLASS_LABELS.intermediate}{" "}
                          (MPR {IKA17_INTERMEDIATE_MIN_RATING} ke atas). Tim ganda memakai
                          rata-rata MPR kedua pemain.
                        </p>
                      </div>

                      <div className="space-y-1">
                        <label htmlFor="regWhatsapp" className="font-semibold text-slate-700">
                          No. WhatsApp <span className="text-rose-600">*</span>
                        </label>
                        <input
                          id="regWhatsapp"
                          type="tel"
                          inputMode="tel"
                          autoComplete="tel"
                          placeholder="08xxxxxxxxxx"
                          value={regWhatsapp}
                          onChange={(e) => setRegWhatsapp(e.target.value)}
                          disabled={regLoading}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                        />
                        <p className="text-[11px] text-slate-500">
                          Dipakai panitia untuk koordinasi jadwal. Setelah mendaftar Anda otomatis
                          diarahkan ke grup WhatsApp liga.
                        </p>
                      </div>

                      <label className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2 text-[11px] text-rose-800">
                        <input
                          type="checkbox"
                          checked={regEligibility}
                          onChange={(e) => setRegEligibility(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-rose-300 text-rose-600"
                        />
                        <span>Saya menyatakan {IKA17_ELIGIBILITY_STATEMENT}</span>
                      </label>

                      <p className="text-slate-500">Pastikan data profil benar. Satu pemain hanya dapat terdaftar 1x per kategori liga, tetapi boleh mengikuti kategori lain.</p>
                      <div className="flex justify-between gap-2">
                        <Button variant="outline" size="sm" onClick={() => setRegStep(1)} disabled={regLoading}>Kembali</Button>
                        <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold" onClick={confirmRegistration} disabled={regLoading || !currentUser || regAlready || !regLeague || (ika17Category(regCategory)?.doubles && !regPartnerId) || !isValidWhatsapp(regWhatsapp) || !regEligibility}>
                          {regLoading ? <><Loader2 className="w-4 h-4 animate-spin mr-1" />Mendaftarkan...</> : "Konfirmasi Pendaftaran"}
                        </Button>
                      </div>
                    </>
                  )}
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

                  {/* "Join otomatis": pendaftaran yang berhasil langsung membuka
                      undangan grup WhatsApp. Target membuka tab baru sehingga
                      halaman status pendaftaran tetap terbuka. */}
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left">
                    <p className="text-xs font-semibold text-emerald-800">
                      Langkah terakhir: gabung grup WhatsApp liga
                    </p>
                    <p className="mt-1 text-[11px] text-emerald-700">
                      Info jadwal, lawan, dan pengumuman panitia dibagikan di grup ini.
                    </p>
                    <a
                      href={LEAGUE_WHATSAPP_GROUP_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setAutoJoinedGroup(true)}
                      className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                    >
                      {autoJoinedGroup ? "Buka Grup Lagi" : "Gabung Grup WhatsApp"}
                    </a>
                    {autoJoinedGroup && (
                      <p className="mt-1 text-[10px] text-emerald-700">
                        Tautan grup sudah dibuka. Selesaikan pendaftaran di WhatsApp.
                      </p>
                    )}
                  </div>
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
              <div className="text-slate-500">Status liga: <strong>{leagueStatusLabel(league?.status)}</strong> · Peserta terdaftar: <strong>{participants.length}</strong></div>
              <div className="text-slate-500">
                Periode liga: {formatLeagueDate(league?.start_date)} s/d {formatLeagueDate(league?.end_date)}
              </div>
              <div className="text-slate-500">
                Periode pendaftaran: {formatLeagueDate(REG_OPEN)} – {formatLeagueDate(REG_CLOSE)} (WITA)
              </div>
            </div>
            <Badge variant={regPeriodOpen ? "outline" : "secondary"} className="w-fit">
              {regPeriodOpen ? "Pendaftaran OPEN" : regClosed ? "Pendaftaran CLOSED" : `Pendaftaran dibuka ${formatLeagueDate(REG_OPEN)}`}
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
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" /> Peserta Terdaftar ({filteredParticipants.length}
                  {filteredParticipants.length !== participants.length
                    ? ` dari ${participants.length}`
                    : ""}
                  )
                </CardTitle>
                <CardDescription className="text-xs">
                  Pemain terdaftar di kategori {selectedCategoryMeta.label}
                  {filteredParticipants.length !== participants.length
                    ? " (difilter sesuai lokasi)."
                    : "."}
                </CardDescription>
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
                <CardDescription className="text-xs">Peserta terdaftar &amp; peringkat MatchPoin Rating (MPR) (kategori {selectedCategoryMeta.label}).</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {filteredStandings.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500">Belum ada data klasemen untuk ditampilkan.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {filteredStandings.map((s, index) => (
                      <div key={s.entryId} className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-xs">
                        {/* Nomor urut dihitung ulang setelah filter lokasi, agar tidak
                            melompat (3, 4, 6, ...) saat sebagian peserta disembunyikan. */}
                        <div className="col-span-1 font-bold text-slate-500">{index + 1}</div>
                        <div className="col-span-6 min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{s.name}</div>
                          <div className="text-[10px] text-slate-500 truncate">{[s.cityName, s.province].filter(Boolean).join(", ") || "Lokasi belum diisi"}</div>
                        </div>
                        <div className="col-span-2 text-center">
                          <div className="font-extrabold text-matchpoin-navy">{s.rating === null || s.rating === undefined ? "-" : Math.round(s.rating)}</div>
                          <div className="text-[10px] text-slate-400">MPR</div>
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
            Peringkat klasemen ditentukan berdasarkan MatchPoin Rating (MPR) tertinggi, jumlah kemenangan, jumlah pertandingan, lalu urutan nama. Pertandingan Walkover (WO) dicatat 8–0 / 0–8 dan tidak mengubah MPR. Klasemen dipisah per kategori, hanya peserta terdaftar &amp; hasil terverifikasi (confirmed).
          </p>
        </div>
      </div>
    </div>
  );
}