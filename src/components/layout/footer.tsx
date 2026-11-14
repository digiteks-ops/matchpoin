import React from "react";
import Link from "next/link";
import { Logo } from "./logo";
import { MapPin, ShieldCheck, Heart } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-matchpoin-navy text-white">
      <div className="container py-12 md:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand Info */}
          <div className="md:col-span-2 space-y-4">
            <Logo variant="dark" />
            <p className="text-slate-300 text-sm max-w-sm leading-relaxed">
              Platform matchmaking dan rating independen komunitas tenis pertama di Makassar, menghubungkan pemain untuk bertanding secara adil, terjadwal, dan kompetitif.
            </p>
            <div className="flex items-center gap-2 text-xs text-matchpoin-tennis font-medium">
              <MapPin className="w-4 h-4" />
              <span>Fokus Peluncuran Awal: Kota Makassar, Sulawesi Selatan</span>
            </div>
          </div>

          {/* Navigasi Utama */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Menu Utama
            </h4>
            <ul className="space-y-2 text-sm text-slate-300">
              <li>
                <Link href="/" className="hover:text-matchpoin-tennis transition-colors">
                  Beranda
                </Link>
              </li>
              <li>
                <Link href="/players" className="hover:text-matchpoin-tennis transition-colors">
                  Cari Pemain (Direktori)
                </Link>
              </li>
              <li>
                <Link href="/leaderboard" className="hover:text-matchpoin-tennis transition-colors">
                  Leaderboard
                </Link>
              </li>
              <li>
                <Link href="/league" className="hover:text-matchpoin-tennis transition-colors">
                  Season 1 League
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-matchpoin-tennis transition-colors">
                  Masuk Akun
                </Link>
              </li>
            </ul>
          </div>

          {/* Prinsip & Rating */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              MATCHPOIN Rating
            </h4>
            <div className="text-sm text-slate-300 space-y-2">
              <p className="text-xs text-slate-400 leading-relaxed">
                Rating independen terukur (1.00 – 10.00+) yang dihitung otomatis berdasarkan hasil pertandingan terverifikasi.
              </p>
              <div className="pt-2 flex items-center gap-2 text-xs text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Sistem Verifikasi Skor Adil</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>
            &copy; {new Date().getFullYear()} MATCHPOIN. Seluruh hak cipta dilindungi.
          </p>
          <div className="flex items-center gap-1">
            <span>Connect. Compete. Improve.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
