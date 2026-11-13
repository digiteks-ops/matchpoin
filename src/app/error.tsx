"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCcw, Home } from "lucide-react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application error captured:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
        <div className="w-14 h-14 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mx-auto">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold font-heading text-slate-900">
          Gagal memuat data.
        </h2>
        <p className="text-xs text-slate-600">Coba lagi.</p>
        <div className="pt-2 flex justify-center gap-3">
          <Button
            onClick={() => reset()}
            variant="tennis"
            size="sm"
            className="text-matchpoin-navy font-bold gap-1.5"
          >
            <RefreshCcw className="w-3.5 h-3.5" />
            Coba Lagi
          </Button>
          <Link href="/">
            <Button variant="outline" size="sm" className="gap-1.5">
              <Home className="w-3.5 h-3.5" />
              Beranda
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
