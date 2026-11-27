"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, CalendarPlus, Check, Loader2, MapPin, Trophy, UserPlus } from "lucide-react";
import { MATCH_CATEGORY_LABELS, type MatchCategory, type MatchType, type UmpirePreference } from "@/lib/matches/constants";
import { ERROR_CREATE_MATCH, ERROR_NETWORK, isOffline, logError } from "@/lib/errors";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { toPlatformIsoString } from "@/lib/utils";
import { RATING_TIER_OPTIONS } from "@/lib/rating/rating-tier-core.mjs";
import { DEFAULT_CITY_NAME, DEFAULT_PROVINCE } from "@/lib/constants/location";
import { createClient } from "@/lib/supabase/client";

export interface CityOption {
  id: string;
  name: string;
  province: string;
}

// Pertandingan umum (di luar turnamen) tidak dibatasi gender: host yang
// menentukan susunan pemain, sehingga cewek vs cowok diperbolehkan. Aturan
// gender hanya berlaku di kategori turnamen/liga (divalidasi di server).

interface CreateMatchFormProps {
  cities: CityOption[];
  inviteUserId?: string;
  inviteName?: string;
  /** Kategori awal, mis. dari shortcut leaderboard liga (mode tunggal/ganda). */
  initialCategory?: MatchCategory;
  currentUserId: string;
  isAdmin?: boolean;
}

