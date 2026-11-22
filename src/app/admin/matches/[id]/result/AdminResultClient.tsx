"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function AdminResultClient({ matchId }: { matchId: string }) {
  const [team1Score, setTeam1Score] = useState("");
  const [team2Score, setTeam2Score] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    setMessage(null);
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/admin/matches/${matchId}/result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ team1Score: Number(team1Score), team2Score: Number(team2Score) }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string }
        | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Gagal menyimpan hasil.");
      }
      setMessage("Hasil tersimpan dan rating diperbarui.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan hasil.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs font-semibold text-slate-600">
          Skor Tim 1
          <input
            id="team1Score"
            type="number"
            min={0}
            value={team1Score}
            onChange={(event) => setTeam1Score(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
        </label>
        <label className="text-xs font-semibold text-slate-600">
          Skor Tim 2
          <input
            id="team2Score"
            type="number"
            min={0}
            value={team2Score}
            onChange={(event) => setTeam2Score(event.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 px-3 text-sm"
          />
        </label>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
      {message && <p className="text-xs text-emerald-700">{message}</p>}

      <Button
        variant="tennis"
        className="w-full font-bold text-matchpoin-navy"
        onClick={submit}
        disabled={isSubmitting || team1Score === "" || team2Score === ""}
      >
        {isSubmitting ? "Menyimpan..." : "Simpan Hasil & Terapkan Rating"}
      </Button>
    </div>
  );
}
