-- ============================================================================
-- MATCHPOIN — Migration 00041: MPR (MatchPoin Rating)
-- Run in: Supabase Dashboard -> SQL Editor (after 00040).
-- Idempotent and safe to re-run.
--
-- Nama sistem rating berubah dari DTR (Dynamic Tennis Rating) menjadi
-- MPR (MatchPoin Rating). Perubahan yang dibawa migrasi ini:
--
--   1. Rating awal SEMUA pemain baru = 1000 (bukan lagi menurut kategori:
--      1000/1500/2000/2500). Kategori awal tetap disimpan sebagai
--      self_assessed_level untuk preferensi & tampilan profil.
--   2. Batas kategori baru:
--        Beginner      0    – 1099
--        Intermediate  1100 – 1599
--        Advanced      1600 – 1999
--        Expert        2000+
--   3. Rating SETIAP pemain terpublish: view public_players tidak lagi
--      menyembunyikan current_rating/peak_rating/matches_played/wins/losses/
--      draws di balik kolom show_rating.
--
-- Rumus poinnya sendiri (K=80 → laga seimbang ±40) dijalankan di aplikasi
-- (src/lib/rating/mpr-core.mjs), bukan di database.
-- ============================================================================

BEGIN;

-- 1) Default kolom rating = 1000 ---------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.player_ratings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN current_rating SET DEFAULT 1000.00';
    EXECUTE 'ALTER TABLE public.player_ratings ALTER COLUMN peak_rating SET DEFAULT 1000.00';
  END IF;
END
$do$;

-- 2) RLS: baris rating awal boleh memakai 1000 --------------------------------
-- Policy lama hanya mengizinkan 1000/1500/2000/2500, sehingga pemain baru yang
-- membuat baris ratingnya sendiri akan ditolak.
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
               AND current_rating = 1000.00
             )';
  END IF;
END
$do$;

-- 3) Trigger kategori awal: MPR selalu mulai dari 1000 ------------------------
-- Nama fungsi dipertahankan agar trigger lama tetap jalan, tetapi nilainya
-- sekarang sama untuk semua kategori.
CREATE OR REPLACE FUNCTION public.apply_dtr_starting_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Kategori tidak lagi menentukan rating: MPR selalu dimulai dari 1000.
  -- Fungsi tetap menandai bahwa pemain sudah melewati tahap kategori awal.
  UPDATE public.player_ratings
  SET current_rating = 1000.00,
      peak_rating = GREATEST(peak_rating, 1000.00),
      starting_rating_set_at = now(),
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND matches_played = 0
    AND starting_rating_set_at IS NULL;

  RETURN NEW;
END;
$$;

-- 4) Signup trigger: rating awal 1000 untuk semua jalur -----------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_city_id UUID;
  v_display_name TEXT;
  v_avatar TEXT;
  v_email TEXT;
  v_level TEXT;
  v_rating NUMERIC := 1000;
BEGIN
  v_display_name := COALESCE(
    NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''),
    NULLIF(btrim(NEW.raw_user_meta_data->>'name'), ''),
    NULLIF(btrim(split_part(COALESCE(NEW.email, ''), '@', 1)), ''),
    'Pemain'
  );
  -- display_name adalah VARCHAR(50): potong agar tidak melanggar batas kolom.
  v_display_name := left(v_display_name, 50);

  v_avatar := NULLIF(
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture'),
    ''
  );

  v_email := COALESCE(NULLIF(NEW.email, ''), NEW.id::text || '@noemail.matchpoin.local');

  v_level := lower(COALESCE(NEW.raw_user_meta_data->>'starting_level', ''));
  IF v_level NOT IN ('beginner', 'intermediate', 'advanced', 'expert') THEN
    v_level := NULL;
  END IF;

  BEGIN
    SELECT id INTO v_city_id FROM public.cities WHERE name = 'Makassar' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_city_id := NULL;
  END;

  -- 1) public.users
  BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url, city_id, timezone, locale)
    VALUES (NEW.id, NEW.email, v_display_name, v_avatar, v_city_id, 'Asia/Makassar', 'id')
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    BEGIN
      INSERT INTO public.users (id, email, full_name, avatar_url, city_id, timezone, locale)
      VALUES (NEW.id, NULL, v_display_name, v_avatar, v_city_id, 'Asia/Makassar', 'id')
      ON CONFLICT (id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  WHEN OTHERS THEN
    NULL;
  END;

  -- 2) player_ratings (dibuat lebih dulu agar trigger kategori menemukan baris
  --    yang belum terkunci) --------------------------------------------------
  BEGIN
    INSERT INTO public.player_ratings (
      user_id, current_rating, peak_rating, matches_played, wins, losses, draws,
      starting_rating_set_at
    )
    VALUES (
      NEW.id, v_rating, v_rating, 0, 0, 0, 0,
      CASE WHEN v_level IS NULL THEN NULL ELSE now() END
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 3) player_profiles ------------------------------------------------------
  BEGIN
    INSERT INTO public.player_profiles (user_id, display_name, self_assessed_level, completion_score)
    VALUES (NEW.id, v_display_name, v_level::public.skill_level, 40)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.player_profiles (user_id, display_name, completion_score)
      VALUES (NEW.id, v_display_name, 40)
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  -- 4) public.profiles (tabel lama; hanya bila memang ada) ------------------
  IF to_regclass('public.profiles') IS NOT NULL THEN
    BEGIN
      EXECUTE
        'INSERT INTO public.profiles (id, email, full_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING'
        USING NEW.id, v_email, v_display_name, v_avatar;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 5) public_players: rating setiap pemain terpublish -------------------------
-- Kolom show_rating tetap ada (agar kode lama tidak error) tetapi tidak lagi
-- menyensor angka apa pun.
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
  COALESCE(p.show_rating, TRUE) AS show_rating,
  COALESCE(r.current_rating, 1000.00) AS current_rating,
  COALESCE(r.peak_rating, 1000.00) AS peak_rating,
  COALESCE(r.matches_played, 0) AS matches_played,
  COALESCE(r.wins, 0) AS wins,
  COALESCE(r.losses, 0) AS losses,
  COALESCE(r.draws, 0) AS draws,
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
