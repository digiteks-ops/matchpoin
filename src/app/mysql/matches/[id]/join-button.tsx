"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { readErrorMessage } from "@/lib/errors";

export function JoinMySqlMatchButton({ matchId }: { matchId: string }) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState("");
  const [isJoining, setIsJoining] = useState(false);

  const joinMatch = async () => {
    setIsJoining(true);
    setErrorMessage("");
    try {
      const response = await fetch(`/api/mysql/matches/${matchId}/join`, { method: "POST" });
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Tidak dapat bergabung ke pertandingan."));
        return;
      }
      router.refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Tidak dapat bergabung ke pertandingan.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button onClick={joinMatch} disabled={isJoining} className="w-full font-bold">
        {isJoining ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Memproses...</span> : "Gabung Pertandingan"}
      </Button>
      {errorMessage && <p role="alert" className="flex items-start gap-1.5 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</p>}
    </div>
  );
}
