"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ERROR_GENERIC,
  ERROR_NETWORK,
  isOffline,
  logError,
} from "@/lib/errors";
import { AlertCircle, CheckCircle2, Loader2, Save } from "lucide-react";

interface CommunitySettingsFormProps {
  community: {
    id: string;
    name: string;
    city: string | null;
    admin_phone: string | null;
  };
}

export function CommunitySettingsForm({
  community,
}: CommunitySettingsFormProps) {
  const router = useRouter();
  const [name, setName] = useState(community.name);
  const [city, setCity] = useState(community.city ?? "");
  const [adminPhone, setAdminPhone] = useState(community.admin_phone ?? "");
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (isOffline()) {
      setError(ERROR_NETWORK);
      return;
    }

    setIsBusy(true);
    try {
      const response = await fetch(`/api/communities/${community.id}`, {
        method: "PATCH",
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

      setSuccess("Pengaturan komunitas disimpan.");
      router.refresh();
    } catch (err) {
      logError("community.settings.ui", err, { communityId: community.id });
      setError(isOffline() ? ERROR_NETWORK : ERROR_GENERIC);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <Label htmlFor="settings-name">Nama Komunitas</Label>
        <Input
          id="settings-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          required
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="settings-city">Kota</Label>
          <Input
            id="settings-city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            placeholder="Makassar"
            maxLength={80}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="settings-phone">Nomor WhatsApp Admin</Label>
          <Input
            id="settings-phone"
            type="tel"
            value={adminPhone}
            onChange={(event) => setAdminPhone(event.target.value)}
            placeholder="08xxxxxxxxxx"
            maxLength={32}
          />
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">
        Kosongkan nomor bila belum tersedia. Tombol Chat Admin akan nonaktif
        sampai nomor diisi.
      </p>
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
      <Button
        type="submit"
        variant="outline"
        disabled={isBusy || name.trim().length < 2}
        className="gap-1.5 text-xs"
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Simpan Pengaturan
      </Button>
    </form>
  );
}
