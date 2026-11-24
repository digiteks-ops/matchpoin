-- ============================================================================
-- MATCHPOIN — Migration 00039: penanda pemain dummy
-- Run in: Supabase Dashboard -> SQL Editor (after 00038).
-- Idempotent and safe to re-run.
--
-- Data dummy dipakai untuk mencoba seluruh fitur sebelum ada pemain asli.
-- Setiap baris yang dibuat seed ditandai agar bisa dihapus sekaligus nanti
-- tanpa menyentuh data asli:
--
--   public.users.is_dummy            = TRUE
--   public.player_profiles.is_dummy  = TRUE
--   public.matches.metadata->>'seed' = 'dummy'
--   auth.users.raw_user_meta_data->>'is_dummy' = 'true'
--
-- Tampilan publik TIDAK disembunyikan: pemain dummy tetap muncul di direktori
-- dan leaderboard supaya fitur benar-benar bisa diuji. Yang ditambahkan hanya
-- kolom penanda.
-- ============================================================================

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_dummy BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS is_dummy BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.users.is_dummy IS
  'TRUE untuk akun hasil seed simulasi; aman dihapus saat pemain asli sudah banyak.';
COMMENT ON COLUMN public.player_profiles.is_dummy IS
  'TRUE untuk profil hasil seed simulasi.';

CREATE INDEX IF NOT EXISTS idx_users_is_dummy ON public.users (is_dummy) WHERE is_dummy;
CREATE INDEX IF NOT EXISTS idx_player_profiles_is_dummy
  ON public.player_profiles (is_dummy) WHERE is_dummy;

-- View publik ikut membawa penanda + tanggal login terakhir (dari 00035).
DROP VIEW IF EXISTS public.public_players;

CREATE OR REPLACE VIEW public.public_players AS
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
  CASE WHEN p.show_rating THEN COALESCE(r.current_rating, 1000.00) ELSE NULL END AS current_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.peak_rating, 1000.00) ELSE NULL END AS peak_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.matches_played, 0) ELSE NULL END AS matches_played,
  CASE WHEN p.show_rating THEN COALESCE(r.wins, 0) ELSE NULL END AS wins,
  CASE WHEN p.show_rating THEN COALESCE(r.losses, 0) ELSE NULL END AS losses,
  CASE WHEN p.show_rating THEN COALESCE(r.draws, 0) ELSE NULL END AS draws,
  p.profile_visibility,
  p.is_verified_player,
  p.last_seen_at,
  p.is_dummy,
  p.updated_at
FROM public.users u
JOIN public.player_profiles p ON p.user_id = u.id
LEFT JOIN public.player_ratings r ON r.user_id = u.id
LEFT JOIN public.cities c ON c.id = u.city_id
WHERE p.is_profile_public = TRUE
  AND p.profile_visibility = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles ro ON ro.id = ur.role_id
    WHERE ur.user_id = u.id
      AND ur.revoked_at IS NULL
      AND ro.code IN ('admin', 'super_admin')
  );

GRANT SELECT ON public.public_players TO anon, authenticated, service_role;

COMMIT;