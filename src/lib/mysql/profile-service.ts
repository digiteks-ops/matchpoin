import { randomUUID } from "node:crypto";
import type { Connection, RowDataPacket } from "mysql2/promise";

interface UserRow extends RowDataPacket {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  gender: string | null;
  city_id: string | null;
}

interface ProfileRow extends RowDataPacket {
  id: string;
  display_name: string | null;
  bio: string | null;
  playing_since: string | null;
  preferred_hand: string | null;
  backhand: string | null;
  play_frequency: string | null;
  self_assessed_level: string | null;
  profile_visibility: string;
  is_profile_public: boolean | number;
  preferred_categories: unknown;
  preferred_times: unknown;
  completion_score: number;
  show_rating: boolean | number;
  show_history: boolean | number;
  allow_invites: boolean | number;
}

interface RatingRow extends RowDataPacket {
  current_rating: number | string;
  peak_rating: number | string;
  matches_played: number;
  wins: number;
  losses: number;
  draws: number;
}

interface CityRow extends RowDataPacket {
  id: string;
  name: string;
  province: string;
  sort_order: number | null;
}

export interface MySqlProfileInput {
  fullName: string;
  phone: string | null;
  gender: "male" | "female" | "other" | "prefer_not_to_say" | null;
  cityId: string | null;
  bio: string | null;
  playingSince: string | null;
  preferredHand: "right" | "left";
  backhand: "one_handed" | "two_handed";
  playFrequency: "daily" | "weekly" | "biweekly" | "monthly" | "occasional";
  selfAssessedLevel: "beginner" | "intermediate" | "advanced";
  profileVisibility: "public" | "friends_only" | "private";
  preferredCategories: string[];
  preferredTimes: string[];
}

function jsonArray(value: unknown): string[] {
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function profileCompletion(
  user: UserRow,
  input: MySqlProfileInput
): number {
  let score = 0;
  if (input.fullName || user.full_name) score += 20;
  if (input.cityId) score += 15;
  if (user.avatar_url) score += 15;
  if (input.gender) score += 10;
  if (input.bio && input.bio.trim().length > 10) score += 10;
  if (input.preferredHand) score += 10;
  if (input.playFrequency) score += 5;
  if (input.selfAssessedLevel) score += 5;
  if (input.preferredTimes.length > 0) score += 5;
  if (input.preferredCategories.length > 0) score += 5;
  return Math.min(score, 100);
}

export async function getMySqlProfile(connection: Connection, userId: string) {
  const [users] = await connection.execute<UserRow[]>(
    `SELECT id, email, full_name, phone, avatar_url, gender, city_id
     FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const user = users[0];
  if (!user) return null;
  const [profiles] = await connection.execute<ProfileRow[]>(
    `SELECT id, display_name, bio, playing_since, preferred_hand, backhand,
            play_frequency, self_assessed_level, profile_visibility,
            is_profile_public, preferred_categories, preferred_times,
            completion_score, show_rating, show_history, allow_invites
     FROM player_profiles WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const [ratings] = await connection.execute<RatingRow[]>(
    `SELECT current_rating, peak_rating, matches_played, wins, losses, draws
     FROM player_ratings WHERE user_id = ? LIMIT 1`,
    [userId]
  );
  const [cities] = await connection.execute<CityRow[]>(
    `SELECT id, name, province, sort_order FROM cities
     WHERE is_active = TRUE ORDER BY sort_order ASC, province ASC, name ASC`
  );
  return {
    user,
    profile: profiles[0]
      ? {
          ...profiles[0],
          preferred_categories: jsonArray(profiles[0].preferred_categories),
          preferred_times: jsonArray(profiles[0].preferred_times),
        }
      : null,
    rating: ratings[0]
      ? {
          ...ratings[0],
          current_rating: Number(ratings[0].current_rating),
          peak_rating: Number(ratings[0].peak_rating),
        }
      : null,
    city: cities.find((city) => city.id === user.city_id) ?? null,
    cities,
  };
}

export async function updateMySqlProfile(
  connection: Connection,
  userId: string,
  input: MySqlProfileInput
) {
  const [users] = await connection.execute<UserRow[]>(
    "SELECT id, full_name, avatar_url FROM users WHERE id = ? LIMIT 1 FOR UPDATE",
    [userId]
  );
  const user = users[0];
  if (!user) throw new Error("Akun tidak ditemukan.");
  if (input.cityId) {
    const [cities] = await connection.execute<CityRow[]>(
      "SELECT id FROM cities WHERE id = ? AND is_active = TRUE LIMIT 1",
      [input.cityId]
    );
    if (!cities[0]) throw new Error("Kota yang dipilih tidak tersedia.");
  }
  const completion = profileCompletion(user, input);
  await connection.execute(
    `UPDATE users SET full_name = ?, phone = ?, gender = ?, city_id = ?
     WHERE id = ?`,
    [input.fullName.trim(), input.phone?.trim() || null, input.gender, input.cityId, userId]
  );
  await connection.execute(
    `INSERT INTO player_profiles
     (id, user_id, display_name, bio, playing_since, preferred_hand, backhand,
      play_frequency, self_assessed_level, profile_visibility, is_profile_public,
      preferred_categories, preferred_times, completion_score)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       display_name = VALUES(display_name),
       bio = VALUES(bio),
       playing_since = VALUES(playing_since),
       preferred_hand = VALUES(preferred_hand),
       backhand = VALUES(backhand),
       play_frequency = VALUES(play_frequency),
       self_assessed_level = VALUES(self_assessed_level),
       profile_visibility = VALUES(profile_visibility),
       is_profile_public = VALUES(is_profile_public),
       preferred_categories = VALUES(preferred_categories),
       preferred_times = VALUES(preferred_times),
       completion_score = VALUES(completion_score)`,
    [
      randomUUID(),
      userId,
      input.fullName.trim(),
      input.bio,
      input.playingSince,
      input.preferredHand,
      input.backhand,
      input.playFrequency,
      input.selfAssessedLevel,
      input.profileVisibility,
      input.profileVisibility === "public",
      JSON.stringify(input.preferredCategories),
      JSON.stringify(input.preferredTimes),
      completion,
    ]
  );
  return { completionScore: completion };
}