export function CreateMatchForm({ cities, inviteUserId, inviteName, initialCategory, currentUserId, isAdmin = false }: CreateMatchFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<MatchCategory>(initialCategory ?? "mens_singles");
  const [province, setProvince] = useState<string>("");
  const [cityName, setCityName] = useState<string>("");
  const [courtName, setCourtName] = useState<string>("");
  const [matchDate, setMatchDate] = useState("");
  const [startTime, setStartTime] = useState("16:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [level, setLevel] = useState("all");
  const [umpireOption, setUmpireOption] = useState<UmpirePreference>("tanpa_wasit");
  const [description, setDescription] = useState("");
  const [reclubLink, setReclubLink] = useState("");
  const [partnerUserId, setPartnerUserId] = useState("");
  const [opponentUserId, setOpponentUserId] = useState(inviteUserId ?? "");
  const [opponentPartnerUserId, setOpponentPartnerUserId] = useState("");
  const [teamACaptainUserId, setTeamACaptainUserId] = useState(isAdmin ? "" : currentUserId);
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [matchType, setMatchType] = useState<MatchType>("private");
  const [singlesMode, setSinglesMode] = useState<MatchType>("private");
  const [partners, setPartners] = useState<{ user_id: string; display_name: string; gender: string | null }[]>([]);
  const [opponents, setOpponents] = useState<{ user_id: string; display_name: string; gender: string | null }[]>([]);
  const [partnersLoading, setPartnersLoading] = useState(false);
  const [opponentsLoading, setOpponentsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const RACE_TO_SCORE = 8;
  const COURT_SWITCH_AT = 4;

  const isDoubles = category.includes("doubles");
  const categoryName = MATCH_CATEGORY_LABELS[category].split(" (")[0];
  const requiredDoublesPlayers = [partnerUserId, opponentUserId, opponentPartnerUserId].filter(Boolean).length;
  const adminTeamSlots = isDoubles
    ? [teamACaptainUserId, partnerUserId, opponentUserId, opponentPartnerUserId]
    : [teamACaptainUserId, opponentUserId];
  const adminFilledSlots = adminTeamSlots.filter(Boolean).length;
  const formProgress = isAdmin
    ? `${adminFilledSlots}/${isDoubles ? 4 : 2} pemain`
    : isDoubles
    ? `${requiredDoublesPlayers + 1}/4 pemain`
    : opponentUserId
    ? "2/2 pemain"
    : "1/2 pemain";

  const provinceOptions = useMemo(
    () => Array.from(new Set(cities.map((c) => c.province).filter(Boolean))).sort(),
    [cities]
  );

  useEffect(() => {
    if (province) return;
    // Lokasi bawaan: Sulawesi Selatan. Fallback ke opsi pertama bila tidak ada.
    setProvince(
      provinceOptions.includes(DEFAULT_PROVINCE) ? DEFAULT_PROVINCE : provinceOptions[0] ?? ""
    );
  }, [province, provinceOptions]);

  const cityOptions = useMemo(
    () =>
      Array.from(
        new Set(
          cities
            .filter((c) => !province || c.province === province)
            .map((c) => c.name)
            .filter(Boolean)
        )
      ).sort(),
    [cities, province]
  );

  useEffect(() => {
    if (cityName && !cityOptions.includes(cityName)) {
      setCityName("");
    }
  }, [cityName, cityOptions]);

  useEffect(() => {
    // Kota bawaan: Makassar, selama belum dipilih dan tersedia di provinsi ini.
    if (cityName) return;
    const preferred = cityOptions.find(
      (name) => name.toLowerCase() === DEFAULT_CITY_NAME.toLowerCase()
    );
    if (preferred) setCityName(preferred);
  }, [cityName, cityOptions]);

  useEffect(() => {
    if (!isDoubles) {
      setPartnerUserId("");
      setOpponentPartnerUserId("");
      setMatchType("private");
      return;
    }
  }, [isDoubles]);

  useEffect(() => {
    if (isAdmin) {
      setMatchType("private");
      setSinglesMode("private");
    }
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    async function loadPlayers() {
      setPartnersLoading(true);
      setOpponentsLoading(true);
      try {
        const supabase = createClient();
        let query = supabase
          .from("public_players")
          .select("user_id, display_name, gender")
          .order("display_name", { ascending: true })
          .limit(200);
        if (!isAdmin) {
          query = query.neq("user_id", currentUserId);
        }
        const { data } = await query;
        if (cancelled) return;
        const rows = (data ?? []) as {
          user_id: string;
          display_name: string | null;
          gender: string | null;
        }[];
        const availablePlayers = rows.map((player) => ({
          user_id: player.user_id,
          display_name: player.display_name || "Pemain MATCHPOIN",
          gender: player.gender ?? null,
        }));
        setPartners(availablePlayers);
        setOpponents(availablePlayers);
      } catch {
        if (!cancelled) {
          setPartners([]);
          setOpponents([]);
        }
      } finally {
        if (!cancelled) {
          setPartnersLoading(false);
          setOpponentsLoading(false);
        }
      }
    }
    loadPlayers();
    return () => {
      cancelled = true;
    };
  }, [currentUserId, isAdmin]);



  const today = new Date().toISOString().slice(0, 10);

  const teamACaptainOptions = useMemo(
    () =>
      opponents.filter(
        (player) =>
          player.user_id !== partnerUserId &&
          player.user_id !== opponentUserId &&
          player.user_id !== opponentPartnerUserId
      ),
    [opponentPartnerUserId, opponentUserId, opponents, partnerUserId]
  );

  const partnerOptions = useMemo(
    () =>
      partners.filter(
        (player) =>
          player.user_id !== inviteUserId &&
          player.user_id !== teamACaptainUserId &&
          player.user_id !== opponentUserId &&
          player.user_id !== opponentPartnerUserId
      ),
    [inviteUserId, opponentPartnerUserId, opponentUserId, partners, teamACaptainUserId]
  );

  const opponentOptions = useMemo(
    () =>
      opponents.filter(
        (player) =>
          player.user_id !== teamACaptainUserId &&
          player.user_id !== partnerUserId &&
          player.user_id !== opponentPartnerUserId
      ),
    [opponentPartnerUserId, opponents, partnerUserId, teamACaptainUserId]
  );

  const opponentPartnerOptions = useMemo(
    () =>
      opponents.filter(
        (player) =>
          player.user_id !== teamACaptainUserId &&
          player.user_id !== partnerUserId &&
          player.user_id !== opponentUserId
      ),
    [opponentUserId, opponents, partnerUserId, teamACaptainUserId]
  );

  const handleCategoryChange = (next: MatchCategory) => {
    setCategory(next);
    if (!next.includes("doubles")) {
      setPartnerUserId("");
      setOpponentPartnerUserId("");
      setMatchType("private");
      if (singlesMode === "open") {
        setOpponentUserId("");
      } else if (inviteUserId) {
        setOpponentUserId(inviteUserId);
      }
    }
  };

  const handleOpponentChange = (value: string) => {
    setOpponentUserId(value);
    if (opponentPartnerUserId === value) setOpponentPartnerUserId("");
  };

  const handleTeamACaptainChange = (value: string) => {
    setTeamACaptainUserId(value);
    if (partnerUserId === value) setPartnerUserId("");
    if (opponentUserId === value) setOpponentUserId("");
    if (opponentPartnerUserId === value) setOpponentPartnerUserId("");
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!title.trim()) {
      setError("Judul pertandingan wajib diisi.");
      return;
    }
    if (!province) {
      setError("Pilih provinsi lokasi pertandingan.");
      return;
    }
    if (!cityName) {
      setError("Pilih kota/kabupaten lokasi pertandingan.");
      return;
    }
    if (!courtName.trim()) {
      setError("Nama lapangan wajib diisi.");
      return;
    }
    if (!matchDate || !startTime) {
      setError("Tanggal dan jam mulai wajib diisi.");
      return;
    }
    const adminTeam1 = isDoubles ? [teamACaptainUserId, partnerUserId] : [teamACaptainUserId];
    const adminTeam2 = isDoubles ? [opponentUserId, opponentPartnerUserId] : [opponentUserId];
    const hasAnyScore = team1Score !== "" || team2Score !== "";

    if (isAdmin) {
      if (adminTeam1.some((id) => !id) || adminTeam2.some((id) => !id)) {
        setError(
          isDoubles
            ? "Lengkapi 2 pemain Team A dan 2 pemain Team B."
            : "Pilih pemain Team A dan pemain Team B."
        );
        return;
      }
      if (new Set([...adminTeam1, ...adminTeam2]).size !== adminTeam1.length + adminTeam2.length) {
        setError("Setiap pemain hanya boleh mengisi satu posisi.");
        return;
      }
      if (hasAnyScore && (team1Score === "" || team2Score === "")) {
        setError("Isi skor Team A dan Team B, atau kosongkan keduanya.");
        return;
      }
      if (
        hasAnyScore &&
        (!Number.isInteger(Number(team1Score)) ||
          !Number.isInteger(Number(team2Score)) ||
          Number(team1Score) < 0 ||
          Number(team2Score) < 0)
      ) {
        setError("Skor harus berupa angka bulat 0 atau lebih.");
        return;
      }
      if (hasAnyScore && Number(team1Score) === Number(team2Score)) {
        setError("Pertandingan tenis tidak boleh berakhir seri.");
        return;
      }
    } else {
      if (isDoubles && matchType === "private" && !partnerUserId) {
        setError("Pilih partner untuk Team A.");
        return;
      }
      if (isDoubles && matchType === "private" && !opponentUserId) {
        setError("Pilih lawan utama untuk Team B.");
        return;
      }
      if (isDoubles && matchType === "private" && !opponentPartnerUserId) {
        setError("Pilih partner lawan untuk Team B.");
        return;
      }
      if (isDoubles && matchType === "private" && new Set([partnerUserId, opponentUserId, opponentPartnerUserId]).size !== 3) {
        setError("Setiap pemain hanya boleh mengisi satu posisi.");
        return;
      }
      if (!isDoubles && singlesMode === "private" && !opponentUserId) {
        setError("Pilih lawan untuk pertandingan tunggal (1 vs 1).");
        return;
      }
    }

    if (matchDate || startTime) {
      const startsAt = toPlatformIsoString(matchDate, startTime);
      if (!startsAt || new Date(startsAt).getTime() < Date.now()) {
        setError("Jadwal pertandingan harus di waktu yang akan datang.");
        return;
      }
    }

    if (isOffline()) {
      setError(ERROR_NETWORK);
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/matches/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          province,
          cityName,
          courtName: courtName.trim(),
          matchDate,
          startTime,
          durationMinutes,
          category,
          umpireOption,
          level,
          reclubLink: reclubLink.trim() || undefined,
          raceToScore: RACE_TO_SCORE,
          courtSwitchAt: COURT_SWITCH_AT,
          partnerUserId: isAdmin
            ? undefined
            : isDoubles && matchType === "private"
            ? partnerUserId
            : undefined,
          opponentUserId: isAdmin
            ? undefined
            : isDoubles
            ? matchType === "private"
              ? opponentUserId
              : undefined
            : singlesMode === "private"
            ? opponentUserId
            : undefined,
          opponentPartnerUserId: isAdmin
            ? undefined
            : isDoubles && matchType === "private"
            ? opponentPartnerUserId
            : undefined,
          matchType: isAdmin ? "private" : isDoubles ? matchType : singlesMode,
          team1UserIds: isAdmin ? adminTeam1 : undefined,
          team2UserIds: isAdmin ? adminTeam2 : undefined,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        matchId?: string;
        message?: string;
        quotaExceeded?: boolean;
      };

      if (!res.ok || !json.success || !json.matchId) {
        setError(json.message || ERROR_CREATE_MATCH);
        setIsSubmitting(false);
        return;
      }

      if (isAdmin && hasAnyScore) {
        try {
          const resultRes = await fetch(`/api/admin/matches/${json.matchId}/result`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              team1Score: Number(team1Score),
              team2Score: Number(team2Score),
            }),
          });
          const resultJson = (await resultRes.json().catch(() => ({}))) as {
            success?: boolean;
            message?: string;
          };
          if (!resultRes.ok || !resultJson.success) {
            setNotice(
              resultJson.message
                ? `Pertandingan dibuat, tetapi skor gagal disimpan: ${resultJson.message}`
                : "Pertandingan dibuat, tetapi skor gagal disimpan."
            );
          }
        } catch (resultErr) {
          logError("create.result", resultErr, { matchId: json.matchId });
          setNotice("Pertandingan dibuat, tetapi skor gagal disimpan.");
        }
      }

      let invited = false;
      if (inviteUserId && !isDoubles && singlesMode === "private" && opponentUserId !== inviteUserId) {
        try {
          const inviteRes = await fetch(`/api/matches/${json.matchId}/invite`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inviteeId: inviteUserId }),
          });
          const inviteJson = (await inviteRes.json().catch(() => ({}))) as {
            success?: boolean;
            message?: string;
          };
          invited = Boolean(inviteRes.ok && inviteJson.success);
          if (!invited) {
            logError("create.invite", inviteJson.message ?? inviteRes.status, {
              matchId: json.matchId,
              inviteUserId,
            });
            setNotice(
              inviteJson.message
                ? `Pertandingan dibuat, tetapi ${inviteJson.message.charAt(0).toLowerCase()}${inviteJson.message.slice(1)}`
                : "Pertandingan dibuat, tetapi undangan gagal dikirim."
            );
          }
        } catch (inviteErr) {
          logError("create.invite", inviteErr, { matchId: json.matchId, inviteUserId });
          setNotice("Pertandingan dibuat, tetapi undangan gagal dikirim.");
        }
      }

      router.push(`/matches/${json.matchId}${invited && inviteUserId ? "?invited=1" : ""}`);
      // No router.refresh() here: calling refresh immediately after push can
      // cancel the navigation in Next 14, leaving the user on /matches/new.
    } catch (err) {
      logError("create.match", err);
      setError(isOffline() ? ERROR_NETWORK : ERROR_CREATE_MATCH);
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader className="gap-3 border-b border-slate-100 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl text-slate-900">Susun pertandingan</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              Atur format, pemain, dan jadwal dalam satu alur.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-600">
              {categoryName}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-700">
              {formProgress}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-5">


          {inviteUserId && (
            <div className="flex items-start gap-3 rounded-2xl border border-matchpoin-tennis/40 bg-matchpoin-tennis/15 p-4 text-sm text-matchpoin-navy">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/70">
                <UserPlus className="h-4 w-4" />
              </div>
              <div>
                <p className="font-bold">Undangan siap dikirim</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                  {isDoubles
                    ? `${inviteName || "Pemain ini"} sudah dipilih sebagai lawan utama Team B. Lengkapi partner Host dan partner lawan.`
                    : `${inviteName || "Pemain ini"} akan diundang setelah pertandingan dibuat.`}
                </p>
              </div>
            </div>
          )}

          {notice && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
              {notice}
            </div>
          )}

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="title">Judul Pertandingan</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={isDoubles ? "Contoh: Ganda Putra Sore di Unhas" : "Contoh: Tunggal Putra Sore di Unhas"}
                required
                disabled={isSubmitting}
                maxLength={100}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">Level Pemain</Label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                disabled={isSubmitting}
              >
                {RATING_TIER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <Label id="category-label">Kategori</Label>
              <span className="text-[11px] text-slate-400">Pilih format pertandingan</span>
            </div>
            <div className="grid gap-2 sm:grid-cols-5" role="group" aria-labelledby="category-label">
              {(Object.keys(MATCH_CATEGORY_LABELS) as MatchCategory[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleCategoryChange(key)}
                  disabled={isSubmitting}
                  className={`min-h-16 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all ${
                    category === key
                      ? "border-matchpoin-navy bg-matchpoin-navy text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide opacity-60">{key.includes("doubles") ? "Ganda" : "Tunggal"}</span>
                  {MATCH_CATEGORY_LABELS[key].split(" (")[0]}
                </button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500">
              {isDoubles ? "Format ganda membutuhkan 4 pemain: 2 pemain di Team A dan 2 pemain di Team B." : "Format tunggal membutuhkan 2 pemain."}
            </p>
          </div>

          {!isDoubles && !isAdmin && (
            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <div>
                <p className="text-sm font-bold text-slate-900">Susunan pemain tunggal</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  Pertandingan tunggal dimainkan 1 vs 1. Anda berada di sisi A, lawan di sisi B.
                  Pada mode Open Match, slot lawan dibiarkan terbuka untuk pemain lain.
                </p>
              </div>
              <div className="space-y-3">
                <Label className="text-xs font-semibold text-slate-700">Mode Lawan</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { id: "private", label: "Pilih Lawan", desc: "Tentukan lawan sekarang" },
                    { id: "open", label: "Open Match", desc: "Pemain lain bisa bergabung" },
                  ] as { id: MatchType; label: string; desc: string }[]).map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setSinglesMode(mode.id);
                        if (mode.id === "open") setOpponentUserId("");
                      }}
                      disabled={isSubmitting}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                        singlesMode === mode.id
                          ? "border-matchpoin-navy bg-matchpoin-navy/[0.05] text-matchpoin-navy shadow-sm"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <span className="text-xs font-bold">{mode.label}</span>
                      <span className="text-[10px] text-slate-400">{mode.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {singlesMode === "private" ? (
                <div className="space-y-2">
                  <Label htmlFor="singlesOpponent">Lawan</Label>
                  <select
                    id="singlesOpponent"
                    value={opponentUserId}
                    onChange={(event) => handleOpponentChange(event.target.value)}
                    disabled={isSubmitting || opponentsLoading}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="">
                      {opponentsLoading ? "Memuat pemain..." : "Pilih lawan"}
                    </option>
                    {opponentOptions.map((player) => (
                      <option key={player.user_id} value={player.user_id}>
                        {player.display_name}
                      </option>
                    ))}
                  </select>
                  {inviteName && inviteUserId && opponentUserId === inviteUserId ? (
                    <p className="text-[11px] text-emerald-700">
                      {inviteName} sudah dipilih sebagai lawan dari halaman profil.
                    </p>
                  ) : (
                    <p className="text-[11px] text-slate-500">
                      Pilih pemain yang sudah memiliki profil publik di MATCHPOIN.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  <p className="font-semibold">Slot lawan terbuka</p>
                  <p className="mt-1 leading-relaxed">
                    Pertandingan tampil sebagai Open Match. Pemain lain dapat bergabung
                    mengambil slot lawan. Anda tidak dapat bergabung ke match sendiri.
                  </p>
                </div>
              )}
            </div>
          )}

          {isDoubles && !isAdmin && (
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Susunan pemain ganda</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Host selalu berada di Team A. Lawan utama selalu berada di Team B.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                  4 pemain · 2 vs 2
                </span>
              </div>

              <div className="space-y-3">
                <Label htmlFor="matchType" className="text-xs font-semibold text-slate-700">Tipe Partai Ganda</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([
                    { id: "open", label: "Terbuka", desc: "Slot lawan terbuka untuk siapa pun" },
                    { id: "private", label: "Privat", desc: "Tentukan sendiri 4 pemain" },
                  ] as { id: MatchType; label: string; desc: string }[]).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setMatchType(t.id)}
                      disabled={isSubmitting}
                      className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition-all ${
                        matchType === t.id
                          ? `border-matchpoin-navy bg-matchpoin-navy/[0.05] text-matchpoin-navy shadow-sm`
                          : `border-slate-200 bg-white text-slate-600 hover:border-slate-300`
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold">{t.label}</span>
                        <span className="text-[10px] text-slate-400">{t.desc}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {matchType === "private" ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-stretch">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-matchpoin-navy text-xs font-bold text-white">A</span>
                      <div>
                        <p className="text-sm font-bold text-slate-900">Team A · Host Side</p>
                        <p className="text-[11px] text-slate-500">Penyelenggara dan pasangannya</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-emerald-700">{partnerUserId ? "2/2" : "1/2"}</span>
                  </div>

                  <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Host / Organizer</p>
                    <p className="mt-1 truncate text-sm font-semibold text-slate-800">Anda</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="partnerUserId" className="text-xs text-slate-600">Partner Host</Label>
                    <select
                      id="partnerUserId"
                      value={partnerUserId}
                      onChange={(event) => setPartnerUserId(event.target.value)}
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                      disabled={isSubmitting || partnersLoading}
                      required={isDoubles}
                    >
                      <option value="">{partnersLoading ? "Memuat pemain..." : "Pilih partner Host"}</option>
                      {partnerOptions.map((player) => (
                        <option key={player.user_id} value={player.user_id}>{player.display_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {matchType === "private" && (
                  <>
                    <div className="hidden items-center justify-center lg:flex">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-xs font-extrabold text-slate-400 shadow-sm">VS</div>
                    </div>

                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-matchpoin-tennis text-xs font-bold text-matchpoin-navy">B</span>
                          <div>
                            <p className="text-sm font-bold text-slate-900">Team B · Opponent Side</p>
                            <p className="text-[11px] text-slate-500">Lawan dan pasangannya</p>
                          </div>
                        </div>
                        <span className="text-[11px] font-semibold text-emerald-700">{(opponentUserId ? 1 : 0) + (opponentPartnerUserId ? 1 : 0)}/2</span>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="opponentUserId" className="text-xs text-slate-600">Opponent</Label>
                        <select
                          id="opponentUserId"
                          value={opponentUserId}
                          onChange={(event) => handleOpponentChange(event.target.value)}
                          className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                          disabled={isSubmitting || opponentsLoading}
                          required={isDoubles}
                        >
                          <option value="">{opponentsLoading ? "Memuat pemain..." : "Pilih lawan utama"}</option>
                          {opponentOptions.map((player) => (
                            <option key={player.user_id} value={player.user_id}>{player.display_name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="opponentPartnerUserId" className="text-xs text-slate-600">Partner Lawan</Label>
                        <select
                          id="opponentPartnerUserId"
                          value={opponentPartnerUserId}
                          onChange={(event) => setOpponentPartnerUserId(event.target.value)}
                          className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                          disabled={isSubmitting || opponentsLoading}
                          required={isDoubles}
                        >
                          <option value="">{opponentsLoading ? "Memuat pemain..." : "Pilih partner lawan"}</option>
                          {opponentPartnerOptions.map((player) => (
                            <option key={player.user_id} value={player.user_id}>{player.display_name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}
              </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-slate-900">4 slot · 2 vs 2</p>
                      <p className="text-[11px] text-slate-500">
                        Slot 1 sudah Anda tempati. Tiga slot lain dibuka untuk pemain lain.
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-matchpoin-navy">1/4 terisi</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      { slot: 1, team: "A", label: "Host / Organizer", value: "Anda", filled: true },
                      { slot: 2, team: "A", label: "Partner Host", value: "Terbuka", filled: false },
                      { slot: 3, team: "B", label: "Challenger", value: "Terbuka", filled: false },
                      { slot: 4, team: "B", label: "Partner Challenger", value: "Terbuka", filled: false },
                    ].map((s) => (
                      <div
                        key={s.slot}
                        className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 ${
                          s.filled ? "border-emerald-200 bg-emerald-50/70" : "border-dashed border-slate-300 bg-slate-50"
                        }`}
                      >
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold ${
                            s.filled ? "bg-matchpoin-navy text-white" : "bg-white text-slate-400 ring-1 ring-slate-200"
                          }`}
                        >
                          {s.slot}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-slate-800">
                            {s.value}
                            <span className="ml-1 font-normal text-slate-400">· Team {s.team}</span>
                          </p>
                          <p className="truncate text-[10px] text-slate-500">{s.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                {matchType === "private" ? (
                  <>
                    <span className={`inline-flex items-center gap-1 ${partnerUserId ? "text-emerald-700" : "text-slate-400"}`}>
                      <Check className="h-3 w-3" /> Partner Host
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className={`inline-flex items-center gap-1 ${opponentUserId ? "text-emerald-700" : "text-slate-400"}`}>
                      <Check className="h-3 w-3" /> Lawan utama
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className={`inline-flex items-center gap-1 ${opponentPartnerUserId ? "text-emerald-700" : "text-slate-400"}`}>
                      <Check className="h-3 w-3" /> Partner lawan
                    </span>
                    <span className="ml-auto">Pemain yang sudah dipilih tidak muncul di dropdown lain.</span>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <Check className="h-3 w-3" /> Host
                    </span>
                    <span className="text-slate-300">·</span>
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Check className="h-3 w-3" /> 3 slot terbuka
                    </span>
                    <span className="ml-auto">Pemain lain dapat bergabung lewat halaman pertandingan.</span>
                  </>
                )}
              </div>
            </div>
          )}

          {isAdmin && (
            <div className="space-y-4 rounded-2xl border border-matchpoin-navy/30 bg-matchpoin-navy/[0.03] p-4 sm:p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold text-slate-900">Susunan tim (Admin)</p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    Pilih pemain Team A dan lawan Team B. Skor bersifat opsional dan bisa langsung
                    disimpan saat pertandingan dibuat.
                  </p>
                </div>
                <span className="inline-flex w-fit items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-600">
                  {isDoubles ? "4 pemain · 2 vs 2" : "2 pemain · 1 vs 1"}
                </span>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-matchpoin-navy text-xs font-bold text-white">
                      A
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Team A</p>
                      <p className="text-[11px] text-slate-500">
                        {isDoubles ? "Kapten dan partner" : "Pemain Team A"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="teamACaptain" className="text-xs text-slate-600">
                      {isDoubles ? "Kapten Team A" : "Pemain Team A"}
                    </Label>
                    <select
                      id="teamACaptain"
                      value={teamACaptainUserId}
                      onChange={(event) => handleTeamACaptainChange(event.target.value)}
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                      disabled={isSubmitting || opponentsLoading}
                    >
                      <option value="">
                        {opponentsLoading ? "Memuat pemain..." : "Pilih pemain Team A"}
                      </option>
                      {teamACaptainOptions.map((player) => (
                        <option key={player.user_id} value={player.user_id}>
                          {player.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isDoubles && (
                    <div className="space-y-2">
                      <Label htmlFor="teamAPartner" className="text-xs text-slate-600">
                        Partner Team A
                      </Label>
                      <select
                        id="teamAPartner"
                        value={partnerUserId}
                        onChange={(event) => setPartnerUserId(event.target.value)}
                        className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                        disabled={isSubmitting || partnersLoading}
                      >
                        <option value="">
                          {partnersLoading ? "Memuat pemain..." : "Pilih partner Team A"}
                        </option>
                        {partnerOptions.map((player) => (
                          <option key={player.user_id} value={player.user_id}>
                            {player.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-matchpoin-tennis text-xs font-bold text-matchpoin-navy">
                      B
                    </span>
                    <div>
                      <p className="text-sm font-bold text-slate-900">Team B</p>
                      <p className="text-[11px] text-slate-500">
                        {isDoubles ? "Kapten dan partner" : "Pemain Team B"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="teamBCaptain" className="text-xs text-slate-600">
                      {isDoubles ? "Kapten Team B" : "Pemain Team B"}
                    </Label>
                    <select
                      id="teamBCaptain"
                      value={opponentUserId}
                      onChange={(event) => handleOpponentChange(event.target.value)}
                      className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                      disabled={isSubmitting || opponentsLoading}
                    >
                      <option value="">
                        {opponentsLoading ? "Memuat pemain..." : "Pilih pemain Team B"}
                      </option>
                      {opponentOptions.map((player) => (
                        <option key={player.user_id} value={player.user_id}>
                          {player.display_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isDoubles && (
                    <div className="space-y-2">
                      <Label htmlFor="teamBPartner" className="text-xs text-slate-600">
                        Partner Team B
                      </Label>
                      <select
                        id="teamBPartner"
                        value={opponentPartnerUserId}
                        onChange={(event) => setOpponentPartnerUserId(event.target.value)}
                        className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                        disabled={isSubmitting || opponentsLoading}
                      >
                        <option value="">
                          {opponentsLoading ? "Memuat pemain..." : "Pilih partner Team B"}
                        </option>
                        {opponentPartnerOptions.map((player) => (
                          <option key={player.user_id} value={player.user_id}>
                            {player.display_name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-2">
                  <Trophy className="mt-0.5 h-4 w-4 text-matchpoin-tennis" />
                  <div>
                    <p className="text-sm font-bold text-slate-900">Skor akhir (opsional)</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                      Isi skor untuk langsung menyimpan hasil dan memperbarui rating. Kosongkan
                      keduanya bila hasil belum diketahui.
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="team1Score" className="text-xs text-slate-600">
                      Skor Team A
                    </Label>
                    <Input
                      id="team1Score"
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={team1Score}
                      onChange={(event) => setTeam1Score(event.target.value)}
                      placeholder="Contoh: 8"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="team2Score" className="text-xs text-slate-600">
                      Skor Team B
                    </Label>
                    <Input
                      id="team2Score"
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={team2Score}
                      onChange={(event) => setTeam2Score(event.target.value)}
                      placeholder="Contoh: 6"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                {team1Score !== "" && team2Score !== "" && Number(team1Score) === Number(team2Score) && (
                  <p className="mt-2 text-[11px] text-rose-600">
                    Pertandingan tenis tidak boleh berakhir seri.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="mb-4 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-matchpoin-tennis" />
              <div>
                <p className="text-sm font-bold text-slate-900">Lokasi &amp; jadwal</p>
                <p className="text-[11px] text-slate-500">Tentukan tempat dan waktu pertandingan.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="courtName">Lapangan</Label>
                <Input
                  id="courtName"
                  value={courtName}
                  onChange={(e) => setCourtName(e.target.value)}
                  placeholder="Ketik nama lapangan secara manual"
                  required
                  disabled={isSubmitting}
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="province">Provinsi</Label>
                <select
                  id="province"
                  value={province}
                  onChange={(event) => {
                    setProvince(event.target.value);
                    setCityName("");
                  }}
                  disabled={isSubmitting}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                >
                  <option value="">Pilih provinsi</option>
                  {provinceOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cityName">Kota / Kabupaten</Label>
                <select
                  id="cityName"
                  value={cityName}
                  onChange={(event) => setCityName(event.target.value)}
                  disabled={isSubmitting || !province}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:border-matchpoin-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                >
                  <option value="">Pilih kota / kabupaten</option>
                  {cityOptions.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="matchDate">Tanggal</Label>
                <Input
                  id="matchDate"
                  type="date"
                  value={matchDate}
                  min={today}
                  onChange={(event) => setMatchDate(event.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="startTime">Jam mulai</Label>
                <Input
                  id="startTime"
                  type="time"
                  value={startTime}
                  onChange={(event) => setStartTime(event.target.value)}
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration">Durasi</Label>
                <div className="relative">
                  <Input
                    id="duration"
                    type="number"
                    min={30}
                    max={300}
                    step={15}
                    value={durationMinutes}
                    onChange={(event) => setDurationMinutes(Number(event.target.value))}
                    disabled={isSubmitting}
                    className="pr-14"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">menit</span>
                </div>
                {matchDate && startTime && (
                  <p className="text-xs text-slate-500">
                    Perkiraan selesai:{" "}
                    <span className="font-medium text-slate-700">
                      {(() => {
                        const start = toPlatformIsoString(matchDate, startTime);
                        if (!start) return "—";
                        const end = new Date(new Date(start).getTime() + durationMinutes * 60 * 1000);
                        return end.toLocaleTimeString("id-ID", {
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        });
                      })()}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Wasit</Label>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "tanpa_wasit", label: "Tanpa wasit" },
                      { value: "dengan_wasit", label: "Dengan wasit" },
                    ] as { value: UmpirePreference; label: string }[]
                  ).map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setUmpireOption(option.value)}
                      disabled={isSubmitting}
                      className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition-all ${
                        umpireOption === option.value
                          ? "border-matchpoin-navy bg-matchpoin-navy text-white"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reclubLink">Link Reclub <span className="font-normal text-slate-400">(opsional)</span></Label>
                <Input
                  id="reclubLink"
                  type="url"
                  value={reclubLink}
                  onChange={(event) => setReclubLink(event.target.value)}
                  placeholder="https://reclub.id/..."
                  disabled={isSubmitting}
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="description">Catatan <span className="font-normal text-slate-400">(opsional)</span></Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Aturan khusus, target rating, atau informasi tambahan..."
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-matchpoin-navy">
                <Trophy className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900">Aturan pertandingan</p>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <p><span className="font-semibold text-slate-800">Game scoring:</span> 15–30–40–Game.</p>
                  <p><span className="font-semibold text-slate-800">No deuce:</span> poin berikutnya menentukan game.</p>
                  <p><span className="font-semibold text-slate-800">Format:</span> Race to {RACE_TO_SCORE} poin.</p>
                  <p><span className="font-semibold text-slate-800">Court change:</span> saat {COURT_SWITCH_AT} poin.</p>
                </div>
              </div>
            </div>
          </div>

          <LoadingOverlay isBusy={isSubmitting} message="Menyimpan pertandingan..." />

          <div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] leading-relaxed text-slate-500">
              {isAdmin
                ? adminFilledSlots < (isDoubles ? 4 : 2)
                  ? `Lengkapi ${(isDoubles ? 4 : 2) - adminFilledSlots} slot pemain lagi.`
                  : "Skor opsional: isi untuk langsung menyimpan hasil dan memperbarui rating."
                : isDoubles && matchType === "private" && requiredDoublesPlayers < 3
                  ? `Lengkapi ${3 - requiredDoublesPlayers} pemain lagi untuk membuat match ganda privat.`
                  : isDoubles && matchType === "open"
                    ? "Match ganda terbuka: 3 slot akan dibuka untuk pemain lain."
                    : !isDoubles && singlesMode === "open"
                      ? "Match tunggal terbuka: slot lawan menunggu pemain lain bergabung."
                      : !isDoubles && !opponentUserId
                        ? "Pilih lawan untuk membuat pertandingan tunggal 1 vs 1."
                        : "Semua data utama sudah siap. Periksa kembali sebelum menyimpan."}
            </p>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="tennis"
                disabled={
                  isSubmitting ||
                  !province ||
                  !cityName ||
                  !courtName.trim() ||
                  (isAdmin
                    ? adminFilledSlots < (isDoubles ? 4 : 2) ||
                      (team1Score !== "") !== (team2Score !== "") ||
                      (team1Score !== "" && Number(team1Score) === Number(team2Score))
                    : (!isDoubles && singlesMode === "private" && !opponentUserId) ||
                      (isDoubles &&
                        matchType === "private" &&
                        (!partnerUserId || !opponentUserId || !opponentPartnerUserId)))
                }
                className="w-full text-matchpoin-navy font-bold gap-2 sm:w-auto"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <CalendarPlus className="w-4 h-4" />
                    {isAdmin
                      ? team1Score !== "" && team2Score !== ""
                        ? "Buat & Simpan Skor"
                        : "Buat Pertandingan"
                      : isDoubles
                        ? "Buat Match Ganda"
                        : singlesMode === "open"
                          ? "Buat Open Match"
                          : "Buat Pertandingan"}
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>

    </Card>
  );
}