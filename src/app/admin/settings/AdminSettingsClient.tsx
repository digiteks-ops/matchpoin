"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, UserCheck, UserX, ShieldCheck, AlertTriangle, Database, Wifi, Server, Activity, MoreHorizontal, Edit, Trash2, Eye } from "lucide-react";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";

const VALID_TABS = ["overview", "users", "players", "matches", "tournaments"];

function resolveTab(value: string): string {
  return VALID_TABS.includes(value) ? value : "overview";
}

interface UserRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  roles: string;
  is_super_admin: number;
  is_admin: number;
}

interface PlayerRow {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
  display_name: string | null;
  city_name: string | null;
  province: string | null;
  current_rating: number | string | null;
  matches_played: number | null;
  wins: number | null;
  losses: number | null;
  is_profile_public: boolean;
  profile_visibility: string;
  show_rating: boolean;
}

interface MatchRow {
  id: string;
  title: string;
  category: string;
  match_date: string;
  start_time: string;
  status: string;
  court_name: string | null;
  city_name: string | null;
  created_at: string;
  participant_count: number;
}

interface TournamentRow {
  id: string;
  name: string;
  category: string;
  season: string | null;
  status: string;
  max_participants: number;
  start_date: string;
  end_date: string;
  registration_deadline: string | null;
  confirmed_entries: number;
  pending_entries: number;
}

interface SystemHealth {
  database?: "healthy" | "degraded" | "error";
  authentication?: "healthy" | "degraded" | "error";
  storage?: "healthy" | "degraded" | "error";
  realtime?: "healthy" | "degraded" | "error";
}

interface AdminSettingsClientProps {
  activeTab: string;
  initialUsers: UserRow[];
  initialPlayers: PlayerRow[];
  initialMatches: MatchRow[];
  initialTournaments: TournamentRow[];
  initialSystemHealth: SystemHealth;
}

