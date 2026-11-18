"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/logo";
import { createClient } from "@/lib/supabase/client";
import { readErrorMessage } from "@/lib/errors";

export default function MySqlForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/mysql/auth/reset-password`,
      });
      if (error) {
        setErrorMessage(await readErrorMessage(new Response(JSON.stringify({ message: error.message }), { status: 400 }), "Pemulihan kata sandi sedang tidak tersedia."));
        return;
      }
      setIsSuccess(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal mengirim permintaan pemulihan."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-md mb-4">
        <Link
          href="/mysql/auth/login"
          className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy transition-colors gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Halaman Masuk
        </Link>
      </div>
      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2"><Logo showText={false} /></div>
          <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
            Pemulihan Kata Sandi
          </CardTitle>
          <CardDescription>
            Masukkan email akun Anda untuk menerima tautan pemulihan.
          </CardDescription>
        </CardHeader>
        {isSuccess ? (
          <CardContent className="space-y-4 pt-2 pb-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <Mail className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Permintaan Diterima</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Jika alamat tersebut terdaftar, instruksi pemulihan akan dikirim ke email Anda.
            </p>
            <Link href="/mysql/auth/login"><Button variant="outline" className="w-full text-xs">Kembali Masuk</Button></Link>
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
                <Label htmlFor="recovery-email">Alamat Email Terdaftar</Label>
                <Input
                  id="recovery-email"
                  type="email"
                  placeholder="nama@contoh.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
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
                {isLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Mengirim...</span> : "Kirim Tautan Pemulihan"}
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}