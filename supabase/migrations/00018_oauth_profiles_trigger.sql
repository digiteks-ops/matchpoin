-- ============================================================================
-- MATCHPOIN — Migration 00018: OAuth onboarding into public.profiles
-- Run in: Supabase Dashboard -> SQL Editor (after 00017).
-- Idempotent and safe for existing data.
--
-- Extends the existing on_auth_user_created trigger so a first Google/Facebook
-- login also creates a public.profiles row (name, email, provider avatar).
-- Supabase Auth handles identity linking by verified email; this trigger only
-- fills the app profile and never creates a second auth user.
-- ============================================================================

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

  -- Facebook can return a user without an email. profiles.email is UNIQUE and
  -- NOT NULL, so fall back to a per-user placeholder instead of failing signup.
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
  VALUES (NEW.id, 1.00, 1.00, 0, 0, 0, 0)
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
