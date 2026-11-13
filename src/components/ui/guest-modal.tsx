"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { X, Lock, ArrowRight, ShieldCheck } from "lucide-react";

interface GuestModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  actionText?: string;
  redirectTo?: string;
}

export function GuestModal({
  isOpen,
  onClose,
  title = "Masuk untuk Melanjutkan",
  description = "Aktivitas ini memerlukan akun pemain MATCHPOIN. Daftarkan diri Anda sekarang untuk mulai bertanding.",
  actionText = "Masuk Akun",
  redirectTo = "/dashboard",
}: GuestModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-2xl space-y-5"
        role="dialog"
        aria-modal="true"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 focus:outline-none"
          aria-label="Tutup"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-matchpoin-navy text-matchpoin-tennis flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold font-heading text-slate-900">{title}</h3>
          <p className="text-xs sm:text-sm text-slate-500 leading-relaxed max-w-xs mx-auto">
            {description}
          </p>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3 text-xs text-slate-600">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>Sebagai pemain terdaftar, Anda mendapatkan MATCHPOIN Rating awal dan akses matchmaking penuh.</span>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <Link href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`} className="w-full">
            <Button className="w-full bg-matchpoin-navy text-white hover:bg-matchpoin-navy/90 gap-1.5">
              <span>{actionText}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
          <Link href="/register" className="w-full">
            <Button variant="tennis" className="w-full text-matchpoin-navy font-bold">
              Daftar Pemain Baru (Gratis)
            </Button>
          </Link>
          <button
            onClick={onClose}
            className="text-xs text-slate-400 hover:text-slate-600 font-semibold py-1 transition-colors"
          >
            Lanjutkan Menjelajah Mode Tamu
          </button>
        </div>
      </div>
    </div>
  );
}
