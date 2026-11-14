"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, Loader2, CalendarPlus, RotateCcw, Trophy } from "lucide-react";
import { MATCH_CATEGORY_LABELS, type MatchCategory, type UmpirePreference } from "@/lib/matches/constants";
import { ERROR_CREATE_MATCH, ERROR_NETWORK, isOffline, logError } from "@/lib/errors";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { toPlatformIsoString } from "@/lib/utils";

export interface CourtOption {
  id: string;
  name: string;
  address: string;
  cityName: string;
  province: string;
}

interface CreateMatchFormProps {
  courts: CourtOption[];
  inviteUserId?: string;
  inviteName?: string;
}

export function CreateMatchForm({ courts, inviteUserId, inviteName }: CreateMatchFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<MatchCategory>("mens_singles");
  const [courtId, setCourtId] = useState(courts[0]?.id ?? "");
  const [province, setProvince] = useState<string>("");
  const [provinceOptions, setProvinceOptions] = useState<string[]>([]);
  const [matchDate, setMatchDate] = useState("");
  const [startTime, setStartTime] = useState("16:00");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [level, setLevel] = useState("all");
  const [umpireOption, setUmpireOption] = useState<UmpirePreference>("tanpa_wasit");
  const [description, setDescription] = useState("");
  const [reclubLink, setReclubLink] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Aturan liga fix: Race to 8, tukar lapangan di poin 4 (1x)
  const RACE_TO_SCORE = 8;
  const COURT_SWITCH_AT = 4;

  useEffect(() => {
    const provinces = Array.from(new Set(courts.map((c) => c.province).filter(Boolean))).sort();
    setProvinceOptions(provinces);
    if (!province && provinces.length > 0) {
      setProvince(provinces[0]);
      const firstInProvince = courts.find((c) => c.province === provinces[0]);
      if (firstInProvince) setCourtId(firstInProvince.id);
    }
  }, [courts, province]);

  const today = new Date().toISOString().slice(0, 10);

  const filteredCourts = courts.filter((c) => !province || c.province === province);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);

    if (!title.trim()) {
      setError("Judul pertandingan wajib diisi.");
      return;
    }
    if (!courtId) {
      setError("Pilih lapangan terlebih dahulu.");
      return;
    }
    if (!matchDate || !startTime) {
      setError("Tanggal dan jam mulai wajib diisi.");
      return;
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
          courtId,
          matchDate,
          startTime,
          durationMinutes,
          category,
          umpireOption,
          level,
          reclubLink: reclubLink.trim() || undefined,
          raceToScore: RACE_TO_SCORE,
          courtSwitchAt: COURT_SWITCH_AT,
        }),
      });

      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        matchId?: string;
        message?: string;
      };

      if (!res.ok || !json.success || !json.matchId) {
        setError(json.message || ERROR_CREATE_MATCH);
        setIsSubmitting(false);
        return;
      }

      let invited = false;
      if (inviteUserId) {
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
      router.refresh();
    } catch (err) {
      logError("create.match", err);
      setError(isOffline() ? ERROR_NETWORK : ERROR_CREATE_MATCH);
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg">Detail Pertandingan</CardTitle>
        <CardDescription className="text-xs">
          Atur sendiri jadwal, lokasi, dan format permainan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {inviteUserId && (
            <div className="p-3 bg-matchpoin-tennis/20 border border-matchpoin-tennis rounded-lg text-xs text-matchpoin-navy">
              <span className="font-bold">{inviteName || "Pemain ini"}</span> akan diundang otomatis setelah
              pertandingan dibuat.
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

          <div className="space-y-2">
            <Label htmlFor="title">Judul Pertandingan</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Contoh: Duel Tunggal Putra Sore di Unhas"
              required
              disabled={isSubmitting}
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <select
                id="category"
                value={category}
                onChange={(e) => setCategory(e.target.value as MatchCategory)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                disabled={isSubmitting}
              >
                {(Object.keys(MATCH_CATEGORY_LABELS) as MatchCategory[]).map((key) => (
                  <option key={key} value={key}>
                    {MATCH_CATEGORY_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="level">Level Pemain</Label>
              <select
                id="level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                disabled={isSubmitting}
              >
                <option value="all">Semua Level</option>
                <option value="beginner">Pemula</option>
                <option value="intermediate">Menengah</option>
                <option value="advanced">Mahir</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="province">Provinsi</Label>
            <select
              id="province"
              value={province}
              onChange={(e) => {
                const val = e.target.value;
                setProvince(val);
                const firstInProvince = courts.find((c) => c.province === val);
                if (firstInProvince) setCourtId(firstInProvince.id);
              }}
              disabled={isSubmitting}
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
            >
              <option value="">Pilih Provinsi...</option>
              {provinceOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="court">Lapangan</Label>
            <select
              id="court"
              value={courtId}
              onChange={(e) => setCourtId(e.target.value)}
              disabled={isSubmitting || !province || filteredCourts.length === 0}
              className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
            >
              <option value="">Pilih Kota / Lapangan...</option>
              {filteredCourts.map((court) => (
                <option key={court.id} value={court.id}>
                  {court.name} — {court.cityName}
                </option>
              ))}
            </select>
            {province && filteredCourts.length === 0 && (
              <p className="text-[11px] text-amber-700">Belum ada lapangan di provinsi ini.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="matchDate">Tanggal</Label>
              <Input
                id="matchDate"
                type="date"
                value={matchDate}
                min={today}
                onChange={(e) => setMatchDate(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startTime">Jam Mulai</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Durasi (menit)</Label>
              <Input
                id="duration"
                type="number"
                min={30}
                max={300}
                step={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                disabled={isSubmitting}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Wasit</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: "tanpa_wasit", label: "Tanpa Wasit" },
                  { value: "dengan_wasit", label: "Dengan Wasit" },
                ] as { value: UmpirePreference; label: string }[]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setUmpireOption(option.value)}
                  disabled={isSubmitting}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    umpireOption === option.value
                      ? "bg-matchpoin-navy text-white border-matchpoin-navy"
                      : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Catatan (opsional)</Label>
            <Textarea
              id="description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Aturan khusus, target rating, atau info tambahan..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reclubLink">Link Reclub (opsional)</Label>
            <Input
              id="reclubLink"
              type="url"
              value={reclubLink}
              onChange={(e) => setReclubLink(e.target.value)}
              placeholder="https://reclub.id/..."
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-200">
            <Label>Aturan Pertandingan (Liga)</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2">
                  <Trophy className="w-3.5 h-3.5 text-matchpoin-tennis" />
                  <span>Race to {RACE_TO_SCORE}</span>
                </div>
                <p className="text-[10px] text-slate-500">Pemain pertama mencapai {RACE_TO_SCORE} poin menang.</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg p-2">
                  <RotateCcw className="w-3.5 h-3.5 text-matchpoin-navy" />
                  <span>Tukar lapangan di poin {COURT_SWITCH_AT}</span>
                </div>
                <p className="text-[10px] text-slate-500">Saat seseorang mencapai {COURT_SWITCH_AT} poin, sisi lapangan ditukar (1x).</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Aturan ini tidak dapat diubah dan berlaku untuk semua pertandingan liga MATCHPOIN Q1 2027.
            </p>
          </div>

          <LoadingOverlay isBusy={isSubmitting} message="Membuat pertandingan..." />

          <div className="pt-2 flex justify-end">
            <Button type="submit" variant="tennis" disabled={isSubmitting || filteredCourts.length === 0 || !courtId} className="text-matchpoin-navy font-bold gap-2">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Membuat...
                </>
              ) : (
                <>
                  <CalendarPlus className="w-4 h-4" />
                  Buat Pertandingan
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}