"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { ensurePlayerRecords } from "@/lib/services/player-service";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard";

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          setErrorMessage("Email atau kata sandi yang Anda masukkan salah.");
        } else if (error.message.includes("Email not confirmed")) {
          setErrorMessage("Email Anda belum diverifikasi. Silakan periksa inbox email Anda.");
        } else {
          setErrorMessage(error.message);
        }
        setIsLoading(false);
        return;
      }

      if (data.user) {
        // Ensure player record exists in users, player_profiles, player_ratings
        try {
          await ensurePlayerRecords(data.user.id, data.user.email || email);
        } catch (e) {
          console.warn("Player sync on login:", e);
        }

        router.push(safeRedirect);
        router.refresh();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Terjadi kesalahan saat masuk. Silakan coba lagi.");
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-md border-slate-200">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2">
          <Logo showText={false} />
        </div>
        <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
          Masuk ke MATCHPOIN
        </CardTitle>
        <CardDescription>
          Gunakan email dan kata sandi akun Anda untuk melanjutkan.
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleLogin}>
        <CardContent className="space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          <OAuthButtons redirectTo={safeRedirect} mode="signin" />

          <div className="space-y-2">
            <Label htmlFor="email">Alamat Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nama@contoh.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Kata Sandi</Label>
              <Link
                href="/forgot-password"
                className="text-xs text-matchpoin-navy hover:underline font-medium"
              >
                Lupa kata sandi?
              </Link>
            </div>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-4">
          <Button
            type="submit"
            className="w-full bg-matchpoin-navy text-white hover:bg-matchpoin-navy/90"
            disabled={isLoading}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Memproses...
              </span>
            ) : (
              "Masuk"
            )}
          </Button>

          <div className="text-center text-xs text-slate-500">
            Belum memiliki akun MATCHPOIN?{" "}
            <Link
              href="/register"
              className="font-bold text-matchpoin-navy hover:underline"
            >
              Daftar Sekarang
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-md mb-4">
        <Link
          href="/"
          className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy transition-colors gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Beranda (Mode Tamu)
        </Link>
      </div>
      <Suspense fallback={<div className="h-96 flex items-center justify-center text-slate-500 text-sm">Memuat form login...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
