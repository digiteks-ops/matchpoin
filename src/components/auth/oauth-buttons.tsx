"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Chrome, Facebook, Loader2 } from "lucide-react";

type Provider = "google" | "facebook";

interface OAuthButtonsProps {
  redirectTo?: string;
  mode?: "signin" | "signup";
}

export function OAuthButtons({ redirectTo = "/dashboard", mode = "signin" }: OAuthButtonsProps) {
  const [enabled, setEnabled] = useState<Record<Provider, boolean>>({
    google: false,
    facebook: false,
  });
  const [isLoading, setIsLoading] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProviders() {
      try {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !key) return;

        const res = await fetch(`${url}/auth/v1/settings`, {
          headers: { apikey: key },
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          external?: { google?: boolean; facebook?: boolean };
        };

        if (!cancelled) {
          setEnabled({
            google: Boolean(json.external?.google),
            facebook: Boolean(json.external?.facebook),
          });
        }
      } catch (err) {
        console.warn("Unable to load auth providers:", err);
      }
    }

    loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOAuth = async (provider: Provider) => {
    setError(null);
    setIsLoading(provider);

    try {
      const supabase = createClient();
      const callbackUrl = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
        redirectTo
      )}`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: callbackUrl,
          ...(provider === "google" ? { queryParams: { prompt: "select_account" } } : {}),
        },
      });

      if (oauthError) {
        setError(oauthError.message);
        setIsLoading(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal memulai proses masuk.");
      setIsLoading(null);
    }
  };

  if (!enabled.google && !enabled.facebook) return null;

  const label = mode === "signin" ? "Masuk" : "Daftar";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {enabled.google && (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={isLoading !== null}
            onClick={() => handleOAuth("google")}
          >
            {isLoading === "google" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Chrome className="w-4 h-4" />
            )}
            {label} dengan Google
          </Button>
        )}
        {enabled.facebook && (
          <Button
            type="button"
            variant="outline"
            className="w-full gap-2"
            disabled={isLoading !== null}
            onClick={() => handleOAuth("facebook")}
          >
            {isLoading === "facebook" ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Facebook className="w-4 h-4" />
            )}
            {label} dengan Facebook
          </Button>
        )}
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-slate-200" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          atau gunakan email
        </span>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
    </div>
  );
}