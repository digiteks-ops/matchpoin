"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { dtrStartingRating } from "@/lib/rating/dtr-core.mjs";
import type { SkillLevel } from "@/types/database.types";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";

// Self rating hanya dua pilihan, sama seperti formulir pendaftaran:
// beginner = rating awal 1000 (langsung tampil di leaderboard),
// intermediate = rating awal 1500 (tampil setelah 3x bertanding).
const LEVELS: { value: SkillLevel; label: string; hint: string }[] = [
  {
    value: "beginner",
    label: "Beginner",
    hint: "Maksimal 2 tahun bermain. Rating awal 1000, langsung tampil di leaderboard.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    hint: "Lebih dari 2 tahun bermain. Rating awal 1500, tampil setelah 3x bertanding.",
  },
];

/**
 * One-time starting category picker, used when an account was created through
 * OAuth (Google) where the registration form never ran.
 */
export default function StartingLevelPage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-matchpoin-navy" />
            <p className="text-sm font-medium">Memuat...</p>
          </div>
        </div>
      }
    >
      <StartingLevelForm />
    </Suspense>
  );
}

function StartingLevelForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  // Wajib dipilih sendiri, tanpa nilai awal.
  const [selected, setSelected] = useState<SkillLevel | null>(null);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/login");
          return;
        }

        const { data: rating } = await supabase
          .from("player_ratings")
          .select("matches_played, starting_rating_set_at")
          .eq("user_id", user.id)
          .maybeSingle();

        // Already decided (or already played): nothing left to choose.
        if (rating?.starting_rating_set_at || (rating?.matches_played ?? 0) > 0) {
          const safeNext = next.startsWith("/") ? next : "/dashboard";
          router.replace(safeNext);
          return;
        }

        if (!cancelled) setIsChecking(false);
      } catch {
        if (!cancelled) setIsChecking(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  const handleSubmit = async () => {
    if (!selected) {
      setErrorMessage("Pilih self rating Anda: Beginner atau Intermediate.");
      return;
    }
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/profile/starting-level", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: selected }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string }
        | null;

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Gagal menyimpan kategori awal.");
      }

      const safeNext = next.startsWith("/") ? next : "/dashboard";
      router.replace(safeNext);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Gagal menyimpan kategori awal.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isChecking) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-matchpoin-navy" />
          <p className="text-sm font-medium">Memeriksa data akun...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <Card className="w-full max-w-lg shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <Logo showText={false} />
          </div>
          <CardTitle className="text-xl font-bold font-heading text-matchpoin-navy">
            Pilih Kategori Awal Anda
          </CardTitle>
          <CardDescription>
            Rating awal DTR ditetapkan sekali dari kategori ini. Setelah bertanding, rating
            bergerak mengikuti hasil pertandingan.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="space-y-2">
            {LEVELS.map((level) => {
              const active = selected === level.value;
              return (
                <button
                  key={level.value}
                  type="button"
                  aria-pressed={active}
                  disabled={isSaving}
                  onClick={() => setSelected(level.value)}
                  className={`w-full rounded-xl border p-3 text-left transition-colors disabled:opacity-60 ${
                    active
                      ? "border-matchpoin-navy bg-matchpoin-navy/5 ring-1 ring-matchpoin-navy"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <span className="flex items-center justify-between text-sm font-bold text-slate-900">
                    {level.label}
                    <span className="text-xs font-semibold text-matchpoin-navy">
                      DTR {dtrStartingRating(level.value)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-slate-500">
                    {level.hint}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500">
            Pilihan ini hanya bisa dilakukan satu kali dan tidak dapat diubah setelah pertandingan
            pertama selesai.
          </p>

          <Button
            type="button"
            variant="tennis"
            className="w-full text-matchpoin-navy font-bold"
            disabled={isSaving}
            onClick={handleSubmit}
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Menyimpan...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Simpan Kategori Awal
              </span>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}