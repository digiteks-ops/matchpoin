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
  COALESCE(r.current_rating, 1.00) AS current_rating,
  COALESCE(r.peak_rating, 1.00) AS peak_rating,
  COALESCE(r.matches_played, 0) AS matches_played,
  COALESCE(r.wins, 0) AS wins,
  COALESCE(r.losses, 0) AS losses,
  COALESCE(r.draws, 0) AS draws,
  p.profile_visibility,
  p.updated_at
FROM users AS u
JOIN player_profiles AS p ON p.user_id = u.id
LEFT JOIN player_ratings AS r ON r.user_id = u.id
LEFT JOIN cities AS c ON c.id = u.city_id
WHERE p.is_profile_public = TRUE
  AND p.profile_visibility = 'public';
