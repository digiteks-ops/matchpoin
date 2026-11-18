import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { connectToMySql } from "@/lib/mysql/db.mjs";
import { getMySqlProfile } from "@/lib/mysql/profile-service";
import { signAvatarUrl } from "@/lib/storage/supabase";

export const dynamic = "force-dynamic";

export default async function MySqlProfilePage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    redirect("/mysql/auth/login?redirectTo=%2Fmysql%2Fprofile");
  }

  const connection = await connectToMySql();
  let data;
try {
    data = await getMySqlProfile(connection, user.id);
  } finally {
    await connection.end();
  }
  if (!data) redirect("/mysql/auth/login");

  const avatarUrl = await signAvatarUrl(data.user.avatar_url);
  const displayName = data.user.full_name || data.profile?.display_name || "Pemain MATCHPOIN";
  const rating = data.rating?.current_rating ?? 1;
  const city = data.city;
  const profile = data.profile;

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto max-w-4xl space-y-6 px-4 sm:px-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={displayName}
                width={80}
                height={80}
                className="rounded-full border-4 border-slate-100 object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-matchpoin-navy text-2xl font-bold text-white">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900">{displayName}</h1>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {city ? `${city.name}, ${city.province}` : "Lokasi belum diatur"}
              </p>
              <Badge variant="secondary" className="mt-2">
                {profile?.profile_visibility === "public" ? "Profil Publik" : "Profil Privat"}
              </Badge>
            </div>
          </div>
          <Link href="/mysql/profile/edit">
            <Button variant="tennis" className="w-full font-bold text-matchpoin-navy sm:w-auto">
              Edit Profil
            </Button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardDescription className="text-xs font-bold uppercase">MATCHPOIN Rating</CardDescription>
              <CardTitle className="text-3xl text-matchpoin-navy">{rating.toFixed(2)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">Tertinggi</span><strong>{(data.rating?.peak_rating ?? rating).toFixed(2)}</strong></p>
              <p className="flex justify-between"><span className="text-slate-500">Pertandingan</span><strong>{data.rating?.matches_played ?? 0}</strong></p>
              <p className="flex justify-between"><span className="text-slate-500">Menang</span><strong>{data.rating?.wins ?? 0}</strong></p>
              <p className="flex justify-between"><span className="text-slate-500">Kalah</span><strong>{data.rating?.losses ?? 0}</strong></p>
            </CardContent>
          </Card>

          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Informasi Pemain</CardTitle>
              <CardDescription>Data profil disimpan di Matchpoin.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <div><p className="text-xs text-slate-500">Email</p><p className="font-medium">{data.user.email}</p></div>
              <div><p className="text-xs text-slate-500">Nomor telepon</p><p className="font-medium">{data.user.phone || "Belum diatur"}</p></div>
              <div><p className="text-xs text-slate-500">Jenis kelamin</p><p className="font-medium">{data.user.gender || "Belum diatur"}</p></div>
              <div><p className="text-xs text-slate-500">Tangan dominan</p><p className="font-medium">{profile?.preferred_hand === "left" ? "Kiri" : "Kanan"}</p></div>
              <div><p className="text-xs text-slate-500">Backhand</p><p className="font-medium">{profile?.backhand === "one_handed" ? "Satu tangan" : "Dua tangan"}</p></div>
              <div><p className="text-xs text-slate-500">Frekuensi bermain</p><p className="font-medium capitalize">{profile?.play_frequency || "Belum diatur"}</p></div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Bio</p>
                <p className="whitespace-pre-wrap font-medium">{profile?.bio || "Belum ada bio."}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Kategori favorit</p>
                <p className="font-medium capitalize">{profile?.preferred_categories?.join(", ") || "Belum dipilih"}</p>
              </div>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">Waktu bermain</p>
                <p className="font-medium capitalize">{profile?.preferred_times?.join(", ") || "Belum dipilih"}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Link href="/mysql/auth/session" className="inline-block text-sm font-semibold text-matchpoin-navy hover:underline">
          Kembali ke sesi
        </Link>
      </div>
    </div>
  );
}
