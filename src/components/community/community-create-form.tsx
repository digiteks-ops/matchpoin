"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ERROR_GENERIC, ERROR_NETWORK, isOffline, logError } from "@/lib/errors";
import { AlertCircle, Loader2, Plus } from "lucide-react";

export function CommunityCreateForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (isOffline()) {
      setError(ERROR_NETWORK);
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch("/api/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, city, adminPhone }),
      });
      const json = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
      };

      if (!response.ok || json.success === false) {
        setError(json.message || ERROR_GENERIC);
        return;
      }

      setName("");
      setCity("");
      setAdminPhone("");
      router.refresh();
    } catch (err) {
      logError("community.create.ui", err);
      setError(isOffline() ? ERROR_NETWORK : ERROR_GENERIC);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="community-name">Nama Komunitas</Label>
        <Input
          id="community-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Contoh: Komunitas Tenis Makassar"
          maxLength={80}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="community-city">Kota</Label>
          <Input
            id="community-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Makassar"
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="community-phone">Nomor WhatsApp Admin</Label>
          <Input
            id="community-phone"
            type="tel"
            value={adminPhone}
            onChange={(event) => setAdminPhone(event.target.value)}
            placeholder="08xxxxxxxxxx"
            maxLength={32}
          />
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Nomor WhatsApp dipakai tombol Chat Admin di halaman komunitas. Bisa
        diubah nanti.
      </p>
      {error && (
        <p className="flex items-start gap-1.5 text-xs text-rose-600">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}
      <Button
        type="submit"
        variant="tennis"
        disabled={isBusy || name.trim().length < 2}
        className="gap-1.5 text-xs font-bold text-matchpoin-navy"
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Plus className="h-4 w-4" />
        )}
        Buat Komunitas
      </Button>
    </form>
  );
}
