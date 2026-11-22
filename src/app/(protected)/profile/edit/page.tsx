"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { uploadAvatar } from "@/lib/services/player-service";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Save,
} from "lucide-react";
import type { DbUser, PlayerProfile, City, PreferredHand, BackhandStyle, PlayFrequency, SkillLevel, Gender, ProfileVisibility } from "@/types/database.types";

export default function EditProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoStage, setPhotoStage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form State
  const [userId, setUserId] = useState<string>("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [gender, setGender] = useState<Gender | "">("");
  const [cityId, setCityId] = useState<string>("");
  const [cities, setCities] = useState<City[]>([]);

  // Profile Specific State
  const [bio, setBio] = useState("");
  const [playingSince, setPlayingSince] = useState("");
  const [preferredHand, setPreferredHand] = useState<PreferredHand>("right");
  const [backhand, setBackhand] = useState<BackhandStyle>("two_handed");
  const [playFrequency, setPlayFrequency] = useState<PlayFrequency>("weekly");
  const [selfAssessedLevel, setSelfAssessedLevel] = useState<SkillLevel>("beginner");
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>("public");

  // Arrays for preferences
  const [preferredCategories, setPreferredCategories] = useState<string[]>([]);
  const [preferredTimes, setPreferredTimes] = useState<string[]>([]);

  // Province / City cascading dropdown state
  const [province, setProvince] = useState<string>("");
  const [provinceOptions, setProvinceOptions] = useState<string[]>([]);

const loadProfile = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      if (!authUser) {
        router.push("/login?redirectTo=/profile/edit");
        return;
      }

      setUserId(authUser.id);

      // Fetch cities
      const { data: citiesData } = await supabase
        .from("cities")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });

      if (citiesData) {
        setCities(citiesData as City[]);
        const provinces = Array.from(
          new Set((citiesData as City[]).map((c) => c.province).filter(Boolean))
        ).sort();
        setProvinceOptions(provinces);

        // Pre-select province after the user record is loaded (kept below).
      }

      // Fetch user record
      const { data: userData } = await supabase
        .from("users")
        .select("*")
        .eq("id", authUser.id)
        .maybeSingle();

      if (userData) {
        setFullName(userData.full_name || "");
        setPhone(userData.phone || "");
        setAvatarUrl(userData.avatar_url || null);
        setGender(userData.gender || "");
        setCityId(userData.city_id || "");
        // Preselect the province from the saved city (no state dependency, so
        // this loader cannot re-trigger itself and overwrite user input).
        if (userData.city_id) {
          const savedCity = (citiesData as City[] | null)?.find((c) => c.id === userData.city_id);
          if (savedCity) setProvince(savedCity.province);
        }
      }

      // Fetch profile record
      const { data: profileData } = await supabase
        .from("player_profiles")
        .select("*")
        .eq("user_id", authUser.id)
        .maybeSingle();

      if (profileData) {
        setBio(profileData.bio || "");
        setPlayingSince(profileData.playing_since || "");
        setPreferredHand(profileData.preferred_hand || "right");
        setBackhand(profileData.backhand || "two_handed");
        setPlayFrequency(profileData.play_frequency || "weekly");
        setSelfAssessedLevel(profileData.self_assessed_level || "beginner");
        setProfileVisibility(profileData.profile_visibility || "public");
        setPreferredCategories(profileData.preferred_categories || []);
        setPreferredTimes(profileData.preferred_times || []);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal memuat profil.");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

    useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setIsUploadingPhoto(true);
    setPhotoStage("Mengompres foto...");
    setErrorMessage(null);

    try {
      const publicUrl = await uploadAvatar(userId, file, (stage) => {
        setPhotoStage(stage === "compress" ? "Mengompres foto..." : "Mengunggah foto...");
      });
      setAvatarUrl(publicUrl);
      setPhotoStage(null);
      setSuccessMessage("Foto profil berhasil diperbarui!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setPhotoStage(null);
      setErrorMessage(err?.message || "Gagal mengunggah foto.");
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const toggleArrayItem = (list: string[], setList: (v: string[]) => void, item: string) => {
    if (list.includes(item)) {
      setList(list.filter((x) => x !== item));
    } else {
      setList([...list, item]);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // Persist through the server route: it uses the authenticated server
      // session, validates input and updates users + player_profiles in one
      // place. Direct browser writes silently affected 0 rows under RLS.
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: fullName.trim(),
          phone: phone.trim() || null,
          gender: (gender as Gender) || null,
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
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; message?: string }
        | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.message || "Gagal menyimpan perubahan profil.");
      }

      setSuccessMessage("Profil Anda berhasil disimpan!");
      setTimeout(() => {
        router.push("/profile");
        router.refresh();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err?.message || "Gagal menyimpan perubahan profil.");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-matchpoin-navy" />
          <p className="text-sm font-medium">Memuat Formulir Profil...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-slate-50 py-8">
      <div className="container mx-auto px-4 sm:px-6 max-w-3xl space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/profile"
            className="inline-flex items-center text-xs font-semibold text-slate-600 hover:text-matchpoin-navy transition-colors gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Kembali ke Profil Saya
          </Link>
          <span className="text-xs text-slate-400">Tahap 3 â€¢ Pengaturan Profil</span>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Status Messages */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 text-xs text-emerald-800">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 mt-0.5" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Section 1: Photo & Basic Information */}
          <Card className="border-slate-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Foto Profil & Identitas Diri</CardTitle>
              <CardDescription className="text-xs">
                Foto dan nama lengkap Anda akan dilihat oleh calon lawan bertanding.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Photo Upload Area */}
              <div className="flex items-center gap-5">
                <div className="relative">
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={fullName}
                      width={80}
                      height={80}
                      className="rounded-full object-cover border-2 border-slate-200 shadow-sm"
                    />
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-matchpoin-navy text-white flex items-center justify-center text-2xl font-bold font-heading">
                      {(fullName || "P").charAt(0).toUpperCase()}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="absolute -bottom-1 -right-1 p-2 rounded-full bg-matchpoin-tennis text-matchpoin-navy hover:bg-matchpoin-tennis-hover shadow-md transition-colors"
                    aria-label="Unggah foto profil"
                  >
                    {isUploadingPhoto ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Camera className="w-4 h-4" />
                    )}
                  </button>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </div>

                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-slate-800">Foto Profil</h4>
                  <p className="text-[11px] text-slate-500">
                    Format JPG, PNG, atau WEBP. Maksimal 10 MB. Foto dikompres otomatis
                    (512 px, â‰¤300 KB) sebelum diunggah.
                  </p>
                  {photoStage && (
                    <p className="text-[11px] font-semibold text-matchpoin-navy">{photoStage}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs h-8"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                  >
                    Pilih Berkas Foto
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Nama Lengkap</Label>
                  <Input
                    id="fullName"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    maxLength={50}
                    placeholder="Contoh: Andi Pratama"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Nomor Telepon / WhatsApp</Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="0812xxxxxxxx (opsional)"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="province">Provinsi</Label>
                  <select
                    id="province"
                    value={province}
                    onChange={(e) => {
                      const val = e.target.value;
                      setProvince(val);
                      setCityId(""); // reset city when province changes
                    }}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="">Pilih Provinsi...</option>
                    {provinceOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="city">Kota / Kabupaten</Label>
                  <select
                    id="city"
                    value={cityId}
                    onChange={(e) => setCityId(e.target.value)}
                    disabled={!province}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="">Pilih Kota...</option>
                    {cities
                      .filter((c) => !province || c.province === province)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="gender">Jenis Kelamin</Label>
                  <select
                    id="gender"
                    value={gender}
                    onChange={(e) => setGender(e.target.value as Gender)}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="">Pilih Jenis Kelamin...</option>
                    <option value="male">Laki-laki (Men)</option>
                    <option value="female">Perempuan (Women)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio & Cerita Tenis</Label>
                <Textarea
                  id="bio"
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Ceritakan pengalaman bermain tenis Anda, lapangan favorit di Makassar, atau target permainan Anda..."
                />
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Tennis Technical Attributes */}
          <Card className="border-slate-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Karakter & Gaya Permainan Tenis</CardTitle>
              <CardDescription className="text-xs">
                Informasi ini membantu pemain lain memahami karakteristik permainan Anda di lapangan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="preferredHand">Tangan Dominan</Label>
                  <select
                    id="preferredHand"
                    value={preferredHand}
                    onChange={(e) => setPreferredHand(e.target.value as PreferredHand)}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="right">Kanan (Right-Handed)</option>
                    <option value="left">Kiri (Left-Handed / Kidal)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="backhand">Gaya Backhand</Label>
                  <select
                    id="backhand"
                    value={backhand}
                    onChange={(e) => setBackhand(e.target.value as BackhandStyle)}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="two_handed">Dua Tangan (Two-Handed Backhand)</option>
                    <option value="one_handed">Satu Tangan (One-Handed Backhand)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="selfAssessedLevel">Penilaian Level Sendiri</Label>
                  <select
                    id="selfAssessedLevel"
                    value={selfAssessedLevel}
                    onChange={(e) => setSelfAssessedLevel(e.target.value as SkillLevel)}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="beginner">Pemula (Beginner: Rating 1.00 - 2.99)</option>
                    <option value="intermediate">Menengah (Intermediate: Rating 3.00 - 6.49)</option>
                    <option value="advanced">Mahir (Advanced: Rating 6.50+)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="playFrequency">Frekuensi Bermain</Label>
                  <select
                    id="playFrequency"
                    value={playFrequency}
                    onChange={(e) => setPlayFrequency(e.target.value as PlayFrequency)}
                    className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                  >
                    <option value="daily">Setiap Hari (Daily)</option>
                    <option value="weekly">1-2 Kali Seminggu (Weekly)</option>
                    <option value="biweekly">2 Minggu Sekali</option>
                    <option value="monthly">Bulanan</option>
                    <option value="occasional">Santai / Kadang-kadang</option>
                  </select>
                </div>
              </div>

              {/* Playing Categories Selection */}
              <div className="space-y-2 pt-2">
                <Label>Kategori Match Favorit (Bisa pilih lebih dari satu)</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "singles", label: "Tunggal (Singles)" },
                    { id: "doubles", label: "Ganda (Doubles)" },
                    { id: "mixed_doubles", label: "Ganda Campuran (Mixed Doubles)" },
                  ].map((cat) => {
                    const isSelected = preferredCategories.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => toggleArrayItem(preferredCategories, setPreferredCategories, cat.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isSelected
                            ? "bg-matchpoin-navy text-white border-matchpoin-navy"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Preferred Time Selection */}
              <div className="space-y-2 pt-2">
                <Label>Waktu Bermain Pilihan</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: "pagi", label: "Pagi (06:00 â€“ 09:00)" },
                    { id: "sore", label: "Sore (15:30 â€“ 18:00)" },
                    { id: "malam", label: "Malam (19:00 â€“ 22:00)" },
                    { id: "weekend", label: "Akhir Pekan (Sabtu/Minggu)" },
                  ].map((time) => {
                    const isSelected = preferredTimes.includes(time.id);
                    return (
                      <button
                        key={time.id}
                        type="button"
                        onClick={() => toggleArrayItem(preferredTimes, setPreferredTimes, time.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          isSelected
                            ? "bg-matchpoin-tennis text-matchpoin-navy border-matchpoin-tennis font-bold"
                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        {time.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Visibility & Privacy */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-800">
                Privasi & Visibilitas Profil
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="visibility">Visibilitas dalam Pencarian Pemain</Label>
                <select
                  id="visibility"
                  value={profileVisibility}
                  onChange={(e) => setProfileVisibility(e.target.value as ProfileVisibility)}
                  className="flex h-10 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matchpoin-tennis"
                >
                  <option value="public">Publik (Muncul di Direktori Pemain & Rekomendasi Match)</option>
                  <option value="private">Privat (Hanya pemain yang diundang langsung yang dapat melihat)</option>
                </select>
              </div>
            </CardContent>
            <CardFooter className="flex items-center justify-between border-t border-slate-100 pt-4">
              <Link href="/profile">
                <Button type="button" variant="outline" size="sm">
                  Batal
                </Button>
              </Link>
              <Button
                type="submit"
                variant="tennis"
                disabled={isSaving}
                className="text-matchpoin-navy font-bold gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Menyimpan Perubahan...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Simpan Profil Pemain
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </div>
  );
}
