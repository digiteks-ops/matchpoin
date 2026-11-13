import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { DbUser, PlayerProfile, PlayerRating } from "@/types/database.types";

type AnySupabase = SupabaseClient<any, any, any>;

/**
 * Calculates profile completion percentage (0 - 100%)
 */
export function calculateProfileCompletion(
  user: Partial<DbUser> | null,
  profile: Partial<PlayerProfile> | null
): { percentage: number; missingFields: string[] } {
  let score = 0;
  const missing: string[] = [];

  if (user?.full_name || profile?.display_name) score += 20;
  else missing.push("Nama Lengkap");

  if (user?.city_id) score += 15;
  else missing.push("Pilihan Kota");

  if (user?.avatar_url) score += 15;
  else missing.push("Foto Profil");

  if (user?.gender) score += 10;
  else missing.push("Jenis Kelamin");

  if (profile?.bio && profile.bio.trim().length > 10) score += 10;
  else missing.push("Bio / Cerita Tenis");

  if (profile?.preferred_hand) score += 10;
  else missing.push("Tangan Dominan");

  if (profile?.play_frequency) score += 5;
  else missing.push("Frekuensi Bermain");

  if (profile?.self_assessed_level) score += 5;
  else missing.push("Penilaian Level Skill");

  if (profile?.preferred_times && profile.preferred_times.length > 0) score += 5;
  else missing.push("Waktu Bermain Pilihan");

  if (profile?.preferred_categories && profile.preferred_categories.length > 0) score += 5;
  else missing.push("Kategori Match Pilihan");

  return { percentage: Math.min(score, 100), missingFields: missing };
}

/**
 * Ensures user record exists in users, player_profiles, and player_ratings.
 * Accepts any Supabase client so it can run in the browser or on the server.
 */
export async function ensurePlayerRecordsWithClient(
  supabase: AnySupabase,
  userId: string,
  email: string,
  fullName?: string
) {
  const { data: cityData } = await supabase
    .from("cities")
    .select("id")
    .eq("name", "Makassar")
    .maybeSingle();

  const cityId = cityData?.id ?? null;

  const { error: userError } = await supabase.from("users").upsert(
    {
      id: userId,
      email,
      full_name: fullName || email.split("@")[0],
      city_id: cityId,
      timezone: "Asia/Makassar",
      locale: "id",
    },
    { onConflict: "id" }
  );

  if (userError) {
    throw new Error(`Gagal menyiapkan data pemain: ${userError.message}`);
  }

  const { data: existingProfile } = await supabase
    .from("player_profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileError } = await supabase.from("player_profiles").insert({
      user_id: userId,
      display_name: fullName || email.split("@")[0],
      is_profile_public: true,
      profile_visibility: "public",
      preferred_hand: "right",
      backhand: "two_handed",
      play_frequency: "weekly",
      self_assessed_level: "beginner",
      completion_score: 40,
    });
    if (profileError) {
      throw new Error(`Gagal menyiapkan profil pemain: ${profileError.message}`);
    }
  }

  const { data: existingRating } = await supabase
    .from("player_ratings")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingRating) {
    const { error: ratingError } = await supabase.from("player_ratings").insert({
      user_id: userId,
      current_rating: 1.0,
      peak_rating: 1.0,
      matches_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
    });
    if (ratingError) {
      throw new Error(`Gagal menyiapkan rating pemain: ${ratingError.message}`);
    }
  }
}

/**
 * Browser-side player sync. Safe to call from client components.
 */
export async function ensurePlayerRecords(userId: string, email: string, fullName?: string) {
  const supabase = createClient();
  await ensurePlayerRecordsWithClient(supabase, userId, email, fullName);
}

/**
 * Upload profile photo to Supabase Storage 'avatars' bucket.
 */
export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const supabase = createClient();
  const fileExt = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const fileName = `${userId}-${Date.now()}.${fileExt}`;
  const filePath = `avatars/${fileName}`;

  const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file, {
    upsert: true,
    cacheControl: "3600",
  });

  if (uploadError) {
    throw new Error(`Gagal mengunggah foto: ${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(filePath);

  const { error: updateError } = await supabase
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", userId);

  if (updateError) {
    throw new Error(`Foto tersimpan tetapi profil gagal diperbarui: ${updateError.message}`);
  }

  return publicUrl;
}