-- ============================================================================
-- MATCHPOIN — Migration 00032: kategori awal hanya sekali
-- Run in: Supabase Dashboard -> SQL Editor (after 00031).
-- Idempotent and safe for existing rows.
--
-- Pemain memilih kategori saat pertama mendaftar dan rating awalnya mengikuti:
--   beginner 1000, intermediate 1500, advanced 2000, expert 2500.
--
-- Pilihan itu berlaku SEKALI. Sesudahnya, mengubah "Penilaian Level Sendiri"
-- di halaman profil tidak lagi menyetel ulang rating (sebelumnya trigger
-- mengulang setiap kali level diubah selama matches_played = 0).
--
-- Kolom penanda: player_ratings.starting_rating_set_at.
-- ============================================================================

-- 1) Penanda kapan rating awal diterapkan -----------------------------------
DO $do$
BEGIN
  IF to_regclass('public.player_ratings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.player_ratings
             ADD COLUMN IF NOT EXISTS starting_rating_set_at TIMESTAMPTZ';

    -- Pemain yang sudah ada sudah melewati tahap pemilihan kategori, jadi
    -- dikunci agar profil lama tidak menyetel ulang rating secara tak sengaja.
    EXECUTE 'UPDATE public.player_ratings
             SET starting_rating_set_at = COALESCE(created_at, now())
             WHERE starting_rating_set_at IS NULL';
  END IF;
END
$do$;

-- 2) RLS: baris rating awal boleh memakai rating kategori yang dipilih -------
DO $do$
BEGIN
  IF to_regclass('public.player_ratings') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "users can create their own rating" ON public.player_ratings';
    EXECUTE 'CREATE POLICY "users can create their own rating"
             ON public.player_ratings
             FOR INSERT
             WITH CHECK (
               user_id = (select auth.uid())
               AND matches_played = 0
               AND current_rating IN (1000.00, 1500.00, 2000.00, 2500.00)
             )';
  END IF;
END
$do$;

-- 3) Trigger level: terapkan rating awal satu kali saja ----------------------
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
    WHEN 'beginner' THEN 1000
  END;

  IF v_start IS NULL THEN
    RETURN NEW;
  END IF;

  -- Hanya berlaku bila rating awal belum pernah ditetapkan dan belum ada
  -- pertandingan. Setelah itu pilihan kategori tidak mengubah rating lagi.
  UPDATE public.player_ratings
  SET current_rating = v_start,
      peak_rating = GREATEST(peak_rating, v_start),
      starting_rating_set_at = now(),
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND matches_played = 0
    AND starting_rating_set_at IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dtr_starting_rating ON public.player_profiles;
CREATE TRIGGER dtr_starting_rating
  AFTER INSERT OR UPDATE OF self_assessed_level ON public.player_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_dtr_starting_rating();

-- 4) Pendaftaran: baca kategori dari metadata signUp -------------------------
-- Form pendaftaran mengirim `starting_level` di raw_user_meta_data, sehingga
-- rating awal sudah benar walau sesi browser belum aktif (email confirmation).
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
  starting_level TEXT;
  starting_rating NUMERIC;
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

  starting_level := lower(COALESCE(NEW.raw_user_meta_data->>'starting_level', ''));
  IF starting_level NOT IN ('beginner', 'intermediate', 'advanced', 'expert') THEN
    starting_level := NULL;
  END IF;

  starting_rating := CASE starting_level
    WHEN 'expert' THEN 2500
    WHEN 'advanced' THEN 2000
    WHEN 'intermediate' THEN 1500
    WHEN 'beginner' THEN 1000
    ELSE 1000
  END;

  INSERT INTO public.users (id, email, full_name, avatar_url, city_id, timezone, locale)
  VALUES (NEW.id, NEW.email, display_name, provider_avatar, default_city_id, 'Asia/Makassar', 'id')
  ON CONFLICT (id) DO NOTHING;

  -- Rating dibuat lebih dulu supaya trigger kategori menemukan baris yang sudah
  -- terkunci dan tidak menyetel ulang nilainya.
  INSERT INTO public.player_ratings (
    user_id, current_rating, peak_rating, matches_played, wins, losses, draws,
    starting_rating_set_at
  )
  VALUES (
    NEW.id, starting_rating, starting_rating, 0, 0, 0, 0,
    CASE WHEN starting_level IS NULL THEN NULL ELSE now() END
  )
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.player_profiles (user_id, display_name, self_assessed_level, completion_score)
  VALUES (NEW.id, display_name, starting_level, 40)
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