export default function AdminSettingsClient({
  activeTab,
  initialUsers,
  initialPlayers,
  initialMatches,
  initialTournaments,
  initialSystemHealth,
}: AdminSettingsClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState(resolveTab(activeTab));

  useEffect(() => {
    setTab(resolveTab(activeTab));
  }, [activeTab]);

  const handleTabChange = (value: string) => {
    setTab(value);
    router.replace(`/admin/settings?tab=${value}`);
  };

  const [users, setUsers] = useState(initialUsers);
  const [players, setPlayers] = useState(initialPlayers);
  const [matches, setMatches] = useState(initialMatches);
  const [tournaments, setTournaments] = useState(initialTournaments);
  const [systemHealth] = useState(initialSystemHealth);
  const [userSearch, setUserSearch] = useState("");
  const [playerSearch, setPlayerSearch] = useState("");

  const filteredUsers = users.filter((u) =>
    u.email.toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.full_name || "").toLowerCase().includes(userSearch.toLowerCase()) ||
    u.roles.toLowerCase().includes(userSearch.toLowerCase())
  );

  const filteredPlayers = players.filter((p) =>
    (p.display_name || "").toLowerCase().includes(playerSearch.toLowerCase()) ||
    (p.full_name || "").toLowerCase().includes(playerSearch.toLowerCase()) ||
    (p.email || "").toLowerCase().includes(playerSearch.toLowerCase()) ||
    (p.city_name || "").toLowerCase().includes(playerSearch.toLowerCase())
  );

  const getRoleBadges = (roles: string) => {
    const roleList = roles.split(",");
    return roleList.map((role) => {
      if (role === "super_admin") return <Badge key={role} variant="destructive" className="gap-1"><ShieldCheck className="w-3 h-3" />Super Admin</Badge>;
      if (role === "admin") return <Badge key={role} variant="secondary" className="gap-1"><ShieldCheck className="w-3 h-3" />Admin</Badge>;
      return <Badge key={role} variant="outline">Pemain</Badge>;
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed": return <Badge variant="success">Terkonfirmasi</Badge>;
      case "pending": return <Badge variant="secondary">Menunggu</Badge>;
      case "rejected": return <Badge variant="destructive">Ditolak</Badge>;
      case "completed": return <Badge variant="outline">Selesai</Badge>;
      case "cancelled": return <Badge variant="destructive">Dibatalkan</Badge>;
      case "registration_open": return <Badge variant="success">Pendaftaran Buka</Badge>;
      case "registration_closed": return <Badge variant="secondary">Pendaftaran Tutup</Badge>;
      case "in_progress": return <Badge variant="secondary">Sedang Berlangsung</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getHealthIcon = (status: "healthy" | "degraded" | "error" | undefined) => {
    switch (status) {
      case "healthy": return <Wifi className="w-5 h-5 text-emerald-600" />;
      case "degraded": return <AlertTriangle className="w-5 h-5 text-amber-600" />;
      case "error": return <Server className="w-5 h-5 text-red-600" />;
      default: return <Activity className="w-5 h-5 text-slate-400" />;
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto space-y-8 px-4 sm:px-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-3xl font-extrabold font-heading text-slate-900">Pengaturan Admin</h1>
            <p className="text-slate-600 mt-1 text-sm">Kelola pengguna, pemain, pertandingan, turnamen, dan sistem.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={handleTabChange} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview">Ringkasan Sistem</TabsTrigger>
            <TabsTrigger value="users">Manajemen Pengguna</TabsTrigger>
            <TabsTrigger value="players">Manajemen Pemain</TabsTrigger>
            <TabsTrigger value="matches">Manajemen Pertandingan</TabsTrigger>
            <TabsTrigger value="tournaments">Manajemen Turnamen</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Database className="w-4 h-4 text-matchpoin-navy" />
                    Database Supabase
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  {getHealthIcon(systemHealth.database)}
                  <div>
                    <p className="font-semibold text-slate-900">
                      {systemHealth.database === "healthy" ? "Sehat" : systemHealth.database === "degraded" ? "Terdegradasi" : "Error"}
                    </p>
                    <p className="text-xs text-slate-500">Koneksi PostgreSQL aktif</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    Autentikasi Supabase
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  {getHealthIcon(systemHealth.authentication)}
                  <div>
                    <p className="font-semibold text-slate-900">
                      {systemHealth.authentication === "healthy" ? "Sehat" : "Masalah"}
                    </p>
                    <p className="text-xs text-slate-500">Supabase Auth berfungsi</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Server className="w-4 h-4 text-blue-600" />
                    Penyimpanan R2
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  {getHealthIcon(systemHealth.storage)}
                  <div>
                    <p className="font-semibold text-slate-900">
                      {systemHealth.storage === "healthy" ? "Sehat" : "Masalah"}
                    </p>
                    <p className="text-xs text-slate-500">Cloudflare R2 tersedia</p>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Activity className="w-4 h-4 text-purple-600" />
                    Realtime Supabase
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-3">
                  {getHealthIcon(systemHealth.realtime)}
                  <div>
                    <p className="font-semibold text-slate-900">
                      {systemHealth.realtime === "healthy" ? "Sehat" : "Masalah"}
                    </p>
                    <p className="text-xs text-slate-500">Notifikasi realtime aktif</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Statistik Cepat</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-extrabold font-heading text-matchpoin-navy">{users.length}</p>
                    <p className="text-xs text-slate-500">Total Pengguna</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-extrabold font-heading text-emerald-600">{players.length}</p>
                    <p className="text-xs text-slate-500">Pemain Publik</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-extrabold font-heading text-amber-600">{matches.length}</p>
                    <p className="text-xs text-slate-500">Pertandingan</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-xl">
                    <p className="text-2xl font-extrabold font-heading text-purple-600">{tournaments.length}</p>
                    <p className="text-xs text-slate-500">Turnamen</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="users">
            <Card className="border-slate-200">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle>Daftar Pengguna & Role</CardTitle>
                  <div className="relative max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Cari email, nama, atau role..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="pl-9 bg-slate-50 border-slate-200 text-sm"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase">
                        <th className="pb-2">Pengguna</th>
                        <th className="pb-2">Role</th>
                        <th className="pb-2">Dibuat</th>
                        <th className="pb-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-slate-50">
                          <td className="py-3">
                            <p className="font-medium text-slate-900">{user.full_name || "Tanpa Nama"}</p>
                            <p className="text-xs text-slate-500">{user.email}</p>
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap gap-1">{getRoleBadges(user.roles)}</div>
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {formatIndonesianDate(user.created_at, { day: "numeric", month: "short", year: "numeric" })}
                          </td>
                          <td className="py-3">
                            <div className="flex items-center gap-2">
                              <Button variant="ghost" size="icon" className="text-slate-500 hover:text-matchpoin-navy" title="Lihat detail">
                                <Eye className="w-4 h-4" />
                              </Button>
                              {(user.is_admin || user.is_super_admin) ? (
                                <Badge variant="outline" className="text-[10px]">Admin</Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">Pemain</Badge>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredUsers.length === 0 && (
                    <p className="text-center text-slate-500 py-8">Tidak ada pengguna ditemukan.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="players">
            <Card className="border-slate-200">
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <CardTitle>Direktori Pemain Publik</CardTitle>
                  <div className="relative max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Cari nama, email, atau kota..."
                      value={playerSearch}
                      onChange={(e) => setPlayerSearch(e.target.value)}
                      className="pl-9 bg-slate-50 border-slate-200 text-sm"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase">
                        <th className="pb-2">Pemain</th>
                        <th className="pb-2">Kota</th>
                        <th className="pb-2">Rating</th>
                        <th className="pb-2">Rekor</th>
                        <th className="pb-2">Profil</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPlayers.map((player) => (
                        <tr key={player.id} className="hover:bg-slate-50">
                          <td className="py-3">
                            <p className="font-medium text-slate-900">{player.display_name || player.full_name || "Pemain MATCHPOIN"}</p>
                            <p className="text-xs text-slate-500">{player.email}</p>
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {player.city_name || "Belum diisi"} {player.province && `, ${player.province}`}
                          </td>
                          <td className="py-3">
                            {player.show_rating && player.current_rating !== null ? (
                              <span className="font-bold text-matchpoin-navy">{Number(player.current_rating).toFixed(2)}</span>
                            ) : (
                              <span className="text-slate-400 text-xs">Disembunyikan</span>
                            )}
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {player.matches_played || 0} Main · {player.wins || 0}W {player.losses || 0}L
                          </td>
                          <td className="py-3">
                            <Badge variant={player.is_profile_public ? "success" : "secondary"} className="text-[10px]">
                              {player.is_profile_public ? "Publik" : "Privat"}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredPlayers.length === 0 && (
                    <p className="text-center text-slate-500 py-8">Tidak ada pemain publik ditemukan.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="matches">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Daftar Pertandingan</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase">
                        <th className="pb-2">Pertandingan</th>
                        <th className="pb-2">Kategori</th>
                        <th className="pb-2">Tanggal & Waktu</th>
                        <th className="pb-2">Venue</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Peserta</th>
                        <th className="pb-2">Aksi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {matches.map((match) => (
                        <tr key={match.id} className="hover:bg-slate-50">
                          <td className="py-3 font-medium text-slate-900">{match.title}</td>
                          <td className="py-3 text-xs text-slate-500 capitalize">{match.category.replace("_", " ")}</td>
                          <td className="py-3 text-xs text-slate-500">
                            {formatIndonesianDate(match.match_date, { weekday: "short", day: "numeric", month: "short" })}<br />
                            {formatIndonesianTime(`1970-01-01T${match.start_time}+08:00`)} WITA
                          </td>
                          <td className="py-3 text-xs text-slate-500">
                            {match.court_name || "Belum ditetapkan"} {match.city_name && `, ${match.city_name}`}
                          </td>
                          <td className="py-3">{getStatusBadge(match.status)}</td>
                          <td className="py-3 text-center text-slate-600">{match.participant_count}</td>
                          <td className="py-3">
                            <div className="flex flex-col gap-1 text-xs font-semibold">
                              <Link
                                href={`/matches/${match.id}`}
                                className="text-matchpoin-navy hover:underline"
                              >
                                Detail
                              </Link>
                              <Link
                                href={`/admin/matches/${match.id}/result`}
                                className="text-emerald-700 hover:underline"
                              >
                                Input Hasil
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {matches.length === 0 && (
                    <p className="text-center text-slate-500 py-8">Tidak ada pertandingan.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tournaments">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Turnamen Liga (LIGA TENNIS IKA 17)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs font-semibold text-slate-500 uppercase">
                        <th className="pb-2">Turnamen</th>
                        <th className="pb-2">Kategori</th>
                        <th className="pb-2">Kuota / Terisi</th>
                        <th className="pb-2">Menunggu Persetujuan</th>
                        <th className="pb-2">Status</th>
                        <th className="pb-2">Periode</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {tournaments.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-3 font-medium text-slate-900">{t.name}</td>
                          <td className="py-3 text-xs text-slate-500 capitalize">{t.category.replace("_", " ")}</td>
                          <td className="py-3 text-center">
                            <span className="font-semibold text-slate-900">{t.confirmed_entries}</span> / {t.max_participants}
                          </td>
                          <td className="py-3 text-center">
                            <Badge variant={t.pending_entries > 0 ? "secondary" : "outline"} className="text-[10px]">
                              {t.pending_entries} menunggu
                            </Badge>
                          </td>
                          <td className="py-3">{getStatusBadge(t.status)}</td>
                          <td className="py-3 text-xs text-slate-500">
                            {formatIndonesianDate(t.start_date, { day: "numeric", month: "short" })} - {formatIndonesianDate(t.end_date, { day: "numeric", month: "short" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {tournaments.length === 0 && (
                    <p className="text-center text-slate-500 py-8">Tidak ada turnamen.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}