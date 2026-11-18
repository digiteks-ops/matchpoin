import React from "react";
import Link from "next/link";
import { Logo } from "./logo";
import { MapPin, ShieldCheck, Heart, User, LogIn, UserPlus, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

export async function Footer() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

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
                <Link href="/tournaments" className="hover:text-matchpoin-tennis transition-colors">
                  LIGA TENNIS IKA 17
                </Link>
              </li>
            </ul>
          </div>

          {/* AKUN SAYA - Dynamic based on auth status */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              AKUN SAYA
            </h4>
            {user ? (
              <ul className="space-y-2 text-sm text-slate-300">
                <li>
                  <Link href="/mysql/profile" className="flex items-center gap-2 hover:text-matchpoin-tennis transition-colors">
                    <User className="w-4 h-4" />
                    Profil Saya
                  </Link>
                </li>
                <li>
                  <Link href="/mysql/dashboard" className="flex items-center gap-2 hover:text-matchpoin-tennis transition-colors">
                    <Heart className="w-4 h-4" />
                    Dashboard
                  </Link>
                </li>
                <li>
                  <Link href="/mysql/tournaments" className="flex items-center gap-2 hover:text-matchpoin-tennis transition-colors">
                    <Trophy className="w-4 h-4" />
                    LIGA TENNIS IKA 17
                  </Link>
                </li>
              </ul>
            ) : (
              <div className="space-y-2">
                <Link href="/mysql/auth/login" className="flex items-center gap-2 text-sm text-slate-300 hover:text-matchpoin-tennis transition-colors">
                  <LogIn className="w-4 h-4" />
                  Masuk
                </Link>
                <Link href="/mysql/auth/register" className="flex items-center gap-2 text-sm text-slate-300 hover:text-matchpoin-tennis transition-colors">
                  <UserPlus className="w-4 h-4" />
                  Daftar Gratis
                </Link>
              </div>
            )}
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