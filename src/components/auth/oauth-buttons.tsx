"use client";

import React, { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Provider = "google" | "facebook";

interface OAuthButtonsProps {
  redirectTo?: string;
  mode?: "signin" | "signup";
}

const PROVIDER_LABEL: Record<Provider, string> = {
  google: "Google",
  facebook: "Facebook",
};

function mapOAuthError(provider: Provider, message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes("not enabled") || lower.includes("unsupported provider")) {
    return `Masuk dengan ${PROVIDER_LABEL[provider]} belum diaktifkan. Hubungi admin MATCHPOIN.`;
  }
  if (lower.includes("access_denied") || lower.includes("denied")) {
    return "Anda membatalkan proses masuk. Silakan coba lagi.";
  }
  if (lower.includes("redirect") || lower.includes("callback")) {
    return "Alamat callback OAuth tidak valid. Periksa pengaturan provider.";
  }
  return `Gagal memulai proses masuk dengan ${PROVIDER_LABEL[provider]}. Silakan coba lagi.`;
}

function GoogleLogo({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width="20" height="20" className={className} aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C40.9 35.3 44 30.1 44 24c0-1.3-.1-2.3-.4-3.5z"
      />
    </svg>
  );
}

function FacebookLogo({ className = "h-5 w-5 shrink-0" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className={className} aria-hidden="true">
      <path
        fill="#1877F2"
        d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.6.2 2.6.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"
      />
      <path
        fill="#fff"
        d="M16.7 15.5l.5-3.5h-3.3V9.7c0-.9.4-1.8 1.9-1.8h1.5V5s-1.3-.2-2.6-.2c-2.7 0-4.5 1.6-4.5 4.6V12h-3v3.5h3v8.4a12.1 12.1 0 0 0 3.7 0v-8.4h2.8z"
      />
    </svg>
  );
}

const PROVIDER_DISPLAY: Record<Provider, string> = {
  google: "Google",
  facebook: "Facebook",
};

function OAuthRedirectOverlay({ provider }: { provider: Provider }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-live="polite"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
          {provider === "google" ? <GoogleLogo className="h-7 w-7 shrink-0" /> : <FacebookLogo className="h-7 w-7 shrink-0" />}
        </div>
        <h2 className="mt-4 text-base font-bold text-slate-900">
          Mengalihkan ke {PROVIDER_DISPLAY[provider]}...
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">
          Anda akan diarahkan ke halaman masuk {PROVIDER_DISPLAY[provider]}. Pilih akun dan
          setujui izin untuk melanjutkan ke MATCHPOIN.
        </p>
        <div className="mt-4 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Mohon tunggu
        </div>
      </div>
    </div>
  );
}

export function OAuthButtons({ redirectTo = "/dashboard", mode = "signin" }: OAuthButtonsProps) {
  const [enabled, setEnabled] = useState<Record<Provider, boolean | null>>({
    google: null,
    facebook: null,
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
      } catch {
        // Keep both buttons usable; the provider call will surface a clear error.
      }
    }

    loadProviders();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleOAuth = async (provider: Provider) => {
    setError(null);

    if (enabled[provider] === false) {
      setError(
        `Masuk dengan ${PROVIDER_LABEL[provider]} belum diaktifkan. Hubungi admin MATCHPOIN.`
      );
      return;
    }

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
        setError(mapOAuthError(provider, oauthError.message));
        setIsLoading(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(mapOAuthError(provider, message));
      setIsLoading(null);
    }
  };

  const label = mode === "signup" ? "Daftar" : "Masuk";

  return (
    <div className="space-y-3">
      {isLoading && <OAuthRedirectOverlay provider={isLoading} />}
      <div className="grid grid-cols-1 gap-2">
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          disabled={isLoading !== null}
          onClick={() => handleOAuth("google")}
          title={
            enabled.google === false
              ? "Provider Google belum diaktifkan di Supabase"
              : "Lanjutkan dengan Google"
          }
        >
          <GoogleLogo />
          {label} dengan Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-start gap-2"
          disabled={isLoading !== null}
          onClick={() => handleOAuth("facebook")}
          title={
            enabled.facebook === false
              ? "Provider Facebook belum diaktifkan di Supabase"
              : "Lanjutkan dengan Facebook"
          }
        >
          <FacebookLogo />
          {label} dengan Facebook
        </Button>
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
