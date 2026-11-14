"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingOverlayProps {
  isBusy: boolean;
  message?: string;
}

export function LoadingOverlay({ isBusy, message = "Memproses..." }: LoadingOverlayProps) {
  if (!isBusy) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      role="status"
      aria-label={message}
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white p-6 shadow-xl border border-slate-200">
        <Loader2 className="w-6 h-6 animate-spin text-matchpoin-navy" />
        <span className="text-sm font-medium text-slate-700">{message}</span>
      </div>
    </div>
  );
}
