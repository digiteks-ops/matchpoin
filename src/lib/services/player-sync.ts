import { createAdminClient } from "@/lib/supabase/admin";
import { logError } from "@/lib/errors";
import { MPR_DEFAULT_RATING, mprStartingRating } from "@/lib/rating/mpr-core.mjs";
import type { SkillLevel } from "@/types/database.types";

export interface PlayerSyncResult {
  created: boolean;
  skipped: boolean;
  viaAdmin: boolean;
}

function fallbackName(email: string, fullName?: string): string {
  const trimmed = fullName?.trim();
  if (trimmed) return trimmed;
  return email.split("@")[0] || "Pemain";
}

/**
 * Ensures public.users, player_profiles and player_ratings rows exist for a user.
 *
 * The anon key cannot insert into public.users (no RLS INSERT policy), so the
 * service role is used when available. When it is not configured the function
 * returns `skipped` and the caller can fall back to the client-side sync.
 */
export async function ensurePlayerRecords(
  userId: string,
  email: string,
  fullName?: string,
  startingLevel?: SkillLevel
): Promise<PlayerSyncResult> {
  const admin = createAdminClient();
  if (!admin) {
    return { created: false, skipped: true, viaAdmin: false };
  }

  const displayName = fallbackName(email, fullName);

  const { data: existingUser, error: userError } = await admin
    .from("users")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (userError) {
    logError("onboarding.users", userError, { userId });
    return { created: false, skipped: true, viaAdmin: true };
  }

  if (!existingUser) {
    const { error: insertError } = await admin.from("users").insert({
      id: userId,
      email,
      full_name: displayName,
      timezone: "Asia/Makassar",
      locale: "id",
    });

    if (insertError) {
      logError("onboarding.insert_user", insertError, { userId });
      return { created: false, skipped: true, viaAdmin: true };
    }
  }

  const { data: existingProfile } = await admin
    .from("player_profiles")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!existingProfile) {
    const { error: profileError } = await admin.from("player_profiles").insert({
      user_id: userId,
      display_name: displayName,
      is_profile_public: true,
      profile_visibility: "public",
      preferred_hand: "right",
      backhand: "two_handed",
      play_frequency: "weekly",
      self_assessed_level: startingLevel ?? "beginner",
      completion_score: 40,
    });

    if (profileError) logError("onboarding.insert_profile", profileError, { userId });
  }

  const { data: existingRating } = await admin
    .from("player_ratings")
    .select("user_id, matches_played, starting_rating_set_at")
    .eq("user_id", userId)
    .maybeSingle();

  const startingRating = startingLevel ? mprStartingRating(startingLevel) : MPR_DEFAULT_RATING;

  if (!existingRating) {
    const { error: ratingError } = await admin.from("player_ratings").insert({
      user_id: userId,
      current_rating: startingRating,
      peak_rating: startingRating,
      matches_played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      ...(startingLevel ? { starting_rating_set_at: new Date().toISOString() } : {}),
    });

    if (ratingError) logError("onboarding.insert_rating", ratingError, { userId });
  } else if (
    startingLevel &&
    existingRating.matches_played === 0 &&
    !existingRating.starting_rating_set_at
  ) {
    // Kategori awal hanya berlaku sekali, sebelum pertandingan pertama.
    const { error: ratingError } = await admin
      .from("player_ratings")
      .update({
        current_rating: startingRating,
        peak_rating: startingRating,
        starting_rating_set_at: new Date().toISOString(),
      })
      .eq("user_id", userId)
      .is("starting_rating_set_at", null)
      .eq("matches_played", 0);

    if (ratingError) logError("onboarding.update_rating", ratingError, { userId });
  }

  return { created: !existingUser, skipped: false, viaAdmin: true };
}

export const ensurePlayerRecordsServer = ensurePlayerRecords;

/**
 * Mencatat "terakhir login" dari sisi server (dipakai callback OAuth).
 *
 * Memakai service role karena baris `player_profiles` pemain baru saja dibuat
 * dan cookie sesi belum tentu sudah terkirim ke `auth.uid()`. Best effort:
 * kegagalan dicatat di log, tidak pernah dilempar ke pemanggil.
 */
export async function recordLastSeenServer(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  if (!admin) return false;

  const { error } = await admin
    .from("player_profiles")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("user_id", userId);

  if (error) {
    logError("onboarding.record_last_seen", error, { userId });
    return false;
  }
  return true;
}