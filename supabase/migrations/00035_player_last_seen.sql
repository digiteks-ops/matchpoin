-- ============================================================================
-- MATCHPOIN — Migration 00035: info "terakhir login" di direktori pemain
-- Run in: Supabase Dashboard -> SQL Editor (after 00034).
-- Idempotent and safe to re-run.
--
-- Menu "Cari Pemain" (/players) menampilkan waktu login terakhir setiap pemain
-- dan mengurutkannya dari yang paling baru login.
--
-- Kenapa tidak memakai auth.users.last_sign_in_at langsung?
--   Kolom itu milik Supabase Auth dan TIDAK dapat dibaca lewat REST API
--   (anon/service key) untuk pengguna lain, sehingga tidak bisa dipakai oleh
--   view `public_players`. Jadi aplikasi menyimpan sendiri waktunya di
--   `player_profiles.last_seen_at` dan mengisinya lewat RPC `record_last_seen()`
--   setiap kali pemain berhasil masuk.
--
-- Isi migrasi:
--   1. kolom player_profiles.last_seen_at
--   2. backfill dari auth.users.last_sign_in_at (best effort)
--   3. RPC record_last_seen() untuk mencatat login
--   4. index untuk pengurutan "terakhir login"
--   5. view public_players + kolom last_seen_at
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Kolom penyimpan waktu login terakhir
-- ---------------------------------------------------------------------------
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

COMMENT ON COLUMN public.player_profiles.last_seen_at IS
  'Waktu login terakhir yang tercatat aplikasi (diisi oleh record_last_seen()).';

-- ---------------------------------------------------------------------------
-- 2. Backfill pemain yang sudah pernah login
-- ---------------------------------------------------------------------------
-- Hanya dijalankan bila peran yang mengeksekusi migrasi boleh membaca skema
-- `auth`. Bila tidak, migrasi tetap lanjut dan kolom dibiarkan NULL sampai
-- pemain login berikutnya.
DO $do$
BEGIN
  UPDATE public.player_profiles p
  SET last_seen_at = a.last_sign_in_at
  FROM auth.users a
  WHERE a.id = p.user_id
    AND p.last_seen_at IS NULL
    AND a.last_sign_in_at IS NOT NULL;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Lewati backfill last_seen_at: auth.users tidak dapat dibaca.';
  WHEN undefined_table THEN
    RAISE NOTICE 'Lewati backfill last_seen_at: skema auth tidak tersedia.';
END
$do$;

-- ---------------------------------------------------------------------------
-- 3. RPC pencatat login
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: pemain hanya boleh menulis barisnya sendiri, dan RLS
-- `player_profiles` memang mengizinkannya. Fungsi ini dipakai agar klien tidak
-- perlu tahu detail tabel dan agar `auth.uid()` selalu menjadi sumber identitas
-- (tidak ada user_id yang bisa dipalsukan dari klien).
CREATE OR REPLACE FUNCTION public.record_last_seen()
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_user_id UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.player_profiles
  SET last_seen_at = v_now
  WHERE user_id = v_user_id;

  RETURN v_now;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_last_seen() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_last_seen() FROM anon;
GRANT EXECUTE ON FUNCTION public.record_last_seen() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Index pengurutan "terakhir login"
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_player_profiles_last_seen
  ON public.player_profiles (last_seen_at DESC NULLS LAST)
  WHERE is_profile_public = TRUE;

-- ---------------------------------------------------------------------------
-- 5. View public_players + last_seen_at
-- ---------------------------------------------------------------------------
-- Menambah kolom berarti bentuk view berubah, jadi view harus DROP dulu
-- (`CREATE OR REPLACE VIEW` tidak boleh menambah kolom di tengah).
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