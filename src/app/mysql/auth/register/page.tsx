"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/logo";
import { PasswordInput } from "@/components/ui/password-input";
import { readErrorMessage } from "@/lib/errors";

export default function MySqlRegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (password.length === 0 || new TextEncoder().encode(password).length > 72) {
      setErrorMessage("Kata sandi tidak boleh kosong dan maksimal 72 byte.");
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
        password,
        options: {
          data: {
            full_name: fullName.trim(),
          },
        },
      });
      if (error) {
        setErrorMessage(await readErrorMessage(new Response(JSON.stringify({ message: error.message }), { status: 400 }), "Pendaftaran gagal."));
        return;
      }
      if (data.user) {
        router.replace("/mysql/dashboard");
        router.refresh();
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal melakukan pendaftaran."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-md mb-4">
        <Link href="/" className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy transition-colors gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Beranda
        </Link>
      </div>
      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2"><Logo showText={false} /></div>
          <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
            Daftar Akun
          </CardTitle>
          <CardDescription>
            Akun akan dibuat di Supabase Auth dan profil pemain.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            {errorMessage && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="register-name">Nama Lengkap</Label>
              <Input id="register-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required maxLength={160} disabled={isLoading} autoComplete="name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-email">Alamat Email</Label>
              <Input id="register-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" disabled={isLoading} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-password">Kata Sandi</Label>
              <PasswordInput id="register-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" disabled={isLoading} />
              <p className="text-xs text-slate-500">Maksimal 72 byte (UTF-8).</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="register-confirm-password">Konfirmasi Kata Sandi</Label>
              <PasswordInput id="register-confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required autoComplete="new-password" disabled={isLoading} />
            </div>
            <div className="p-3 rounded-lg bg-slate-100 flex items-start gap-2 text-[11px] text-slate-600">
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>Akun dan profil pemain akan dibuat bersama dengan rating awal 1.00.</span>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" variant="tennis" className="w-full text-matchpoin-navy font-bold" disabled={isLoading}>
              {isLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Mendaftarkan...</span> : "Daftar Gratis"}
            </Button>
            <div className="text-center text-xs text-slate-500">
              Sudah punya akun?{" "}
              <Link href="/mysql/auth/login" className="font-bold text-matchpoin-navy hover:underline">Masuk di sini</Link>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}