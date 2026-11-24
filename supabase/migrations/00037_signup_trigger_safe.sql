-- ============================================================================
-- MATCHPOIN — Migration 00037: pendaftaran tidak boleh gagal karena trigger
-- Run in: Supabase Dashboard -> SQL Editor (after 00036).
-- Idempotent and safe to re-run.
--
-- Gejala: "Database error saving new user" saat daftar (email maupun Google/
-- Facebook). Penyebabnya trigger `on_auth_user_created` yang berjalan SETELAH
-- baris auth.users dibuat. Bila salah satu INSERT di dalamnya gagal, seluruh
-- proses signUp dibatalkan dan Supabase mengembalikan pesan generik itu.
--
-- Titik gagal yang ditemukan:
--   1. `player_profiles.display_name` maksimal 50 karakter, sedangkan nama dari
--      Google/Facebook atau nama lengkap bisa lebih panjang.
--   2. `public.users.email` unik: akun lama yang sudah memakai email sama
--      membuat INSERT gagal.
--   3. Tabel/kolom opsional yang belum ada di project tertentu.
--
-- Perbaikan: setiap langkah dibungkus penanganan error sendiri, dan nama
-- dipotong ke batas kolom. Signup TIDAK PERNAH gagal karena pencatatan profil;
-- baris yang terlewat dilengkapi lagi saat pemain login (ensurePlayerRecords).
-- ============================================================================

BEGIN;

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
  -- Nama: prioritas metadata provider, lalu bagian lokal email, lalu "Pemain".
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

  -- Facebook bisa tidak memberi email; pakai placeholder unik per pengguna.
  v_email := COALESCE(NULLIF(NEW.email, ''), NEW.id::text || '@noemail.matchpoin.local');

  v_level := lower(COALESCE(NEW.raw_user_meta_data->>'starting_level', ''));
  IF v_level NOT IN ('beginner', 'intermediate', 'advanced', 'expert') THEN
    v_level := NULL;
  END IF;

  v_rating := CASE v_level
    WHEN 'expert' THEN 2500
    WHEN 'advanced' THEN 2000
    WHEN 'intermediate' THEN 1500
    ELSE 1000
  END;

  BEGIN
    SELECT id INTO v_city_id FROM public.cities WHERE name = 'Makassar' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_city_id := NULL;
  END;

  -- 1) public.users -----------------------------------------------------------
  BEGIN
    INSERT INTO public.users (id, email, full_name, avatar_url, city_id, timezone, locale)
    VALUES (NEW.id, NEW.email, v_display_name, v_avatar, v_city_id, 'Asia/Makassar', 'id')
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- Email yang sama sudah dipakai baris lama (mis. akun dihapus lalu daftar
    -- ulang). Simpan tanpa email agar pendaftaran tetap berhasil.
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
  --    yang belum terkunci) ----------------------------------------------------
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

  -- 3) player_profiles -------------------------------------------------------
  BEGIN
    INSERT INTO public.player_profiles (user_id, display_name, self_assessed_level, completion_score)
    VALUES (NEW.id, v_display_name, v_level::public.skill_level, 40)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Tanpa self_assessed_level, agar masalah enum tidak memblokir pendaftaran.
    BEGIN
      INSERT INTO public.player_profiles (user_id, display_name, completion_score)
      VALUES (NEW.id, v_display_name, 40)
      ON CONFLICT (user_id) DO NOTHING;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  -- 4) public.profiles (tabel lama; hanya bila memang ada) --------------------
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

COMMIT;