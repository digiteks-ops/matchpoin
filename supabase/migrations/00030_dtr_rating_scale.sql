-- ============================================================================
-- MATCHPOIN — Migration 00030: DTR (Dynamic Tennis Rating) scale
-- Run in: Supabase Dashboard -> SQL Editor (after 00029).
-- Idempotent and safe for existing rows.
--
-- DTR uses a 1000+ integer scale:
--   Beginner 1000, Intermediate 1500, Advanced 2000, Expert 2500.
-- Existing 1.00–10.00 ratings are converted monotonically without resetting:
--   1.0–2.99 → 1000–1499 (Beginner)
--   3.0–4.49 → 1500–1999 (Intermediate)
--   4.5–6.49 → 2000–2499 (Advanced)
--   6.5–8.49 → 2500–2999 (Expert)
--   8.5–10.0 → 3000–3375 (Expert)
-- Players with 0 matches then follow their self-assessed level on profile save.
-- ============================================================================

-- The live column is an enum type (skill_level). Add the new value in its own
-- committed transaction: PostgreSQL does not allow a new enum value to be used
-- in the same transaction that adds it.
DO $do$
DECLARE
  v_type_schema TEXT;
  v_type_name TEXT;
BEGIN
  SELECT tn.nspname, t.typname
  INTO v_type_schema, v_type_name
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_type t ON t.oid = a.atttypid
  JOIN pg_namespace tn ON tn.oid = t.typnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'player_profiles'
    AND a.attname = 'self_assessed_level'
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND t.typtype = 'e'
  LIMIT 1;

  IF v_type_name IS NOT NULL THEN
    EXECUTE format('ALTER TYPE %I.%I ADD VALUE IF NOT EXISTS %L', v_type_schema, v_type_name, 'expert');
  END IF;
END
$do$;

COMMIT;

BEGIN;

-- public_players depends on player_ratings.current_rating/peak_rating, so it
-- must be dropped before the column types can change. It is recreated below.
DROP VIEW IF EXISTS public.public_players;

-- This RLS policy references current_rating; drop it before ALTER COLUMN and
-- recreate it with the DTR default at the end of the migration.
DROP POLICY IF EXISTS "users can create their own rating" ON public.player_ratings;

CREATE OR REPLACE FUNCTION public.dtr_convert_legacy_rating(p_rating NUMERIC)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(
    1000::numeric,
    ROUND(
      CASE
        WHEN p_rating IS NULL THEN 1000
        WHEN p_rating < 3.0 THEN 1000 + (p_rating - 1.0) * 250
        WHEN p_rating < 4.5 THEN 1500 + (p_rating - 3.0) * (500.0 / 1.5)
        WHEN p_rating < 6.5 THEN 2000 + (p_rating - 4.5) * 250
        WHEN p_rating < 8.5 THEN 2500 + (p_rating - 6.5) * 250
        ELSE 3000 + (p_rating - 8.5) * 250
      END
    )
  )
$$;

-- 1) player_ratings ----------------------------------------------------------
DO $do$
DECLARE
  r RECORD;
  v_precision INT;
BEGIN
  IF to_regclass('public.player_ratings') IS NULL THEN
    RETURN;
  END IF;

  -- Drop every check constraint first so the column type/scale can change.
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.player_ratings'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.player_ratings DROP CONSTRAINT %I', r.conname);
  END LOOP;

  SELECT numeric_precision
  INTO v_precision
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'player_ratings'
    AND column_name = 'current_rating';

  IF v_precision IS NOT NULL AND v_precision < 7 THEN
    EXECUTE 'ALTER TABLE public.player_ratings
             ALTER COLUMN current_rating TYPE NUMERIC(7,2)
             USING public.dtr_convert_legacy_rating(current_rating)';
    EXECUTE 'ALTER TABLE public.player_ratings
             ALTER COLUMN peak_rating TYPE NUMERIC(7,2)
             USING public.dtr_convert_legacy_rating(COALESCE(peak_rating, current_rating))';
  ELSE
    EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN current_rating TYPE NUMERIC(7,2)';
    EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN peak_rating TYPE NUMERIC(7,2)';
  END IF;

  EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN current_rating SET DEFAULT 1000.00';
  EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN peak_rating SET DEFAULT 1000.00';
  EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN current_rating SET NOT NULL';
  EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN peak_rating SET NOT NULL';

  -- Safety net for partial/legacy data: DTR never goes below 1000.
  EXECUTE 'UPDATE public.player_ratings
           SET current_rating = GREATEST(1000::numeric, current_rating),
               peak_rating = GREATEST(1000::numeric, peak_rating)
           WHERE current_rating < 1000 OR peak_rating < 1000';

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'player_ratings'
      AND column_name = 'rating_algorithm_version'
  ) THEN
    EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN rating_algorithm_version SET DEFAULT 2';
  END IF;

  EXECUTE 'ALTER TABLE public.player_ratings
           ADD CONSTRAINT chk_player_ratings_current CHECK (current_rating >= 1000)';
  EXECUTE 'ALTER TABLE public.player_ratings
           ADD CONSTRAINT chk_player_ratings_peak CHECK (peak_rating >= 1000)';
  EXECUTE 'ALTER TABLE public.player_ratings
           ADD CONSTRAINT chk_player_ratings_counts
           CHECK (matches_played >= 0 AND wins >= 0 AND losses >= 0 AND draws >= 0)';
