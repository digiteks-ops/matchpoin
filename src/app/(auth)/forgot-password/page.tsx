"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, ArrowLeft, Loader2, CheckCircle2, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      const redirectUrl = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectUrl,
      });

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setIsSuccess(true);
      setIsLoading(false);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal mengirim email reset kata sandi.");
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-md mb-4">
        <Link
          href="/login"
          className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy transition-colors gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Halaman Masuk
        </Link>
      </div>

      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2">
            <Logo showText={false} />
          </div>
          <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
            Pemulihan Kata Sandi
          </CardTitle>
          <CardDescription>
            Masukkan alamat email yang terdaftar untuk menerima tautan pemulihan.
          </CardDescription>
        </CardHeader>

        {isSuccess ? (
          <CardContent className="space-y-4 pt-2 pb-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Email Pemulihan Dikirim</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Jika alamat <strong className="text-slate-800">{email}</strong> terdaftar di sistem kami, Anda akan menerima email berisi instruksi reset kata sandi dalam beberapa menit.
            </p>
            <div className="pt-2">
              <Link href="/login">
                <Button variant="outline" className="w-full text-xs">
                  Kembali ke Halaman Masuk
                </Button>
              </Link>
            </div>
          </CardContent>
        ) : (
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Alamat Email Terdaftar</Label>
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
                    Mengirim...
                  </span>
                ) : (
                  "Kirim Tautan Pemulihan"
                )}
              </Button>

              <div className="text-center text-xs text-slate-500">
                Ingat kata sandi Anda?{" "}
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
