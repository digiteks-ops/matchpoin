"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { MPR_CALIBRATION_MATCHES, MPR_STARTING_RATING } from "@/lib/rating/mpr-core.mjs";
import { AlertCircle, Loader2, Sparkles } from "lucide-react";

/**
 * Konfirmasi rating awal untuk pemain yang mendaftar lewat OAuth (Google).
 *
 * Dulu halaman ini meminta pemain memilih Beginner atau Intermediate. Pilihan
 * itu dihapus: semua pemain baru mulai dari MPR 1000 dan kategori ditentukan
 * otomatis dari hasil pertandingan. Halaman ini sekarang hanya menginformasikan
 * rating awal dan melanjutkan ke tujuan — tidak ada pilihan yang perlu dibuat.
 */
export default function StartingRatingPage() {
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
      <StartingRatingInfo />
    </Suspense>
  );
}

function StartingRatingInfo() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [isChecking, setIsChecking] = useState(true);
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
        if (!cancelled) setIsChecking(false);
      } catch {
        if (!cancelled) setIsChecking(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleContinue = () => {
    setErrorMessage(null);
    const safeNext = next.startsWith("/") ? next : "/dashboard";
    router.replace(safeNext);
    router.refresh();
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
            Akun Anda Siap
          </CardTitle>
          <CardDescription>
            Tidak ada kategori yang perlu dipilih. Semua pemain baru mulai dari rating yang sama.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="flex items-center justify-between text-sm font-bold text-slate-900">
              Rating awal Anda
              <span className="text-matchpoin-navy">MPR {MPR_STARTING_RATING}</span>
            </p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              Kategori Anda — Beginner, Intermediate, Advanced, atau Expert — ditentukan otomatis
              dari rating hasil pertandingan, bukan dari penilaian sendiri.
            </p>
          </div>

          <p className="text-[11px] text-slate-500">
            {MPR_CALIBRATION_MATCHES} pertandingan pertama adalah masa kalibrasi. Rating tetap
            bergerak selama kalibrasi, lalu menjadi ranking resmi setelahnya.
          </p>

          <Button
            type="button"
            variant="tennis"
            className="w-full text-matchpoin-navy font-bold"
            onClick={handleContinue}
          >
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Lanjut ke MATCHPOIN
            </span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}