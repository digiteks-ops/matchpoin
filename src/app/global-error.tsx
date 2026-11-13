"use client";

import React from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="id">
      <body className="font-sans min-h-screen flex items-center justify-center bg-slate-100 p-6">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center space-y-4">
          <h2 className="text-xl font-bold text-slate-900">
            Koneksi bermasalah.
          </h2>
          <p className="text-xs text-slate-600">
            Periksa internet Anda.
          </p>
          <button
            onClick={() => reset()}
            className="px-4 py-2 bg-[#0B1F44] text-white rounded-lg text-sm font-semibold hover:bg-slate-800 transition"
          >
            Muat Ulang
          </button>
        </div>
      </body>
    </html>
  );
}
