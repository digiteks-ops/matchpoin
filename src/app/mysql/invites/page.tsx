"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, Calendar, Clock, MapPin, Mail, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { readErrorMessage } from "@/lib/errors";
import { formatIndonesianDate, formatIndonesianTime } from "@/lib/utils";

interface Invitation {
  participantId: string;
  matchId: string;
  title: string;
  categoryLabel: string;
  matchDate: string;
  startTime: string;
  courtName: string;
  organizerName: string;
}

export default function MySqlInvitesPage() {
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [pendingId, setPendingId] = useState("");

  const loadInvitations = async () => {
    const response = await fetch("/api/mysql/invites", { cache: "no-store" });
    if (!response.ok) throw new Error(await readErrorMessage(response, "Gagal memuat undangan."));
    const result = (await response.json()) as { success?: boolean; invitations?: Invitation[] };
    if (!result.success || !Array.isArray(result.invitations)) throw new Error("Respons undangan tidak valid.");
    setInvitations(result.invitations);
  };

  useEffect(() => {
    loadInvitations()
      .catch((error: unknown) => setErrorMessage(error instanceof Error ? error.message : "Gagal memuat undangan."))
      .finally(() => setIsLoading(false));
  }, []);

  const respond = async (invitation: Invitation, action: "accept" | "decline") => {
    setPendingId(invitation.participantId);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/mysql/invites/${invitation.participantId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Gagal menanggapi undangan."));
      await loadInvitations();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal menanggapi undangan.");
    } finally {
      setPendingId("");
    }
  };

  return (
    <div className="flex-1 bg-slate-50 py-8 md:py-12">
      <div className="container mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        <div><Badge variant="secondary" className="gap-1.5"><Mail className="h-3.5 w-3.5" />Undangan</Badge><h1 className="mt-2 text-3xl font-extrabold text-slate-900">Undangan Pertandingan</h1><p className="mt-1 text-sm text-slate-500">Tanggapi undangan yang tersimpan di Matchpoin.</p></div>
        {errorMessage && <div role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
        {isLoading ? <div className="h-40 animate-pulse rounded-2xl border bg-white" /> : invitations.length === 0 ? (
          <EmptyState icon={Mail} title="Tidak ada undangan tertunda" description="Undangan pertandingan baru akan muncul di sini." action={<Link href="/mysql/matches"><Button variant="outline">Lihat pertandingan terbuka</Button></Link>} />
        ) : (
          <div className="space-y-4">{invitations.map((invitation) => (
            <Card key={invitation.participantId}>
              <CardHeader><div className="flex flex-wrap items-start justify-between gap-2"><div><CardTitle className="text-lg">{invitation.title}</CardTitle><p className="mt-1 text-xs text-slate-500">{invitation.categoryLabel} · dari {invitation.organizerName}</p></div><Badge variant="tennis">Menunggu respons</Badge></div></CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2"><p className="flex items-center gap-2"><Calendar className="h-3.5 w-3.5" />{formatIndonesianDate(invitation.matchDate, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</p><p className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" />{formatIndonesianTime(`1970-01-01T${invitation.startTime}+08:00`)} WITA</p><p className="flex items-center gap-2 sm:col-span-2"><MapPin className="h-3.5 w-3.5" />{invitation.courtName}</p></div>
                <div className="flex flex-wrap gap-2"><Button onClick={() => respond(invitation, "accept")} disabled={pendingId === invitation.participantId} className="gap-1.5"><Check className="h-4 w-4" />Terima</Button><Button onClick={() => respond(invitation, "decline")} disabled={pendingId === invitation.participantId} variant="outline" className="gap-1.5"><X className="h-4 w-4" />Tolak</Button><Link href={`/mysql/matches/${invitation.matchId}`}><Button variant="ghost">Lihat detail</Button></Link></div>
              </CardContent>
            </Card>
          ))}</div>
        )}
      </div>
    </div>
  );
}
