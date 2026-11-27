"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIndonesianDate } from "@/lib/utils";
import {
  ERROR_GENERIC,
  ERROR_NETWORK,
  isOffline,
  logError,
} from "@/lib/errors";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Search,
  UserMinus,
  UserPlus,
  Users,
} from "lucide-react";

interface CommunityMemberItem {
  id: string;
  user_id: string;
  role: string;
  joined_at: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

interface CandidatePlayer {
  userId: string;
  displayName: string;
  cityName: string;
  currentRating: number | null;
}

interface CommunityMemberManagerProps {
  communityId: string;
  members: CommunityMemberItem[];
  candidates: CandidatePlayer[];
}

function memberName(member: CommunityMemberItem): string {
  return member.full_name || member.email || "Pemain";
}

function initialOf(value: string): string {
  return value.trim().charAt(0).toUpperCase() || "P";
}

export function CommunityMemberManager({
  communityId,
  members,
  candidates,
}: CommunityMemberManagerProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const memberIds = useMemo(
    () => new Set(members.map((member) => member.user_id)),
    [members]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return candidates
      .filter((candidate) => !memberIds.has(candidate.userId))
      .filter((candidate) =>
        needle ? candidate.displayName.toLowerCase().includes(needle) : true
      )
      .slice(0, 20);
  }, [candidates, memberIds, query]);

  const addMember = async (candidate: CandidatePlayer) => {
    setError(null);
    setSuccess(null);
    if (isOffline()) {
      setError(ERROR_NETWORK);
      return;
    }

    setAddingId(candidate.userId);
    try {
      const response = await fetch(`/api/communities/${communityId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: candidate.userId }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || json.success === false) {
        setError(json.message || ERROR_GENERIC);
        return;
      }

      setSuccess(`${candidate.displayName} ditambahkan ke komunitas.`);
      setQuery("");
      router.refresh();
    } catch (err) {
      logError("community.member.add.ui", err, {
        communityId,
        playerId: candidate.userId,
      });
      setError(isOffline() ? ERROR_NETWORK : ERROR_GENERIC);
    } finally {
      setAddingId(null);
    }
  };

  const removeMember = async (member: CommunityMemberItem) => {
    const name = memberName(member);
    if (!window.confirm(`Keluarkan ${name} dari komunitas?`)) return;

    setError(null);
    setSuccess(null);
    if (isOffline()) {
      setError(ERROR_NETWORK);
      return;
    }

    setRemovingId(member.user_id);
    try {
      const response = await fetch(
        `/api/communities/${communityId}/members?playerId=${member.user_id}`,
        { method: "DELETE" }
      );
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || json.success === false) {
        setError(json.message || ERROR_GENERIC);
        return;
      }

      setSuccess(`${name} dikeluarkan dari komunitas.`);
      router.refresh();
    } catch (err) {
      logError("community.member.remove.ui", err, {
        communityId,
        playerId: member.user_id,
      });
      setError(isOffline() ? ERROR_NETWORK : ERROR_GENERIC);
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="member-search">Daftarkan Pemain</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            id="member-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari nama pemain..."
            className="pl-9"
          />
        </div>
        {filtered.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Tidak ada pemain yang bisa didaftarkan.
          </p>
        ) : (
          <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
            {filtered.map((candidate) => (
              <li
                key={candidate.userId}
                className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-500">
                  {initialOf(candidate.displayName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-slate-800">
                    {candidate.displayName}
                  </span>
                  <span className="block text-[10px] text-slate-400">
                    {candidate.cityName}
                    {candidate.currentRating !== null
                      ? ` · MPR ${Math.round(candidate.currentRating)}`
                      : ""}
                  </span>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={addingId !== null}
                  onClick={() => void addMember(candidate)}
                  className="gap-1 text-[11px]"
                >
                  {addingId === candidate.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  Daftarkan
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500">
            <Users className="h-3.5 w-3.5" />
            Anggota Komunitas
          </h4>
          <Badge variant="secondary" className="text-[10px]">
            {members.length}
          </Badge>
        </div>
        {members.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
            Belum ada anggota. Daftarkan pemain lewat pencarian di atas.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {members.map((member) => {
              const name = memberName(member);
              return (
                <li
                  key={member.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-matchpoin-navy text-xs font-bold text-matchpoin-tennis">
                    {initialOf(name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-slate-800">
                      {name}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      {member.role === "host" ? "Host" : "Pemain"} · Bergabung{" "}
                      {formatIndonesianDate(member.joined_at, {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={removingId !== null}
                    onClick={() => void removeMember(member)}
                    className="gap-1 text-[11px] text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                  >
                    {removingId === member.user_id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <UserMinus className="h-3.5 w-3.5" />
                    )}
                    Keluarkan
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      {success && (
        <p className="flex items-start gap-1.5 text-xs text-emerald-600">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {success}
        </p>
      )}
    </div>
  );
}
