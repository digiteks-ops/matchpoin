"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertCircle, Loader2, UserCheck, Users } from "lucide-react";
import { IKA17_CATEGORIES } from "@/lib/tournaments/ika17";
import { formatIndonesianDate } from "@/lib/utils";

interface Participant {
  entryId: string;
  userId: string;
  name: string;
  cityName: string | null;
  joinedAt: string | null;
}

interface AcceptedEntry {
  key: string;
  name: string;
  cityName: string | null;
  joinedAt: string | null;
  memberCount: number;
}

function groupEntries(participants: Participant[]): AcceptedEntry[] {
  const map = new Map<string, AcceptedEntry>();
  for (const participant of participants) {
    const existing = map.get(participant.entryId);
    if (existing) {
      existing.name = `${existing.name} & ${participant.name}`;
      existing.memberCount += 1;
      if (!existing.cityName) existing.cityName = participant.cityName;
      continue;
    }
    map.set(participant.entryId, {
      key: participant.entryId,
      name: participant.name,
      cityName: participant.cityName,
      joinedAt: participant.joinedAt,
      memberCount: 1,
    });
  }
  return Array.from(map.values());
}

export function TournamentParticipants() {
  const [category, setCategory] = useState(IKA17_CATEGORIES[0]?.id ?? "mens_singles");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (value: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/leagues/${encodeURIComponent(value)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        participants?: Participant[];
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload.message || "Gagal memuat peserta turnamen.");
      }
      setParticipants(Array.isArray(payload.participants) ? payload.participants : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memuat peserta turnamen.");
      setParticipants([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(category);
  }, [category, load]);

  const entries = useMemo(() => {
    const grouped = groupEntries(participants);
    return grouped.sort(
      (a, b) =>
        new Date(a.joinedAt ?? 0).getTime() - new Date(b.joinedAt ?? 0).getTime() ||
        a.name.localeCompare(b.name)
    );
  }, [participants]);

  const isDoubles = category.includes("doubles");

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <UserCheck className="h-5 w-5 text-emerald-600" />
              Peserta Diterima
            </CardTitle>
            <CardDescription className="mt-1 text-xs">
              Daftar pemain/tim yang sudah disetujui admin. Terbuka untuk semua pemain.
            </CardDescription>
          </div>
          <Badge variant="success" className="text-[10px] font-semibold">
            {entries.length} {isDoubles ? "tim" : "peserta"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {IKA17_CATEGORIES.map((entry) => (
            <Button
              key={entry.id}
              type="button"
              size="sm"
              variant={entry.id === category ? "tennis" : "outline"}
              className={
                entry.id === category
                  ? "text-matchpoin-navy font-bold"
                  : "text-slate-600 font-semibold"
              }
              onClick={() => setCategory(entry.id)}
            >
              {entry.label}
            </Button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center py-10 text-xs text-slate-400">
            <Loader2 className="mb-2 h-6 w-6 animate-spin text-matchpoin-navy" />
            Memuat peserta...
          </div>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">
            Belum ada peserta yang disetujui admin untuk kategori ini.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <th className="pb-2 pr-2">#</th>
                  <th className="pb-2 pr-2">
                    {isDoubles ? "Tim" : "Pemain"}
                  </th>
                  <th className="pb-2 pr-2">Kota</th>
                  <th className="pb-2 text-right">Disetujui</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {entries.map((entry, index) => (
                  <tr key={entry.key} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-2 font-bold text-slate-500">{index + 1}</td>
                    <td className="py-2.5 pr-2">
                      <div className="flex items-center gap-1.5">
                        <Users className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        <span className="font-semibold text-slate-900">{entry.name}</span>
                      </div>
                      {isDoubles && (
                        <span className="text-[10px] text-slate-400">
                          {entry.memberCount} pemain
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-2 text-xs text-slate-600">
                      {entry.cityName || "-"}
                    </td>
                    <td className="py-2.5 text-right text-xs text-slate-500">
                      {entry.joinedAt
                        ? formatIndonesianDate(entry.joinedAt, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
