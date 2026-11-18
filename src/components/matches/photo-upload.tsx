"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { compressImageToLimit, formatFileSize } from "@/lib/utils/image";
import { Button } from "@/components/ui/button";
import { Camera, Loader2, X, AlertCircle } from "lucide-react";

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
        const compressed = await compressImageToLimit(selected[i], 1024 * 1024);
        const path = `${userId}/matches/${matchId}/${Date.now()}-${i}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("avatars")
          .upload(path, compressed, {
            cacheControl: "3600",
            upsert: false,
            contentType: "image/jpeg",
          });

        if (uploadError) {
          throw new Error(`Gagal mengunggah ${selected[i].name}: ${uploadError.message}`);
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("avatars").getPublicUrl(path);
        uploaded.push(publicUrl);
      }

      onChange([...value, ...uploaded]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengunggah foto.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-700">
          Foto Bukti Hasil (wajib diunggah, maks. {maxPhotos})
        </span>
        <span className="text-[10px] text-slate-400">Dikompres otomatis ≤ 1 MB</span>
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
              onClick={() => onChange(value.filter((u) => u !== url))}
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
          Mengompres dan mengunggah foto... Maks {formatFileSize(1024 * 1024)} per foto.
        </p>
      )}
    </div>
  );
}