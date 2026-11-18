"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/layout/logo";
import { PasswordInput } from "@/components/ui/password-input";
import { readErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export default function MySqlResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    if (newPassword.length === 0 || new TextEncoder().encode(newPassword).length > 72) {
      setErrorMessage("Kata sandi baru tidak boleh kosong dan maksimal 72 byte.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage("Konfirmasi kata sandi tidak cocok.");
      return;
    }

    setIsLoading(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setErrorMessage(await readErrorMessage(new Response(JSON.stringify({ message: error.message }), { status: 400 }), "Gagal memperbarui kata sandi."));
        return;
      }
      setIsSuccess(true);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Gagal memperbarui kata sandi."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-1 text-center">
          <div className="flex justify-center mb-2"><Logo showText={false} /></div>
          <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
            Buat Kata Sandi Baru
          </CardTitle>
          <CardDescription>
            Maksimal 72 byte (UTF-8).
          </CardDescription>
        </CardHeader>
        {isSuccess ? (
          <CardContent className="space-y-4 pt-2 pb-6 text-center">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-slate-900">Kata Sandi Diperbarui</h3>
            <p className="text-xs text-slate-600">
              Kata sandi akun Anda berhasil diperbarui.
            </p>
            <Link href="/mysql/auth/login" className="text-xs text-matchpoin-navy hover:underline">
              Masuk dengan kata sandi baru
            </Link>
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
                <Label htmlFor="new-password">Kata Sandi Baru</Label>
                <PasswordInput
                  id="new-password"
                  placeholder="Masukkan kata sandi baru"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Konfirmasi Kata Sandi</Label>
                <PasswordInput
                  id="confirm-password"
                  placeholder="Ulangi kata sandi"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  autoComplete="new-password"
                  disabled={isLoading}
                />
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" variant="tennis" className="w-full text-matchpoin-navy font-bold" disabled={isLoading}>
                {isLoading ? <span className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />Menyimpan...</span> : "Simpan Kata Sandi Baru"}
              </Button>
              <Link href="/mysql/auth/forgot-password" className="text-xs text-matchpoin-navy hover:underline">
                Minta tautan pemulihan baru
              </Link>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}