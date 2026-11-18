-- Migration 0018: Add is_verified_player to public_players view
-- The view was missing the is_verified_player field which is required by the public player API.

CREATE OR REPLACE
SQL SECURITY INVOKER
VIEW public_players AS
SELECT
  u.id AS user_id,
  COALESCE(p.display_name, u.full_name, 'Pemain MATCHPOIN') AS display_name,
  u.full_name,
  u.avatar_url,
  u.gender,
  u.city_id,
  c.name AS city_name,
  c.province,
  p.bio,
  p.preferred_hand,
  p.backhand,
  p.play_frequency,
  p.preferred_categories,
  p.preferred_times,
  p.self_assessed_level,
  p.playing_since,
  p.completion_score,
  p.allow_invites,
  p.show_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.current_rating, 1.00) ELSE NULL END
    AS current_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.peak_rating, 1.00) ELSE NULL END
    AS peak_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.matches_played, 0) ELSE NULL END
    AS matches_played,
  CASE WHEN p.show_rating THEN COALESCE(r.wins, 0) ELSE NULL END AS wins,
  CASE WHEN p.show_rating THEN COALESCE(r.losses, 0) ELSE NULL END AS losses,
  CASE WHEN p.show_rating THEN COALESCE(r.draws, 0) ELSE NULL END AS draws,
  p.profile_visibility,
  p.is_verified_player,
  p.updated_at
FROM users AS u
JOIN player_profiles AS p ON p.user_id = u.id
LEFT JOIN player_ratings AS r ON r.user_id = u.id
LEFT JOIN cities AS c ON c.id = u.city_id
WHERE p.is_profile_public = TRUE
  AND p.profile_visibility = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles AS ur
    JOIN roles AS ro ON ro.id = ur.role_id
    WHERE ur.user_id = u.id
      AND ur.revoked_at IS NULL
      AND ro.code IN ('admin', 'super_admin')
  );