"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Loader2 } from "lucide-react";
import { ERROR_GENERIC, ERROR_NETWORK, isOffline, logError } from "@/lib/errors";

interface InviteActionsProps {
  inviteId: string;
  onDone?: () => void;
}

export function InviteActions({ inviteId, onDone }: InviteActionsProps) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const respond = async (action: "accept" | "decline") => {
    setError(null);
    if (isOffline()) {
      setError(ERROR_NETWORK);
      return;
    }

    setIsBusy(action);
    try {
      const res = await fetch(`/api/invites/${inviteId}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string };

      if (!res.ok || json.success === false) {
        setError(json.message || ERROR_GENERIC);
        return;
      }

      onDone?.();
      router.refresh();
    } catch (err) {
      logError("invite.respond.ui", err, { inviteId, action });
      setError(isOffline() ? ERROR_NETWORK : ERROR_GENERIC);
    } finally {
      setIsBusy(null);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => respond("accept")}
          disabled={isBusy !== null}
          className="inline-flex items-center gap-1 rounded-lg bg-matchpoin-navy px-3 py-1.5 text-[11px] font-bold text-matchpoin-tennis disabled:opacity-60"
        >
          {isBusy === "accept" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Terima
        </button>
        <button
          type="button"
          onClick={() => respond("decline")}
          disabled={isBusy !== null}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 disabled:opacity-60"
        >
          {isBusy === "decline" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <X className="h-3.5 w-3.5" />
          )}
          Tolak
        </button>
      </div>
      {error && <p className="text-[10px] text-rose-600">{error}</p>}
    </div>
  );
}