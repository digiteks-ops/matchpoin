"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { NotificationBell } from "@/components/notifications/notification-bell";
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
  Bell,
} from "lucide-react";

export function Navbar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [user, setUser] = useState<{ id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDropdown, setUserDropdown] = useState(false);

  useEffect(() => {
    try {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data: { user } }) => {
        setUser(user ? { id: user.id } : null);
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
    } catch (err) {
      // The server logout route also clears the session cookies, so continue.
      console.error("Gagal logout:", err);
    } finally {
      setUser(null);
      setUserDropdown(false);
      setIsOpen(false);
      // Full navigation so the App Router hits the logout Route Handler; a
      // client-side router.push to a route handler can render a 404.
      window.location.assign("/auth/logout");
    }
  };

  const dashboardHref = "/dashboard";
  const profileHref = "/profile";
  const loginHref = "/login";
  const registerHref = "/register";
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
              <Link href={dashboardHref}>
                <Button
                  variant={pathname === dashboardHref ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 text-slate-700"
                >
                  <LayoutDashboard className="w-4 h-4 text-slate-600" />
                  Dashboard
                </Button>
              </Link>

              <Link href={profileHref}>
                <Button
                  variant={pathname.startsWith(profileHref) ? "secondary" : "ghost"}
                  size="sm"
                  className="gap-2 text-slate-700"
                >
                  <UserIcon className="w-4 h-4 text-slate-600" />
                  Profil
                </Button>
              </Link>

              <NotificationBell />

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
              <Link href={loginHref}>
                <Button variant="ghost" size="sm" className="font-semibold text-slate-700">
                  Masuk
                </Button>
              </Link>
              <Link href={registerHref}>
                <Button variant="tennis" size="sm">
                  Daftar Gratis
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
                <Link href={dashboardHref} onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard Pemain
                  </Button>
                </Link>
                <Link href={profileHref} onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                    <UserIcon className="w-4 h-4" />
                    Profil Pemain Saya
                  </Button>
                </Link>
                <Link href="/notifications" onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full justify-start gap-2 text-sm">
                    <Bell className="w-4 h-4" />
                    Notifikasi
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
                <Link href={loginHref} onClick={() => setIsOpen(false)}>
                  <Button variant="outline" className="w-full text-sm">
                    Masuk
                  </Button>
                </Link>
                <Link href={registerHref} onClick={() => setIsOpen(false)}>
                  <Button variant="tennis" className="w-full text-sm font-bold">
                    Daftar Gratis
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
