"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  assertValidImageFile,
  compressImage,
  formatFileSize,
} from "@/lib/utils/image";
import {
  MATCH_CATEGORY_LABELS,
  VALID_CATEGORIES,
  type MatchCategory,
} from "@/lib/matches/constants";
import { AlertCircle, Camera, CheckCircle2, Loader2, Trophy, Users, X } from "lucide-react";

export interface HostRecordCandidate {
  userId: string;
  name: string;
}

interface HostRecordMatchFormProps {
  hostId: string;
  candidates: HostRecordCandidate[];
}

const MAX_PHOTOS = 4;
const RACE_TO = 8;

function resizeSlots(slots: string[], size: number): string[] {
  return Array.from({ length: size }, (_, index) => slots[index] ?? "");
}

function todayValue(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

export function HostRecordMatchForm({ hostId, candidates }: HostRecordMatchFormProps) {
  const router = useRouter();
  const busyRef = useRef(false);
  const previewsRef = useRef<string[]>([]);
  const [matchDate, setMatchDate] = useState(todayValue);
  const [category, setCategory] = useState<MatchCategory>("mens_singles");
  const [team1, setTeam1] = useState<string[]>([""]);
  const [team2, setTeam2] = useState<string[]>([""]);
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const playersPerTeam = category.includes("singles") ? 1 : 2;

  useEffect(() => {
    setTeam1((current) => resizeSlots(current, playersPerTeam));
    setTeam2((current) => resizeSlots(current, playersPerTeam));
  }, [playersPerTeam]);

  useEffect(() => {
    return () => {
      previewsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const nameOf = useMemo(() => {
    const map = new Map(candidates.map((candidate) => [candidate.userId, candidate.name]));
    return (userId: string) => map.get(userId) || "Pemain";
  }, [candidates]);

  const optionsFor = (team: 1 | 2, slotIndex: number): HostRecordCandidate[] => {
    const team2Offset = team1.length;
    const otherSelected = [...team1, ...team2].filter(
      (value, index) =>
        value && !(team === 1 ? index === slotIndex : index === team2Offset + slotIndex)
    );
    return candidates.filter((candidate) => {
      if (team === 2 && candidate.userId === hostId) return false;
      return !otherSelected.includes(candidate.userId);
    });
  };

  const updateTeam = (team: 1 | 2, slotIndex: number, value: string) => {
    const setter = team === 1 ? setTeam1 : setTeam2;
    setter((current) => current.map((slot, index) => (index === slotIndex ? value : slot)));
  };

  const numericTeam1 = Number(team1Score);
  const numericTeam2 = Number(team2Score);
  const hasScore =
    team1Score !== "" &&
    team2Score !== "" &&
    Number.isInteger(numericTeam1) &&
    Number.isInteger(numericTeam2) &&
    numericTeam1 !== numericTeam2;
  const winnerTeam: 1 | 2 | null = hasScore
    ? numericTeam1 > numericTeam2
      ? 1
      : 2
    : null;

  const addPhotos = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);
    const remaining = MAX_PHOTOS - photos.length;
    if (remaining <= 0) {
      setError(`Maksimal ${MAX_PHOTOS} foto.`);
      return;
    }

    const next = [...photos];
    for (const file of Array.from(files).slice(0, remaining)) {
      try {
        assertValidImageFile(file);
        next.push({ file, preview: URL.createObjectURL(file) });
        previewsRef.current.push(next[next.length - 1].preview);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Foto tidak valid.");
        break;
      }
    }
    setPhotos(next);
  };

  const removePhoto = (preview: string) => {
    URL.revokeObjectURL(preview);
    previewsRef.current = previewsRef.current.filter((url) => url !== preview);
    setPhotos((current) => current.filter((photo) => photo.preview !== preview));
  };

  const validate = (): string | null => {
    if (!matchDate) return "Tanggal pertandingan wajib diisi.";
    if (matchDate > todayValue()) return "Tanggal pertandingan tidak boleh di masa depan.";
    if (team1.some((player) => !player) || team2.some((player) => !player)) {
      return "Lengkapi semua pemain di kedua tim.";
    }
    const allPlayers = [...team1, ...team2];
    if (new Set(allPlayers).size !== allPlayers.length) {
      return "Setiap pemain hanya boleh mengisi satu posisi.";
    }
    if (allPlayers.includes(hostId) && !team1.includes(hostId)) {
      return "Host yang ikut bermain harus berada di Tim 1.";
    }
    if (!hasScore) return "Skor akhir wajib diisi dan tidak boleh seri.";
    if (Math.max(numericTeam1, numericTeam2) !== RACE_TO) {
      return `Format Race to ${RACE_TO}: pemenang harus mencapai ${RACE_TO} poin.`;
    }
    return null;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busyRef.current) return;

    setError(null);
    setNotice(null);
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    busyRef.current = true;
    setIsSubmitting(true);
    try {
      const compressed: File[] = [];
      for (let index = 0; index < photos.length; index += 1) {
        setProgress(`Mengompres foto ${index + 1} dari ${photos.length}...`);
        compressed.push(
          await compressImage(photos[index].file, {
            maxBytes: 300 * 1024,
            maxDimension: 1280,
            quality: 0.8,
            mimeType: "image/webp",
          })
        );
      }

      setProgress("Menyimpan hasil pertandingan...");
      const form = new FormData();
      form.append("matchDate", matchDate);
      form.append("category", category);
      form.append("team1", JSON.stringify(team1));
      form.append("team2", JSON.stringify(team2));
      form.append("team1Score", String(numericTeam1));
      form.append("team2Score", String(numericTeam2));
      form.append("winnerTeam", String(winnerTeam));
      compressed.forEach((file, index) => {
        form.append("photos", file, `hasil-${index + 1}.webp`);
      });

      const response = await fetch("/api/host/matches", { method: "POST", body: form });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string; matchId?: string }
        | null;

      if (!response.ok || !payload?.success || !payload.matchId) {
        throw new Error(payload?.message || "Hasil pertandingan gagal dicatat.");
      }

      setNotice(payload.message || "Hasil pertandingan dicatat.");
      router.push(`/matches/${payload.matchId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hasil pertandingan gagal dicatat.");
    } finally {
      busyRef.current = false;
      setIsSubmitting(false);
      setProgress(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base">Detail Pertandingan</CardTitle>
          <CardDescription className="text-xs">
            Catat pertandingan yang sudah selesai. Hasil akan menunggu konfirmasi pemain selama 24 jam.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="matchDate">Tanggal Pertandingan</Label>
            <Input
              id="matchDate"
              type="date"
              value={matchDate}
              max={todayValue()}
              onChange={(event) => setMatchDate(event.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="category">Kategori</Label>
            <select
              id="category"
              value={category}
              onChange={(event) => setCategory(event.target.value as MatchCategory)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
            >
              {VALID_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {MATCH_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-400">
              {playersPerTeam === 1 ? "Singles: 1 pemain per tim." : "Doubles: 2 pemain per tim."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {([1, 2] as const).map((team) => {
          const slots = team === 1 ? team1 : team2;
          const options = optionsFor(team, 0);
          return (
            <Card key={team} className="border-slate-200">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-matchpoin-tennis" />
                  Tim {team}
                  {team === 1 && <Badge variant="secondary" className="text-[10px]">Host</Badge>}
                </CardTitle>
                <CardDescription className="text-xs">
                  {team === 1 ? "Tim sisi host." : "Tim lawan."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {slots.map((selected, slotIndex) => (
                  <div key={`${team}-${slotIndex}`} className="space-y-1.5">
                    <Label htmlFor={`team${team}-slot${slotIndex}`}>
                      Pemain {slotIndex + 1}
                    </Label>
                    <select
                      id={`team${team}-slot${slotIndex}`}
                      value={selected}
                      onChange={(event) => updateTeam(team, slotIndex, event.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm"
                      required
                    >
                      <option value="">Pilih pemain</option>
                      {(slotIndex === 0 ? options : optionsFor(team, slotIndex)).map((candidate) => (
                        <option key={candidate.userId} value={candidate.userId}>
                          {candidate.name}
                          {candidate.userId === hostId ? " (Anda)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {options.length === 0 && (
                  <p className="text-[10px] text-amber-600">
                    Anggota komunitas belum cukup untuk tim ini.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="h-4 w-4 text-matchpoin-tennis" />
            Skor Akhir
          </CardTitle>
          <CardDescription className="text-xs">
            Format Race to {RACE_TO}. Pemenang ditentukan dari skor.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="team1Score">Skor Tim 1</Label>
              <Input
                id="team1Score"
                type="number"
                min={0}
                max={RACE_TO}
                value={team1Score}
                onChange={(event) => setTeam1Score(event.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="team2Score">Skor Tim 2</Label>
              <Input
                id="team2Score"
                type="number"
                min={0}
                max={RACE_TO}
                value={team2Score}
                onChange={(event) => setTeam2Score(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs">
            {winnerTeam ? (
              <p className="flex items-center gap-1.5 font-semibold text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Pemenang: Tim {winnerTeam} (
                {(winnerTeam === 1 ? team1 : team2).map(nameOf).join(" & ")})
              </p>
            ) : (
              <p className="text-slate-500">Isi skor untuk melihat pemenang.</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-matchpoin-tennis" />
            Foto Bukti (Opsional)
          </CardTitle>
          <CardDescription className="text-xs">
            Maksimal {MAX_PHOTOS} foto, dikompres otomatis ≤ {formatFileSize(300 * 1024)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {photos.map((photo) => (
              <div
                key={photo.preview}
                className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.preview}
                  alt="Pratinjau foto pertandingan"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(photo.preview)}
                  className="absolute right-1 top-1 rounded-full bg-slate-900/70 p-0.5 text-white"
                  aria-label="Hapus foto"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:bg-slate-100">
                <Camera className="h-4 w-4" />
                <span className="text-[9px] font-semibold">Tambah</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(event) => {
                    addPhotos(event.target.files);
                    event.target.value = "";
                  }}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <p className="text-[10px] text-slate-400">
            Foto tidak wajib. Bukti membantu bila hasil disanggah.
          </p>
        </CardContent>
      </Card>

      {error && (
        <p className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">
          {notice}
        </p>
      )}
      {progress && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {progress}
        </p>
      )}

      <Button
        type="submit"
        variant="tennis"
        className="w-full font-bold text-matchpoin-navy"
        disabled={isSubmitting}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Menyimpan...
          </>
        ) : (
          "Simpan Hasil Pertandingan"
        )}
      </Button>
    </form>
  );
}
