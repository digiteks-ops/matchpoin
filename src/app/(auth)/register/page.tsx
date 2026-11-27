"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { ensurePlayerRecords } from "@/lib/services/player-service";
import { recordLastSeen } from "@/lib/services/last-seen";
import { mapSignUpError } from "@/lib/auth/auth-errors-core.mjs";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { MPR_STARTING_RATING } from "@/lib/rating/mpr-core.mjs";
import { AlertCircle, ArrowLeft, Loader2, CheckCircle2, ShieldCheck } from "lucide-react";

// Tidak ada lagi pilihan self rating saat mendaftar: semua pemain baru
// mulai dari MPR 1000 dan kategori ditentukan dari hasil pertandingan.

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [accountRole, setAccountRole] = useState<"player" | "host">("player");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length === 0) {
      setErrorMessage("Kata sandi tidak boleh kosong.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setErrorMessage("Kata sandi melebihi batas 72 byte (UTF-8).");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: password,
        options: {
          data: {
            full_name: fullName.trim(),
            role: accountRole,
          },
        },
      });

      if (error) {
        setErrorMessage(mapSignUpError(error.message));
        setIsLoading(false);
        return;
      }

      if (data.user) {
        try {
          await ensurePlayerRecords(
            data.user.id,
            data.user.email || email,
            fullName.trim()
          );
        } catch (e) {
          console.warn("Player sync on register:", e);
        }
      }

      setIsSuccess(true);
      setIsLoading(false);

      if (data.session) {
        // Sesi langsung aktif (konfirmasi email nonaktif): catat sebagai login.
        if (data.user) await recordLastSeen(data.user.id, { force: true });
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1500);
      }
    } catch (err: any) {
      setErrorMessage(mapSignUpError(err?.message));
      setIsLoading(false);
    }
  };

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

      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <Logo showText={false} />
          </div>
          <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
            Daftar Akun MATCHPOIN
          </CardTitle>
          <CardDescription>
            Buat akun pemain tenis Anda dan mulai terhubung di Makassar.
          </CardDescription>
        </CardHeader>

        {isSuccess ? (
          <CardContent className="space-y-4 pt-2 pb-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Pendaftaran Berhasil!</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Akun Anda telah berhasil dibuat. Silakan periksa inbox email Anda jika diperlukan verifikasi email, atau lanjutkan masuk ke sistem.
            </p>
            <div className="pt-2">
              <Link href="/login">
                <Button className="w-full bg-matchpoin-navy text-white">
                  Lanjut ke Halaman Masuk
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Daftar akun baru. Pemain yang sudah punya akun memakai
                  halaman Masuk (tautan di bawah), bukan formulir ini. */}
              <OAuthButtons redirectTo="/dashboard" mode="signup" />
              <p className="text-center text-[11px] text-slate-500">
                Sudah punya akun?{" "}
                <Link href="/login" className="font-bold text-matchpoin-navy hover:underline">
                  Masuk di sini
                </Link>
              </p>

              <div className="space-y-2">
                <Label htmlFor="fullName">Nama Lengkap</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Contoh: Andi Pratama"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label>Daftar Sebagai</Label>
                <div className="grid grid-cols-2 gap-2">
                  <label
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      accountRole === "player"
                        ? "border-matchpoin-navy bg-slate-50 ring-1 ring-matchpoin-navy"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="accountRole"
                      value="player"
                      checked={accountRole === "player"}
                      onChange={() => setAccountRole("player")}
                      className="sr-only"
                      disabled={isLoading}
                    />
                    <span className="block text-sm font-bold text-slate-900">Pemain</span>
                    <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                      Bergabung dan bertanding di komunitas.
                    </span>
                  </label>
                  <label
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      accountRole === "host"
                        ? "border-matchpoin-navy bg-slate-50 ring-1 ring-matchpoin-navy"
                        : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="accountRole"
                      value="host"
                      checked={accountRole === "host"}
                      onChange={() => setAccountRole("host")}
                      className="sr-only"
                      disabled={isLoading}
                    />
                    <span className="block text-sm font-bold text-slate-900">Host</span>
                    <span className="mt-1 block text-[11px] leading-snug text-slate-500">
                      Kelola komunitas dan buat pertandingan.
                    </span>
                  </label>
                </div>
              </div>

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
                <Label htmlFor="password">Kata Sandi</Label>
                <PasswordInput
                  id="password"
                  placeholder="Masukkan kata sandi"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Konfirmasi Kata Sandi</Label>
                <PasswordInput
                  id="confirmPassword"
                  placeholder="Ulangi kata sandi"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>

              {/* Tidak ada pilihan self rating: semua pemain baru mulai dari MPR 1000. */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="flex items-center justify-between text-sm font-bold text-slate-900">
                  Rating awal Anda
                  <span className="font-semibold text-matchpoin-navy">MPR {MPR_STARTING_RATING}</span>
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Semua pemain baru mulai dari MPR {MPR_STARTING_RATING}. Kategori Anda
                  (Beginner/Intermediate/Advanced/Expert) ditentukan otomatis dari hasil
                  pertandingan, bukan dari pilihan saat mendaftar.
                </p>
                <p className="mt-1 text-[11px] leading-snug text-slate-400">
                  Dua pertandingan pertama adalah masa kalibrasi sebelum rating menjadi ranking
                  resmi.
                </p>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col space-y-4">
              <Button
                type="submit"
                variant="tennis"
                className="w-full text-matchpoin-navy font-bold"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Mendaftarkan Akun...
                  </span>
                ) : (
                  "Daftar Sekarang"
                )}
              </Button>

              <div className="text-center text-xs text-slate-500">
                Sudah memiliki akun MATCHPOIN?{" "}
                <Link
                  href="/login"
                  className="font-bold text-matchpoin-navy hover:underline"
                >
                  Masuk di Sini
                </Link>
              </div>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
