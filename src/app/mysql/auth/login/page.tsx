"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/logo";
import { PasswordInput } from "@/components/ui/password-input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedRedirect = searchParams.get("redirectTo") || "";
  const redirectTo =
    requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
      ? requestedRedirect
      : "/mysql/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMessage("Email atau kata sandi yang Anda masukkan salah.");
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal masuk ke akun."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md shadow-md border-slate-200">
      <CardHeader className="space-y-1 text-center">
        <div className="flex justify-center mb-2"><Logo showText={false} /></div>
        <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
          Masuk ke Akun
        </CardTitle>
        <CardDescription>
          Gunakan akun Supabase Anda untuk masuk.
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
            <Label htmlFor="login-email">Alamat Email</Label>
            <Input
              id="login-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
              disabled={isLoading}
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Kata Sandi</Label>
              <Link href="/mysql/auth/forgot-password" className="text-xs text-matchpoin-navy hover:underline font-medium">
                Lupa kata sandi?
              </Link>
            </div>
            <PasswordInput
              id="login-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
              disabled={isLoading}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <Button type="submit" className="w-full bg-matchpoin-navy text-white" disabled={isLoading}>
            {isLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Memproses...</span> : "Masuk"}
          </Button>
          <div className="text-center text-xs text-slate-500">
            Belum punya akun?{" "}
            <Link href="/mysql/auth/register" className="font-bold text-matchpoin-navy hover:underline">
              Daftar gratis
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}

export default function MySqlLoginPage() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <div className="w-full max-w-md mb-4">
        <Link href="/" className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy transition-colors gap-1.5">
          <ArrowLeft className="w-3.5 h-3.5" />
          Kembali ke Beranda
        </Link>
      </div>
      <Suspense fallback={<div className="h-96 flex items-center justify-center text-slate-500 text-sm">Memuat form login...</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}