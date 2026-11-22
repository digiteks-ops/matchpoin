"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Trophy, Calendar, Clock, AlertTriangle, CheckCircle2, XCircle, Activity, FlaskConical } from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  href?: string;
  color: string;
}

function StatCard({ icon, label, value, href, color }: StatCardProps) {
  return (
    <Card className="border-slate-200 hover:shadow-md transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-600">{label}</CardTitle>
          <div className={`p-2 rounded-lg bg-${color}-100`}>{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-extrabold font-heading text-slate-900">{value}</div>
        {href && (
          <Link href={href} className="mt-2 inline-block text-xs font-semibold text-slate-600 hover:text-matchpoin-navy">
            Lihat detail →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

interface ActivityItem {
  id: string;
  action: string;
  previousStatus: string;
  newStatus: string;
  reason: string | null;
  createdAt: string;
  actor: { id: string; name: string | null; email: string };
  tournamentName: string;
}

interface AdminDashboardClientProps {
  initialStats: {
    totalUsers: number;
    activePlayers: number;
    totalMatches: number;
    totalTournaments: number;
    pendingRegistrations: number;
    confirmedRegistrations: number;
  };
  initialActivity: ActivityItem[];
  errorMessage?: string | null;
  errorDetail?: string | null;
}

export default function AdminDashboardClient({ initialStats, initialActivity, errorMessage = null, errorDetail = null }: AdminDashboardClientProps) {
  const stats = initialStats;
  const activity = initialActivity;

  const getStatusBadge = (action: string) => {
    if (action === "approved") {
      return <Badge variant="success" className="gap-1"><CheckCircle2 className="w-3 h-3" />Disetujui</Badge>;
    }
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />Ditolak</Badge>;
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto space-y-8 px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900">Dasbor Admin</h1>
            <p className="text-slate-600 mt-1 text-sm">Ringkasan operasional platform MATCHPOIN.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/matches/new">
              <Button variant="outline" className="font-bold">
                Buat Pertandingan
              </Button>
            </Link>
            <Link href="/admin/tournaments">
              <Button variant="tennis" className="font-bold text-matchpoin-navy">
                Kelola Persetujuan Turnamen
              </Button>
            </Link>
          </div>
        </div>

        {errorMessage && (
          <div role="alert" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <p className="font-semibold">Data admin belum lengkap.</p>
              <p className="mt-1 text-xs">{errorMessage}</p>
              {errorDetail && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[11px] font-semibold underline">
                    Detail teknis
                  </summary>
                  <p className="mt-1 break-words rounded bg-white/60 p-2 font-mono text-[10px] text-amber-900">
                    {errorDetail}
                  </p>
                </details>
              )}
            </div>
            <Link href="/admin" className="text-xs font-bold underline">
              Muat ulang
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            icon={<Users className="w-5 h-5 text-blue-600" />}
            label="Total Pengguna Terdaftar"
            value={stats.totalUsers}
            href="/admin/settings?tab=users"
            color="blue"
          />
          <StatCard
            icon={<Users className="w-5 h-5 text-emerald-600" />}
            label="Pemain Aktif (Publik)"
            value={stats.activePlayers}
            href="/admin/settings?tab=players"
            color="emerald"
          />
          <StatCard
            icon={<Calendar className="w-5 h-5 text-amber-600" />}
            label="Total Pertandingan"
            value={stats.totalMatches}
            href="/admin/settings?tab=matches"
            color="amber"
          />
          <StatCard
            icon={<Trophy className="w-5 h-5 text-purple-600" />}
            label="Total Turnamen"
            value={stats.totalTournaments}
            href="/admin/settings?tab=tournaments"
            color="purple"
          />
          <StatCard
            icon={<Clock className="w-5 h-5 text-red-600" />}
            label="Pendaftaran Menunggu Persetujuan"
            value={stats.pendingRegistrations}
            href="/admin/tournaments"
            color="red"
          />
          <StatCard
            icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            label="Pendaftaran Disetujui"
            value={stats.confirmedRegistrations}
            href="/admin/tournaments"
            color="emerald"
          />
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-matchpoin-navy" />
              Aktivitas Persetujuan Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-slate-500 text-sm py-4">Belum ada aktivitas persetujuan turnamen.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {activity.map((item) => (
                  <div key={item.id} className="py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {getStatusBadge(item.action)}
                      <div>
                        <p className="font-medium text-slate-900">{item.tournamentName}</p>
                        <p className="text-xs text-slate-500">
                          {item.actor.name || item.actor.email} •{" "}
                          {formatIndonesianDate(item.createdAt, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}{" "}
                          {formatIndonesianTime(item.createdAt)} WITA
                        </p>
                        {item.reason && (
                          <p className="text-xs text-slate-600 mt-1 italic">Alasan: {item.reason}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right sm:text-left">
                      <p className="text-xs text-slate-500">
                        {item.previousStatus === "pending" && item.newStatus === "confirmed"
                          ? "Status: Menunggu → Disetujui"
                          : item.previousStatus === "pending" && item.newStatus === "rejected"
                          ? "Status: Menunggu → Ditolak"
                          : `Status: ${item.previousStatus} → ${item.newStatus}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-matchpoin-navy" />
              Cepat Akses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/admin/settings?tab=users" className="p-4 rounded-xl border border-slate-200 hover:border-matchpoin-tense hover:shadow-sm transition-all text-center">
                <Users className="w-8 h-8 text-blue-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-900">Manajemen Pengguna</p>
                <p className="text-xs text-slate-500 mt-1">Lihat & kelola role pengguna</p>
              </Link>
              <Link href="/admin/settings?tab=players" className="p-4 rounded-xl border border-slate-200 hover:border-matchpoin-tense hover:shadow-sm transition-all text-center">
                <Users className="w-8 h-8 text-emerald-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-900">Manajemen Pemain</p>
                <p className="text-xs text-slate-500 mt-1">Cari & lihat detail pemain</p>
              </Link>
              <Link href="/admin/settings?tab=matches" className="p-4 rounded-xl border border-slate-200 hover:border-matchpoin-tense hover:shadow-sm transition-all text-center">
                <Calendar className="w-8 h-8 text-amber-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-900">Manajemen Pertandingan</p>
                <p className="text-xs text-slate-500 mt-1">Lihat status & sengketa</p>
              </Link>
              <Link href="/admin/tournaments" className="p-4 rounded-xl border border-slate-200 hover:border-matchpoin-tense hover:shadow-sm transition-all text-center">
                <Trophy className="w-8 h-8 text-purple-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-900">Persetujuan Turnamen</p>
                <p className="text-xs text-slate-500 mt-1">Setujui/tolak pendaftaran</p>
              </Link>
              <Link href="/admin/simulasi" className="p-4 rounded-xl border border-slate-200 hover:border-matchpoin-tense hover:shadow-sm transition-all text-center">
                <FlaskConical className="w-8 h-8 text-rose-600 mx-auto mb-2" />
                <p className="font-semibold text-slate-900">Simulasi Kualifikasi</p>
                <p className="text-xs text-slate-500 mt-1">Prediksi juara &amp; rating</p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}