END
$do$;

-- 2) rating_history ----------------------------------------------------------
DO $do$
DECLARE
  r RECORD;
  v_precision INT;
BEGIN
  IF to_regclass('public.rating_history') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.rating_history'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.rating_history DROP CONSTRAINT %I', r.conname);
  END LOOP;

  -- rating_change is generated from old/new; rebuild it after the type change.
  EXECUTE 'ALTER TABLE public.rating_history DROP COLUMN IF EXISTS rating_change';

  SELECT numeric_precision
  INTO v_precision
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'rating_history'
    AND column_name = 'old_rating';

  IF v_precision IS NOT NULL AND v_precision < 7 THEN
    EXECUTE 'ALTER TABLE public.rating_history
             ALTER COLUMN old_rating TYPE NUMERIC(7,2)
             USING public.dtr_convert_legacy_rating(old_rating)';
    EXECUTE 'ALTER TABLE public.rating_history
             ALTER COLUMN new_rating TYPE NUMERIC(7,2)
             USING public.dtr_convert_legacy_rating(new_rating)';
    EXECUTE 'ALTER TABLE public.rating_history
             ALTER COLUMN opponent_rating TYPE NUMERIC(7,2)
             USING CASE
               WHEN opponent_rating IS NULL THEN NULL
               ELSE public.dtr_convert_legacy_rating(opponent_rating)
             END';
  ELSE
    EXECUTE 'ALTER TABLE public.rating_history ALTER COLUMN old_rating TYPE NUMERIC(7,2)';
    EXECUTE 'ALTER TABLE public.rating_history ALTER COLUMN new_rating TYPE NUMERIC(7,2)';
    EXECUTE 'ALTER TABLE public.rating_history ALTER COLUMN opponent_rating TYPE NUMERIC(7,2)';
  END IF;

  EXECUTE 'ALTER TABLE public.rating_history
           ADD COLUMN IF NOT EXISTS rating_change NUMERIC(7,2)
           GENERATED ALWAYS AS (new_rating - old_rating) STORED';

  -- Safety net for partial/legacy data.
  EXECUTE 'UPDATE public.rating_history
           SET old_rating = GREATEST(1000::numeric, old_rating),
               new_rating = GREATEST(1000::numeric, new_rating)
           WHERE old_rating < 1000 OR new_rating < 1000';
  EXECUTE 'UPDATE public.rating_history
           SET opponent_rating = 1000
           WHERE opponent_rating IS NOT NULL AND opponent_rating < 1000';

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rating_history'
      AND column_name = 'algorithm_version'
  ) THEN
    EXECUTE 'ALTER TABLE public.rating_history ALTER COLUMN algorithm_version SET DEFAULT 2';
  END IF;

  EXECUTE 'ALTER TABLE public.rating_history
           ADD CONSTRAINT chk_rating_history_old CHECK (old_rating >= 1000)';
  EXECUTE 'ALTER TABLE public.rating_history
           ADD CONSTRAINT chk_rating_history_new CHECK (new_rating >= 1000)';
  EXECUTE 'ALTER TABLE public.rating_history
           ADD CONSTRAINT chk_rating_history_opponent
           CHECK (opponent_rating IS NULL OR opponent_rating >= 1000)';
  EXECUTE 'ALTER TABLE public.rating_history
           ADD CONSTRAINT chk_rating_history_result
           CHECK (match_result IN (''win'', ''loss'', ''draw''))';
END
$do$;

