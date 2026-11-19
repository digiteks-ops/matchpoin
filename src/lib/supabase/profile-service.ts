import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calculateProfileCompletion } from "@/lib/services/player-service";
import type { Gender, PreferredHand, BackhandStyle, PlayFrequency, SkillLevel, ProfileVisibility } from "@/types/database.types";

export interface ProfileInput {
  fullName: string;
  phone: string | null;
  gender: Gender | null;
  cityId: string | null;
  bio: string | null;
  playingSince: string | null;
  preferredHand: PreferredHand;
  backhand: BackhandStyle;
  playFrequency: PlayFrequency;
  selfAssessedLevel: SkillLevel;
  profileVisibility: ProfileVisibility;
  preferredCategories: string[];
  preferredTimes: string[];
}

function client() {
  return createClient();
}

export async function getProfile(userId: string) {
  const supabase = client();
  const { data: user, error: userError } = await supabase
    .from("users")
    .select("id, email, full_name, phone, avatar_url, gender, city_id")
    .eq("id", userId)
    .maybeSingle();
  if (userError) throw new Error(`Gagal memuat akun: ${userError.message}`);
  if (!user) return null;

  const [{ data: profile }, { data: rating }, { data: cities, error: cityError }] = await Promise.all([
    supabase.from("player_profiles").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("player_ratings").select("*").eq("user_id", userId).maybeSingle(),
    supabase
      .from("cities")
      .select("id, name, province, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("province", { ascending: true })
      .order("name", { ascending: true }),
  ]);
  if (cityError) throw new Error(`Gagal memuat kota: ${cityError.message}`);

  return {
    user,
    profile: profile ?? null,
    rating: rating
      ? {
          ...rating,
          current_rating: Number(rating.current_rating),
          peak_rating: Number(rating.peak_rating),
        }
      : null,
    city: (cities ?? []).find((city) => city.id === user.city_id) ?? null,
    cities: cities ?? [],
  };
}

export async function updateProfile(userId: string, input: ProfileInput) {
  const supabase = client();

  const { data: account, error: accountError } = await supabase
    .from("users")
    .select("id, full_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();
  if (accountError) throw new Error(`Gagal memuat akun: ${accountError.message}`);
  if (!account) throw new Error("Akun tidak ditemukan.");

  if (input.cityId) {
    const { data: city, error: cityError } = await supabase
      .from("cities")
      .select("id")
      .eq("id", input.cityId)
      .eq("is_active", true)
      .maybeSingle();
    if (cityError) throw new Error(`Gagal memvalidasi kota: ${cityError.message}`);
    if (!city) throw new Error("Kota yang dipilih tidak tersedia.");
  }

  const fullName = input.fullName.trim();
  const profileRow = {
    user_id: userId,
    display_name: fullName,
    bio: input.bio,
    playing_since: input.playingSince,
    preferred_hand: input.preferredHand,
    backhand: input.backhand,
    play_frequency: input.playFrequency,
    self_assessed_level: input.selfAssessedLevel,
    profile_visibility: input.profileVisibility,
    is_profile_public: input.profileVisibility === "public",
    preferred_categories: input.preferredCategories,
    preferred_times: input.preferredTimes,
  };

  const { percentage } = calculateProfileCompletion(
    { full_name: fullName, city_id: input.cityId, avatar_url: account.avatar_url, gender: input.gender },
    profileRow
  );

  const { error: userUpdateError } = await supabase
    .from("users")
    .update({
      full_name: fullName,
      phone: input.phone?.trim() || null,
      gender: input.gender,
      city_id: input.cityId,
    })
    .eq("id", userId);
  if (userUpdateError) throw new Error(`Gagal menyimpan akun: ${userUpdateError.message}`);

  const { error: profileError } = await supabase
    .from("player_profiles")
    .upsert({ ...profileRow, completion_score: percentage }, { onConflict: "user_id" });
  if (profileError) throw new Error(`Gagal menyimpan profil: ${profileError.message}`);

  return { completionScore: percentage };
}
