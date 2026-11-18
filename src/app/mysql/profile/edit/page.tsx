"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readErrorMessage } from "@/lib/errors";

interface City {
  id: string;
  name: string;
  province: string;
}

interface ProfileResponse {
  success?: boolean;
  message?: string;
  user?: {
    full_name: string;
    phone: string | null;
    gender: string | null;
    city_id: string | null;
  };
  profile?: {
    bio: string | null;
    playing_since: string | null;
    preferred_hand: string | null;
    backhand: string | null;
    play_frequency: string | null;
    self_assessed_level: string | null;
    profile_visibility: string;
    preferred_categories: string[];
    preferred_times: string[];
  } | null;
  cities?: City[];
}

const categories = [
  { id: "singles", label: "Tunggal" },
  { id: "doubles", label: "Ganda" },
  { id: "mixed_doubles", label: "Ganda campuran" },
];
const playingTimes = [
  { id: "pagi", label: "Pagi" },
  { id: "sore", label: "Sore" },
  { id: "malam", label: "Malam" },
  { id: "weekend", label: "Akhir pekan" },
];

const selectClass =
  "flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis";

export default function MySqlEditProfilePage() {
  const router = useRouter();
  const [cities, setCities] = useState<City[]>([]);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [gender, setGender] = useState("");
  const [cityId, setCityId] = useState("");
  const [bio, setBio] = useState("");
  const [playingSince, setPlayingSince] = useState("");
  const [preferredHand, setPreferredHand] = useState("right");
  const [backhand, setBackhand] = useState("two_handed");
  const [playFrequency, setPlayFrequency] = useState("weekly");
  const [selfAssessedLevel, setSelfAssessedLevel] = useState("beginner");
  const [profileVisibility, setProfileVisibility] = useState("public");
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [preferredTimes, setPreferredTimes] = useState<string[]>([]);
  const [province, setProvince] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const response = await fetch("/api/mysql/profile");
        if (response.status === 401) {
          router.replace("/mysql/auth/login?redirectTo=%2Fmysql%2Fprofile%2Fedit");
          return;
        }
        if (!response.ok) {
          setErrorMessage(await readErrorMessage(response, "Gagal memuat profil."));
          return;
        }
        const result = (await response.json()) as ProfileResponse;
        if (!result.user) {
          setErrorMessage("Data profil tidak ditemukan.");
          return;
        }
        const user = result.user;
        const profile = result.profile;
        const loadedCities = result.cities || [];
        setCities(loadedCities);
        setProvince(loadedCities.find((city) => city.id === user.city_id)?.province || "");
        setFullName(user.full_name || "");
        setPhone(user.phone || "");
        setGender(user.gender || "");
        setCityId(user.city_id || "");
        setBio(profile?.bio || "");
        setPlayingSince(profile?.playing_since || "");
        setPreferredHand(profile?.preferred_hand || "right");
        setBackhand(profile?.backhand || "two_handed");
        setPlayFrequency(profile?.play_frequency || "weekly");
        setSelfAssessedLevel(profile?.self_assessed_level || "beginner");
        setProfileVisibility(profile?.profile_visibility || "public");
        setPreferredCategories(profile?.preferred_categories || []);
        setPreferredTimes(profile?.preferred_times || []);
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "Gagal memuat profil.");
      } finally {
        setIsLoading(false);
      }
    }
    void loadProfile();
  }, [router]);

  const toggleItem = (items: string[], setItems: (value: string[]) => void, item: string) => {
    setItems(items.includes(item) ? items.filter((value) => value !== item) : [...items, item]);
  };

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setErrorMessage("");
    setSuccessMessage("");
    try {
      const response = await fetch("/api/mysql/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          gender: gender || null,
          cityId: cityId || null,
          bio: bio.trim() || null,
          playingSince: playingSince.trim() || null,
          preferredHand,
          backhand,
          playFrequency,
          selfAssessedLevel,
          profileVisibility,
          preferredCategories,
          preferredTimes,
        }),
      });
      if (!response.ok) {
        setErrorMessage(await readErrorMessage(response, "Gagal menyimpan profil."));
        return;
      }
      setSuccessMessage("Profil berhasil disimpan.");
      window.setTimeout(() => {
        router.push("/mysql/profile");
        router.refresh();
      }, 700);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Gagal menyimpan profil.");
    } finally {
      setIsSaving(false);
    }
  };

  const provinces = Array.from(new Set(cities.map((city) => city.province))).sort();

  if (isLoading) {
    return <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Memuat profil...</div>;
  }

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto max-w-3xl space-y-6 px-4 sm:px-6">
        <Link href="/mysql/profile" className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-matchpoin-navy">
          <ArrowLeft className="h-3.5 w-3.5" />Kembali ke Profil
        </Link>
        <Card>
          <CardHeader>
            <CardTitle>Edit Profil</CardTitle>
            <CardDescription>Perubahan hanya disimpan ke Matchpoin.</CardDescription>
          </CardHeader>
          <form onSubmit={handleSave}>
            <CardContent className="space-y-6">
              {errorMessage && <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertCircle className="h-4 w-4 shrink-0" />{errorMessage}</div>}
              {successMessage && <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700"><CheckCircle2 className="h-4 w-4 shrink-0" />{successMessage}</div>}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="mysql-profile-name">Nama lengkap</Label><Input id="mysql-profile-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={160} required disabled={isSaving} /></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-phone">Nomor telepon</Label><Input id="mysql-profile-phone" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={32} disabled={isSaving} /></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-province">Provinsi</Label><select id="mysql-profile-province" className={selectClass} value={province} onChange={(event) => { setProvince(event.target.value); setCityId(""); }} disabled={isSaving}><option value="">Pilih provinsi</option>{provinces.map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-city">Kota / kabupaten</Label><select id="mysql-profile-city" className={selectClass} value={cityId} onChange={(event) => setCityId(event.target.value)} disabled={isSaving || !province}><option value="">Pilih kota</option>{cities.filter((city) => city.province === province).map((city) => <option key={city.id} value={city.id}>{city.name}</option>)}</select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-gender">Jenis kelamin</Label><select id="mysql-profile-gender" className={selectClass} value={gender} onChange={(event) => setGender(event.target.value)} disabled={isSaving}><option value="">Belum diatur</option><option value="male">Laki-laki</option><option value="female">Perempuan</option><option value="other">Lainnya</option><option value="prefer_not_to_say">Tidak ingin menyebutkan</option></select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-visibility">Visibilitas profil</Label><select id="mysql-profile-visibility" className={selectClass} value={profileVisibility} onChange={(event) => setProfileVisibility(event.target.value)} disabled={isSaving}><option value="public">Publik</option><option value="friends_only">Teman saja</option><option value="private">Privat</option></select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-hand">Tangan dominan</Label><select id="mysql-profile-hand" className={selectClass} value={preferredHand} onChange={(event) => setPreferredHand(event.target.value)} disabled={isSaving}><option value="right">Kanan</option><option value="left">Kiri</option></select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-backhand">Gaya backhand</Label><select id="mysql-profile-backhand" className={selectClass} value={backhand} onChange={(event) => setBackhand(event.target.value)} disabled={isSaving}><option value="two_handed">Dua tangan</option><option value="one_handed">Satu tangan</option></select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-frequency">Frekuensi bermain</Label><select id="mysql-profile-frequency" className={selectClass} value={playFrequency} onChange={(event) => setPlayFrequency(event.target.value)} disabled={isSaving}><option value="daily">Setiap hari</option><option value="weekly">1–2 kali seminggu</option><option value="biweekly">Dua minggu sekali</option><option value="monthly">Bulanan</option><option value="occasional">Kadang-kadang</option></select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-level">Level permainan</Label><select id="mysql-profile-level" className={selectClass} value={selfAssessedLevel} onChange={(event) => setSelfAssessedLevel(event.target.value)} disabled={isSaving}><option value="beginner">Pemula</option><option value="intermediate">Menengah</option><option value="advanced">Mahir</option></select></div>
                <div className="space-y-2"><Label htmlFor="mysql-profile-playing-since">Mulai bermain</Label><Input id="mysql-profile-playing-since" value={playingSince} onChange={(event) => setPlayingSince(event.target.value)} maxLength={32} placeholder="Contoh: 2020" disabled={isSaving} /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="mysql-profile-bio">Bio</Label><Textarea id="mysql-profile-bio" value={bio} onChange={(event) => setBio(event.target.value)} maxLength={5000} rows={4} disabled={isSaving} /></div>
              <div className="space-y-2"><Label>Kategori pertandingan favorit</Label><div className="flex flex-wrap gap-2">{categories.map((category) => <button key={category.id} type="button" aria-pressed={preferredCategories.includes(category.id)} onClick={() => toggleItem(preferredCategories, setPreferredCategories, category.id)} disabled={isSaving} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${preferredCategories.includes(category.id) ? "border-matchpoin-navy bg-matchpoin-navy text-white" : "border-slate-300 bg-white text-slate-700"}`}>{category.label}</button>)}</div></div>
              <div className="space-y-2"><Label>Waktu bermain pilihan</Label><div className="flex flex-wrap gap-2">{playingTimes.map((time) => <button key={time.id} type="button" aria-pressed={preferredTimes.includes(time.id)} onClick={() => toggleItem(preferredTimes, setPreferredTimes, time.id)} disabled={isSaving} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${preferredTimes.includes(time.id) ? "border-matchpoin-navy bg-matchpoin-navy text-white" : "border-slate-300 bg-white text-slate-700"}`}>{time.label}</button>)}</div></div>
            </CardContent>
            <CardFooter><Button type="submit" className="w-full font-bold" disabled={isSaving || !fullName.trim()}>{isSaving ? <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Menyimpan...</span> : "Simpan Profil"}</Button></CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
