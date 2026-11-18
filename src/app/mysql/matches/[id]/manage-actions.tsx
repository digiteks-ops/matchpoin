"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Send, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { MatchParticipantInfo } from "@/lib/matches/constants";
import { fetchMySqlPublicPlayers, type MySqlPublicPlayer } from "@/lib/mysql/public-player-client";
import { readErrorMessage } from "@/lib/errors";

interface MatchManagerActionsProps {
  matchId: string;
  isOrganizer: boolean;
  isActive: boolean;
  canInvite: boolean;
  pendingRequests: MatchParticipantInfo[];
  invitedPlayers: MatchParticipantInfo[];
  excludedUserIds: string[];
}

export function MatchManagerActions({
  matchId,
  isOrganizer,
  isActive,
  canInvite,
  pendingRequests,
  invitedPlayers,
  excludedUserIds,
}: MatchManagerActionsProps) {
  const router = useRouter();
  const [players, setPlayers] = useState<MySqlPublicPlayer[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState("");
  const [busyAction, setBusyAction] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const excluded = useMemo(() => new Set(excludedUserIds), [excludedUserIds]);

  useEffect(() => {
    if (!isOrganizer || !isActive) return;
    fetchMySqlPublicPlayers(500)
      .then(({ players: result }) => setPlayers(result))
      .catch((error: unknown) =>
        setErrorMessage(error instanceof Error ? error.message : "Gagal memuat pemain untuk undangan.")
      );
  }, [isOrganizer, isActive]);

  if (!isOrganizer) return null;

  const postAction = async (action: string, url: string, body?: unknown) => {
    setBusyAction(action);
    setErrorMessage("");
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(await readErrorMessage(response, "Tindakan pertandingan gagal."));
      router.refresh();
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Tindakan pertandingan gagal.");
      return false;
    } finally {
      setBusyAction("");
    }
  };

  const sendInvite = async () => {
    if (!selectedPlayer) return;
    const sent = await postAction(
      "invite",
      `/api/mysql/matches/${matchId}/invite`,
      { inviteeId: selectedPlayer }
    );
    if (sent) setSelectedPlayer("");
  };

  const updateRequest = (participantUserId: string, action: "accept" | "reject") =>
    postAction(
      `${action}-${participantUserId}`,
      `/api/mysql/matches/${matchId}/${action}`,
      { participantUserId }
    );

  const cancelMatch = async () => {
    if (!window.confirm("Batalkan pertandingan ini? Tindakan ini tidak dapat dibatalkan.")) return;
    const cancelled = await postAction("cancel", `/api/mysql/matches/${matchId}/cancel`, {
      reason: "Dibatalkan oleh penyelenggara.",
    });
    if (cancelled) router.push("/mysql/my-matches");
  };

  return (
    <div className="space-y-4">
      {errorMessage && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
      {pendingRequests.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Permohonan bergabung</CardTitle><CardDescription className="text-xs">Setujui atau tolak permohonan pemain.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {pendingRequests.map((participant) => <div key={participant.userId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"><div><p className="text-sm font-semibold">{participant.fullName}</p><p className="text-xs text-slate-500">{participant.showRating === false ? "Rating disembunyikan" : `Rating ${participant.rating.toFixed(2)}`}</p></div><div className="flex gap-2"><Button size="sm" onClick={() => updateRequest(participant.userId, "accept")} disabled={Boolean(busyAction)}>Terima</Button><Button size="sm" variant="outline" onClick={() => updateRequest(participant.userId, "reject")} disabled={Boolean(busyAction)}>Tolak</Button></div></div>)}
          </CardContent>
        </Card>
      )}
      {invitedPlayers.length > 0 && (
        <Card><CardHeader><CardTitle className="text-base">Undangan terkirim</CardTitle></CardHeader><CardContent className="space-y-2">{invitedPlayers.map((participant) => <p key={participant.userId} className="text-sm text-slate-600">{participant.fullName} <span className="text-xs text-amber-700">· menunggu respons</span></p>)}</CardContent></Card>
      )}
      {isActive && canInvite && (
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><UserPlus className="h-4 w-4" />Undang pemain</CardTitle><CardDescription className="text-xs">Hanya pemain yang mengizinkan undangan yang dapat dipilih. Undangan akan memesan satu slot.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            <select aria-label="Pilih pemain untuk diundang" value={selectedPlayer} onChange={(event) => setSelectedPlayer(event.target.value)} className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm">
              <option value="">Pilih pemain</option>
              {players.filter((player) => player.allowInvites && !excluded.has(player.userId)).map((player) => <option key={player.userId} value={player.userId}>{player.displayName} · {player.cityName}</option>)}
            </select>
            <Button className="w-full gap-2" onClick={sendInvite} disabled={!selectedPlayer || Boolean(busyAction)}>{busyAction === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Kirim undangan</Button>
          </CardContent>
        </Card>
      )}
      {isActive && <Button variant="outline" className="w-full border-red-200 text-red-700 hover:bg-red-50" onClick={cancelMatch} disabled={Boolean(busyAction)}>{busyAction === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Batalkan pertandingan"}</Button>}
    </div>
  );
}
