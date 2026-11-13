import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center p-6 bg-slate-50">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
        <div className="text-6xl font-extrabold font-heading text-matchpoin-navy tracking-tight">
          404
        </div>
        <h2 className="text-xl font-bold font-heading text-slate-900">
          Halaman Tidak Ditemukan
        </h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Halaman yang Anda tuju mungkin telah dipindahkan, dihapus, atau alamat URL yang Anda masukkan tidak tepat.
        </p>
        <div className="pt-2 flex justify-center gap-3">
          <Link href="/">
            <Button variant="tennis" size="sm" className="text-matchpoin-navy font-bold gap-1.5">
              <Home className="w-3.5 h-3.5" />
              Kembali ke Beranda
            </Button>
          </Link>
          <Link href="/players">
            <Button variant="outline" size="sm">
              Cari Pemain
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
