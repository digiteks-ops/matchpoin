import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/layout/logo";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MySqlSessionPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) redirect("/mysql/auth/login");

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 bg-slate-50">
      <Card className="w-full max-w-md shadow-md border-slate-200">
        <CardHeader className="space-y-2 text-center">
          <div className="flex justify-center"><Logo showText={false} /></div>
          <CardTitle className="text-2xl font-bold font-heading text-matchpoin-navy">
            Sesi Aktif
          </CardTitle>
          <CardDescription>Supabase Auth berhasil memverifikasi akun dan sesi Anda.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-slate-500">Nama</p>
            <p className="font-semibold">{user.user_metadata?.full_name || user.email || "Pemain MATCHPOIN"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Email</p>
            <p className="font-semibold">{user.email}</p>
          </div>
          <Link href="/mysql/profile" className="block text-center text-sm font-semibold text-matchpoin-navy hover:underline">
            Buka profil
          </Link>
          <Link href="/mysql/dashboard" className="block text-center text-sm font-semibold text-matchpoin-navy hover:underline">
            Buka dashboard
          </Link>
        </CardContent>
        <CardFooter>
          <form action={async () => {
            "use server";
            const s = createClient();
            await s.auth.signOut();
            redirect("/mysql/auth/login");
          }} className="w-full">
            <Button type="submit" variant="outline" className="w-full">Keluar dari Sesi</Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}