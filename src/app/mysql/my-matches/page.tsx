import Link from "next/link";
import { redirect } from "next/navigation";
import { Calendar, LockKeyhole, Users } from "lucide-react";
import { getSupabaseSession } from "@/lib/auth/supabase-auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logError } from "@/lib/errors";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlMatchList } from "@/lib/mysql/match-service";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";
import type { OpenMatchDetail } from "@/lib/matches/constants";

export const dynamic = "force-dynamic";

export default async function MySqlMyMatchesPage() {
  const session = await getSupabaseSession();
  if (!session?.user?.id) redirect("/mysql/auth/login?redirectTo=%2Fmysql%2Fmy-matches");

  let matches: OpenMatchDetail[] = [];
  let loadError = false;
  const connection = await connectToMySql();
  try {
    matches = await getMySqlMatchList(connection, session.user.id);
  } catch (error) {
    logError("mysql.my-matches.page", error, { userId: session.user.id });
    loadError = true;
  } finally {
    await connection.end();
  }

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-5xl space-y-6 px-4 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-3xl font-extrabold text-slate-900">Pertandingan Saya</h1><p className="mt-1 text-sm text-slate-500">Pertandingan yang Anda selenggarakan atau ikuti.</p></div><Link href="/mysql/matches/new"><Button>Buat pertandingan</Button></Link></div>
        {loadError ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">Pertandingan gagal dimuat. Coba muat ulang halaman.</div> : matches.length === 0 ? (
          <EmptyState icon={Calendar} title="Belum ada pertandingan" description="Pertandingan yang Anda buat atau ikuti akan tampil di sini." action={<Link href="/mysql/matches"><Button variant="outline">Jelajahi pertandingan terbuka</Button></Link>} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">{matches.map((match) => (
            <Link key={match.id} href={`/mysql/matches/${match.id}`} className="rounded-2xl border border-slate-200 bg-white p-5 transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between gap-3"><div><h2 className="font-bold text-slate-900">{match.title}</h2><p className="mt-1 text-xs text-slate-500">{match.categoryLabel}</p></div><Badge variant={match.status === "open" ? "tennis" : "secondary"} className={match.status === "cancelled" ? "border-red-200 bg-red-50 text-red-700" : ""}>{match.status === "cancelled" ? "Dibatalkan" : match.status === "completed" ? "Selesai" : match.status === "in_progress" ? "Berlangsung" : match.status === "full" ? "Penuh" : "Terbuka"}</Badge></div>
              <div className="mt-4 space-y-2 text-xs text-slate-600"><p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />{formatIndonesianDate(match.matchDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })} · {formatIndonesianTime(`1970-01-01T${match.startTime}+08:00`)} WITA</p><p>{match.courtName}</p><p className="flex items-center gap-2"><Users className="h-3.5 w-3.5" />{match.currentPlayers}/{match.maxPlayers} pemain</p></div>
              <div className="mt-4 flex gap-2">{match.isPrivate && <Badge variant="outline" className="gap-1"><LockKeyhole className="h-3 w-3" />Privat</Badge>}{match.organizerId === session.user!.id && <Badge variant="secondary">Penyelenggara</Badge>}</div>
            </Link>
          ))}</div>
        )}
      </div>
    </div>
  );
}
