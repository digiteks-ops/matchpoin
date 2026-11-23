import React from "react";
import Link from "next/link";
import { requirePageRole } from "@/lib/auth/guards";
import { ShieldCheck, LayoutDashboard, Trophy, Settings, ArrowLeft, PlusCircle, FlaskConical } from "lucide-react";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Server-side gate for the whole admin area. Every admin page also calls
  // requirePageRole, so a missing guard in a child still cannot leak data.
  await requirePageRole("admin", "/admin");

  const navItems = [
    { href: "/admin", label: "Ringkasan", icon: LayoutDashboard },
    { href: "/admin/tournaments", label: "Turnamen", icon: Trophy },
    { href: "/admin/simulasi", label: "Simulasi", icon: FlaskConical },
    { href: "/matches/new", label: "Buat Match", icon: PlusCircle },
    { href: "/admin/settings", label: "Pengaturan", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <header className="border-b border-slate-800 bg-matchpoin-navy text-white">
        <div className="container mx-auto flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-matchpoin-tennis" />
            <span className="font-heading text-lg font-extrabold">MatchPoin Admin</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-matchpoin-tennis">
              Area Admin
            </span>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-200 hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Lihat situs pemain
          </Link>
        </div>
        <nav className="container mx-auto flex gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
