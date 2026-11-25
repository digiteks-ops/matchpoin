"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { assertValidImageFile, compressImage, formatFileSize, normalizeImageUrl } from "@/lib/utils/image";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X, AlertCircle } from "lucide-react";

const RESULTS_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_STORAGE_RESULTS_BUCKET || "match-results";

interface PhotoUploadProps {
  matchId: string;
  userId: string;
  value: string[];
  onChange: (urls: string[]) => void;
  maxPhotos?: number;
  disabled?: boolean;
}

export function PhotoUpload({
  matchId,
  userId,
  value,
  onChange,
  maxPhotos = 4,
  disabled = false,
}: PhotoUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;

    const files = Array.from(event.target.files ?? []);
    if (files.length === 0) return;

    setError(null);
    setIsUploading(true);

    try {
      const supabase = createClient();
      const remaining = maxPhotos - value.length;
      if (remaining <= 0) {
        setError(`Maksimal ${maxPhotos} foto.`);
        return;
      }

      const selected = files.slice(0, remaining);
      const uploaded: string[] = [];

      for (let i = 0; i < selected.length; i += 1) {
        const file = selected[i];
        assertValidImageFile(file);

        setProgress(`Mengompres foto ${i + 1} dari ${selected.length}...`);
        const compressed = await compressImage(file, {
          maxBytes: 300 * 1024,
          maxDimension: 1280,
          quality: 0.8,
          mimeType: "image/webp",
        });

        const extension = compressed.type === "image/webp" ? "webp" : "jpg";
        // Folder layout lets storage policies verify match participation.
        const path = `matches/${matchId}/${userId}/${Date.now()}-${i}.${extension}`;

        setProgress(`Mengunggah foto ${i + 1} dari ${selected.length}...`);
        const { error: uploadError } = await supabase.storage
          .from(RESULTS_BUCKET)
          .upload(path, compressed, {
            cacheControl: "3600",
            upsert: false,
            contentType: compressed.type,
          });

        if (uploadError) {
          throw new Error(`Gagal mengunggah ${file.name}: ${uploadError.message}`);
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from(RESULTS_BUCKET).getPublicUrl(path);
        // URL dari getPublicUrl bisa mengandung garis miring ganda, yang ditolak
        // mesin optimasi gambar Next.js. Simpan versi yang sudah dirapikan.
        uploaded.push(normalizeImageUrl(publicUrl));
      }

      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah foto.");
    } finally {
      setIsUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const removePhoto = async (url: string) => {
    onChange(value.filter((u) => u !== url));

    // Best effort: also delete the stored object when the player removes a
    // photo before submitting. Storage failures must not block the UI.
    const marker = `/object/public/${RESULTS_BUCKET}/`;
    const markerIndex = url.indexOf(marker);
    if (markerIndex < 0) return;
    const objectPath = decodeURIComponent(url.slice(markerIndex + marker.length));
    try {
      const supabase = createClient();
      await supabase.storage.from(RESULTS_BUCKET).remove([objectPath]);
    } catch (err) {
      console.warn("Gagal menghapus foto bukti:", err);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">
          Foto Bukti Hasil (wajib diunggah, maks. {maxPhotos})
        </span>
        <span className="text-[10px] text-slate-400">Dikompres otomatis ≤ 300 KB</span>
      </div>

      {value.length === 0 && !isUploading && (
        <p className="text-[11px] text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          Foto bukti hasil pertandingan wajib diunggah sebelum mengirim hasil.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {value.map((url) => (
          <div key={url} className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200">
            <Image
              src={url}
              alt="Foto pertandingan"
              fill
              className="object-cover"
              sizes="80px"
            />
            <button
              type="button"
              onClick={() => removePhoto(url)}
              disabled={disabled}
              className="absolute top-1 right-1 p-0.5 rounded-full bg-slate-900/70 text-white disabled:opacity-50"
              aria-label="Hapus foto"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}

        {value.length < maxPhotos && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading || disabled}
            className="w-20 h-20 rounded-lg border border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center gap-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
            <span className="text-[9px] font-semibold">{isUploading ? "Mengunggah" : "Tambah"}</span>
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handleFiles}
        className="hidden"
      />

      {error && (
        <p className="text-[11px] text-red-600 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </p>
      )}

      {isUploading && (
        <p className="text-[10px] text-slate-400">
          {progress ?? "Mengompres dan mengunggah foto..."} Maks {formatFileSize(300 * 1024)} per foto.
        </p>
      )}
    </div>
  );
}
