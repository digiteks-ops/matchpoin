"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, Loader2, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  // useSearchParams() butuh Suspense boundary agar halaman tetap bisa
  // dirender statis saat build.
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <Loader2 className="w-8 h-8 animate-spin text-matchpoin-navy" />
            <p className="text-sm font-medium">Memuat...</p>
          </div>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /auth/callback mengirim ?error=expired bila penukaran token pemulihan
  // gagal (tautan sudah dipakai / kedaluwarsa).
  const linkError = searchParams.get("error");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Tautan email harus menghasilkan sesi pemulihan. Tanpa sesi,
  // updateUser() pasti gagal, jadi formulir disembunyikan dan pemain diberi
  // jalan untuk meminta tautan baru.
  //
  // "waiting" dipakai saat tautan membawa token di fragment
  // (#access_token=...&type=recovery): supabase-js menukarnya di browser, jadi
  // halaman perlu menunggu sebentar sebelum menyimpulkan tautan tidak valid.
  const [sessionState, setSessionState] = useState<"checking" | "waiting" | "ready" | "missing">(
    // Tautan yang sudah ditolak callback langsung tampil sebagai tidak valid,
    // tanpa kedipan status "memeriksa".
    linkError ? "missing" : "checking"
  );

  useEffect(() => {
    // Tautan sudah ditolak /auth/callback: jangan buat klien Supabase lagi,
    // cukup tampilkan keadaan "Tautan Tidak Valid".
    if (linkError) {
      setSessionState("missing");
      return;
    }

    let cancelled = false;
    let settled = false;
    const supabase = createClient();
    // Supabase mengirim token pemulihan di fragment, bukan query string.
    // Fragment juga bisa berisi error (tautan kedaluwarsa / sudah dipakai):
    //   #error=access_denied&error_code=otp_expired&error_description=...
    const hash = window.location.hash;
    const hashHasError = /(^#|&)(error|error_code|error_description)=/.test(hash);
    const hasFragmentToken = /(access_token|refresh_token)=/.test(hash);

    if (hashHasError) {
      setSessionState("missing");
      return;
    }

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      if (cancelled || settled) return;
      if (data.session) {
        settled = true;
        setSessionState("ready");
        return;
      }
      // Tanpa token di fragment dan tanpa sesi: tautan memang tidak valid.
      if (!hasFragmentToken) setSessionState("missing");
    }

    // Token di fragment ditukar secara asinkron. Beri waktu, lalu baru
    // nyatakan tautan tidak valid bila sesi tetap tidak muncul.
    const fallback = hasFragmentToken
      ? setTimeout(async () => {
          if (cancelled || settled) return;
          const { data } = await supabase.auth.getSession();
          if (cancelled || settled) return;
          setSessionState(data.session ? "ready" : "missing");
        }, 4000)
      : null;

    // Supabase menukar `code`/token dari tautan email menjadi sesi secara
    // asinkron; event ini menangkapnya bila datang setelah pengecekan awal.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        settled = true;
        setSessionState("ready");
      }
    });

    if (hasFragmentToken) setSessionState("waiting");
    checkSession();

    return () => {
      cancelled = true;
      if (fallback) clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, [linkError]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (sessionState !== "ready") {
      setErrorMessage(
        "Tautan reset tidak valid atau sudah kedaluwarsa. Silakan minta tautan baru lewat halaman Lupa Kata Sandi."
      );
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("Kata sandi baru minimal harus terdiri dari 6 karakter.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      setIsLoading(false);

      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 2000);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal memperbarui kata sandi.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <Logo showText={false} />
          </div>
          <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
            Buat Kata Sandi Baru
          </CardTitle>
          <CardDescription>
            Masukkan kata sandi baru untuk mengamankan akun MATCHPOIN Anda.
          </CardDescription>
        </CardHeader>

        {sessionState === "checking" || sessionState === "waiting" ? (
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-matchpoin-navy" />
            <p className="text-xs text-slate-500">
              {sessionState === "waiting"
                ? "Memverifikasi tautan reset kata sandi..."
                : "Memeriksa tautan reset kata sandi..."}
            </p>
          </CardContent>
        ) : sessionState === "missing" ? (
          <CardContent className="space-y-4 pt-2 pb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600">
              <AlertCircle className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Tautan Tidak Valid</h3>
            <p className="text-xs leading-relaxed text-slate-600">
              Tautan reset kata sandi sudah kedaluwarsa atau sudah pernah dipakai. Minta tautan
              baru, lalu buka dari perangkat yang sama.
            </p>
            <div className="space-y-2 pt-2">
              <Link href="/forgot-password">
                <Button className="w-full bg-matchpoin-navy text-white">
                  Minta Tautan Baru
                </Button>
              </Link>
              <Link href="/login">
                <Button variant="outline" className="w-full">
                  Kembali ke Halaman Masuk
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : isSuccess ? (
          <CardContent className="space-y-4 pt-2 pb-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Kata Sandi Berhasil Diperbarui!</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Kata sandi Anda telah berhasil diubah. Anda akan dialihkan ke dashboard pemain secara otomatis...
            </p>
            <div className="pt-2">
              <Link href="/dashboard">
                <Button className="w-full bg-matchpoin-navy text-white">
                  Buka Dashboard Sekarang
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleResetPassword}>
            <CardContent className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="newPassword">Kata Sandi Baru</Label>
                <PasswordInput
                  id="newPassword"
                  placeholder="Minimal 6 karakter"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Konfirmasi Kata Sandi Baru</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Ulangi kata sandi baru"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>
            </CardContent>

            <CardFooter>
              <Button
                type="submit"
                variant="tennis"
                className="w-full text-matchpoin-navy font-bold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan...
                  </span>
                ) : (
                  "Simpan Kata Sandi Baru"
                )}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