-- 3) Atomic rating application (DTR bounds) ---------------------------------
CREATE OR REPLACE FUNCTION public.apply_match_rating_change(
  p_user_id UUID,
  p_match_id UUID,
  p_old_rating NUMERIC,
  p_new_rating NUMERIC,
  p_rating_change NUMERIC,
  p_change_reason TEXT,
  p_match_result TEXT,
  p_opponent_id UUID,
  p_opponent_rating NUMERIC,
  p_matches_played INTEGER,
  p_wins INTEGER,
  p_losses INTEGER,
  p_draws INTEGER,
  p_peak_rating NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_rating < 1000 OR p_new_rating > 99999 THEN
    RAISE EXCEPTION 'DTR rating must be between 1000 and 99999';
  END IF;

  -- rating_change is generated; do not write it explicitly.
  INSERT INTO public.rating_history (
    user_id,
    match_id,
    old_rating,
    new_rating,
    change_reason,
    match_result,
    opponent_id,
    opponent_rating,
    algorithm_version
  ) VALUES (
    p_user_id,
    p_match_id,
    p_old_rating,
    p_new_rating,
    p_change_reason,
    p_match_result,
    p_opponent_id,
    p_opponent_rating,
    2
  )
  ON CONFLICT (match_id, user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.player_ratings
  SET current_rating = p_new_rating,
      peak_rating = GREATEST(peak_rating, p_peak_rating, p_new_rating),
      matches_played = p_matches_played,
      wins = p_wins,
      losses = p_losses,
      draws = p_draws,
      last_match_at = now(),
      last_rating_change_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player rating row not found for %', p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_match_rating_change(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_match_rating_change(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC) TO authenticated;

-- 4) Signup trigger: new rows start at 1000 (Beginner) ----------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_city_id UUID;
  display_name TEXT;
  provider_avatar TEXT;
  profile_email TEXT;
BEGIN
  SELECT id INTO default_city_id FROM public.cities WHERE name = 'Makassar' LIMIT 1;

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(COALESCE(NEW.email, ''), '@', 1),
    'Pemain'
  );

  provider_avatar := COALESCE(
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'picture'
  );

  profile_email := COALESCE(
    NULLIF(NEW.email, ''),
    NEW.id::text || '@noemail.matchpoin.local'
  );

  INSERT INTO public.users (id, email, full_name, avatar_url, city_id, timezone, locale)
  VALUES (NEW.id, NEW.email, display_name, provider_avatar, default_city_id, 'Asia/Makassar', 'id')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.player_profiles (user_id, display_name, completion_score)
  VALUES (NEW.id, display_name, 40)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.player_ratings (user_id, current_rating, peak_rating, matches_played, wins, losses, draws)
  VALUES (NEW.id, 1000.00, 1000.00, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE
      'INSERT INTO public.profiles (id, email, full_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO NOTHING'
      USING NEW.id, profile_email, display_name, provider_avatar;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5) Starting rating from self-assessed level -------------------------------
CREATE OR REPLACE FUNCTION public.apply_dtr_starting_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start NUMERIC;
BEGIN
  IF NEW.self_assessed_level IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.self_assessed_level IS NOT DISTINCT FROM OLD.self_assessed_level THEN
    RETURN NEW;
  END IF;

  v_start := CASE NEW.self_assessed_level
    WHEN 'expert' THEN 2500
    WHEN 'advanced' THEN 2000
    WHEN 'intermediate' THEN 1500
    ELSE 1000
  END;

  UPDATE public.player_ratings
  SET current_rating = v_start,
      peak_rating = GREATEST(peak_rating, v_start),
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND matches_played = 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dtr_starting_rating ON public.player_profiles;
CREATE TRIGGER dtr_starting_rating
  AFTER INSERT OR UPDATE OF self_assessed_level ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_dtr_starting_rating();

-- Allow the Expert category in self-assessed level ---------------------------
DO $do$
DECLARE
  r RECORD;
BEGIN
  IF to_regclass('public.player_profiles') IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.player_profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%self_assessed_level%'
  LOOP
    EXECUTE format('ALTER TABLE public.player_profiles DROP CONSTRAINT %I', r.conname);
  END LOOP;

  EXECUTE 'ALTER TABLE public.player_profiles
           DROP CONSTRAINT IF EXISTS player_profiles_self_assessed_level_check';
  EXECUTE 'ALTER TABLE public.player_profiles
           ADD CONSTRAINT player_profiles_self_assessed_level_check
           CHECK (self_assessed_level IS NULL OR self_assessed_level IN (''beginner'', ''intermediate'', ''advanced'', ''expert''))';
END
$do$;

-- 6) RLS: initial rating row must start at 1000 ------------------------------
DO $do$
BEGIN
  IF to_regclass('public.player_ratings') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "users can create their own rating" ON public.player_ratings';
    EXECUTE 'CREATE POLICY "users can create their own rating"
             ON public.player_ratings
             FOR INSERT
             WITH CHECK (
               user_id = (select auth.uid())
               AND current_rating = 1000.00
               AND matches_played = 0
             )';
  END IF;
END
$do$;

-- 7) public_players view: DTR default ---------------------------------------
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