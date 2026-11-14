"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import {
  Menu,
  X,
  User as UserIcon,
  LogOut,
  LayoutDashboard,
  Users,
  Settings,
  ChevronDown,
  Trophy,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDropdown, setUserDropdown] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        setUser(user);
        setLoading(false);
      });

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        setUser(session?.user ?? null);
      });

      return () => {
        subscription.unsubscribe();
      };
    } catch {
      setLoading(false);
    }
  }, []);

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      setUserDropdown(false);
      router.push("/");
      router.refresh();
    } catch (err) {
      console.error("Gagal logout:", err);
    }
  };

const navLinks = [
  { href: "/", label: "Beranda" },
  { href: "/players", label: "Cari Pemain", icon: Users },
  { href: "/matches", label: "Pertandingan", icon: LayoutDashboard },
  { href: "/tournaments", label: "Turnamen", icon: Trophy },
  { href: "/leaderboard", label: "Leaderboard", icon: LayoutDashboard },
];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-200/80 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
      <div className="container flex h-16 items-center justify-between">
        {/* Brand Logo */}
        <div className="flex items-center gap-8">
          <Logo />

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-semibold transition-colors hover:text-matchpoin-navy ${
                    isActive
                      ? "text-matchpoin-navy font-bold border-b-2 border-matchpoin-tennis pb-1"
                      : "text-slate-600"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right CTA / Auth Controls */}
        <div className="hidden md:flex items-center gap-3">
          {loading ? (
            <div className="h-9 w-24 animate-pulse rounded-md bg-slate-200" />
          ) : user ? (
            <div className="flex items-center gap-2">
              <Link href="/dashboard">
                <Button
                  variant={pathname === "/dashboard" ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 text-slate-700"
                >
                  <LayoutDashboard className="w-4 h-4 text-slate-600" />
                  Dashboard
                </Button>
              </Link>

              <Link href="/profile">
                <Button
                  variant={pathname.startsWith("/profile") ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 text-slate-700"
                >
                  <UserIcon className="w-4 h-4 text-slate-600" />
                  Profil
                </Button>
              </Link>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5 text-slate-600 hover:text-red-600 hover:bg-red-50 ml-1"
              >
                <LogOut className="w-4 h-4" />
                Keluar
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login">
                <Button variant="ghost" size="sm" className="font-semibold text-slate-700">
                  Masuk
                </Button>
              </Link>
              <Link href="/register">
                <Button variant="tennis" size="sm">
                  Daftar Sekarang
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Mobile Hamburger Button */}
        <div className="flex md:hidden items-center">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-2 text-slate-600 hover:text-slate-900 focus:outline-none"
            aria-label="Buka Menu Navigasi"
          >
            {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="md:hidden border-b border-slate-200 bg-white px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-150">
          <nav className="flex flex-col space-y-2">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold ${
                  pathname === link.href
                    ? "bg-slate-100 text-matchpoin-navy font-bold"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {link.icon && <link.icon className="w-4 h-4 text-slate-500" />}
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="pt-3 border-t border-slate-100 flex flex-col gap-2">
            {user ? (
              <>
                <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard Pemain
                  </Button>
                </Link>
                <Link href="/profile" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                    <UserIcon className="w-4 h-4" />
                    Profil Pemain Saya
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setIsOpen(false);
                    handleLogout();
                  }}
                  className="w-full justify-start gap-2 text-red-600 hover:bg-red-50 hover:text-red-700 text-sm"
                >
                  <LogOut className="w-4 h-4" />
                  Keluar Akun
                </Button>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full text-sm">
                    Masuk
                  </Button>
                </Link>
                <Link href="/register" onClick={() => setIsOpen(false)}>
                  <Button variant="tennis" className="w-full text-sm font-bold">
                    Daftar
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
