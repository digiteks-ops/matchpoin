import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { assertValidImageFile, compressImage } from "@/lib/utils/image";
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

  // Never overwrite an existing account: full_name and city_id are editable in
  // the profile form. The old upsert reset them to auth metadata on every load.
  const { data: existingUser, error: existingUserError } = await supabase
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (existingUserError) {
    throw new Error(`Gagal menyiapkan data pemain: ${existingUserError.message}`);
  }

  if (!existingUser) {
    const { error: userError } = await supabase.from("users").insert({
      id: userId,
      email,
      full_name: fullName || email.split("@")[0],
      city_id: cityId,
      timezone: "Asia/Makassar",
      locale: "id",
    });
    if (userError) {
      throw new Error(`Gagal menyiapkan data pemain: ${userError.message}`);
    }
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
      current_rating: 1000,
      peak_rating: 1000,
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
 * Uploads a profile photo: validates (JPG/PNG/WEBP, max 10 MB), compresses in
 * the browser (512 px, ≤300 KB, WebP), stores only the resulting path/URL and
 * removes the previous file when it is replaced.
 */
export async function uploadAvatar(
  userId: string,
  file: File,
  onStage?: (stage: "compress" | "upload") => void
): Promise<string> {
  assertValidImageFile(file);
  onStage?.("compress");

  const compressed = await compressImage(file, {
    maxBytes: 300 * 1024,
    maxDimension: 512,
    quality: 0.8,
    mimeType: "image/webp",
  });

  const supabase = createClient();
  const extension = compressed.type === "image/webp" ? "webp" : "jpg";
  // Folder per user keeps the storage policy simple: {userId}/...
  const filePath = `${userId}/avatar-${Date.now()}.${extension}`;

  const { data: current } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", userId)
    .maybeSingle();
  const previousKey = avatarKeyFromUrl(
    (current as { avatar_url?: string | null } | null)?.avatar_url ?? null
  );

  onStage?.("upload");
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(filePath, compressed, {
      upsert: false,
      cacheControl: "3600",
      contentType: compressed.type,
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

  if (previousKey && previousKey !== filePath) {
    // Best effort: an orphan file must not fail the avatar update.
    const { error: removeError } = await supabase.storage
      .from("avatars")
      .remove([previousKey]);
    if (removeError) {
      console.warn("Gagal menghapus foto profil lama:", removeError.message);
    }
  }

  return publicUrl;
}

/**
 * Converts a stored avatar value (public URL or storage key) into a bucket path.
 * Returns null when the value is not an avatars object.
 */
export function avatarKeyFromUrl(value: string | null): string | null {
  if (!value) return null;
  if (value.includes("..")) return null;
  const marker = "/object/public/avatars/";
  const markerIndex = value.indexOf(marker);
  if (markerIndex >= 0) {
    return decodeURIComponent(value.slice(markerIndex + marker.length));
  }
  if (value.startsWith("avatars/")) return value;
  return null;
}