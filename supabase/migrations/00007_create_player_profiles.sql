-- MATCHPOIN V2 — Create player_profiles table
-- This table is referenced by public_players view, match creation, invites, and rating flows
-- but was never created in previous migrations.

CREATE TABLE IF NOT EXISTS public.player_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    bio TEXT,
    playing_since TEXT,
    preferred_hand TEXT CHECK (preferred_hand IN ('right', 'left')),
    backhand TEXT CHECK (backhand IN ('one_handed', 'two_handed')),
    preferred_court_id UUID REFERENCES public.tennis_courts(id) ON DELETE SET NULL,
    play_frequency TEXT CHECK (play_frequency IN ('daily', 'weekly', 'biweekly', 'monthly', 'occasional')),
    preferred_categories TEXT[],
    preferred_times TEXT[],
    self_assessed_level TEXT CHECK (self_assessed_level IN ('beginner', 'intermediate', 'advanced')),
    ntrp_rating NUMERIC(4, 2),
    itf_wtn NUMERIC(4, 2),
    usta_rating NUMERIC(4, 2),
    is_profile_public BOOLEAN NOT NULL DEFAULT true,
    profile_visibility TEXT NOT NULL DEFAULT 'public' CHECK (profile_visibility IN ('public', 'friends_only', 'private')),
    show_rating BOOLEAN NOT NULL DEFAULT true,
    show_history BOOLEAN NOT NULL DEFAULT true,
    show_online_status BOOLEAN NOT NULL DEFAULT true,
    allow_invites BOOLEAN NOT NULL DEFAULT true,
    completion_score INTEGER NOT NULL DEFAULT 50,
    is_verified_player BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;

-- Public read access for player discovery
DROP POLICY IF EXISTS "Public can read public player profiles" ON public.player_profiles;
CREATE POLICY "Public can read public player profiles"
    ON public.player_profiles
    FOR SELECT
    USING (is_profile_public = true AND COALESCE(profile_visibility, 'public') = 'public');

-- Users can insert their own profile
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.player_profiles;
CREATE POLICY "Users can insert their own profile"
    ON public.player_profiles
    FOR INSERT
    WITH CHECK (user_id = auth.uid());

-- Users can update their own profile
DROP POLICY IF EXISTS "Users can update their own profile" ON public.player_profiles;
CREATE POLICY "Users can update their own profile"
    ON public.player_profiles
    FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_player_profiles_updated_at ON public.player_profiles;
CREATE TRIGGER set_player_profiles_updated_at
    BEFORE UPDATE ON public.player_profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- Recreate public_players view (depends on player_profiles which was missing)
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
  COALESCE(r.current_rating, 1.00) AS current_rating,
  COALESCE(r.peak_rating, 1.00) AS peak_rating,
  COALESCE(r.matches_played, 0) AS matches_played,
  COALESCE(r.wins, 0) AS wins,
  COALESCE(r.losses, 0) AS losses,
  COALESCE(r.draws, 0) AS draws,
  p.profile_visibility,
  p.updated_at
FROM public.users u
JOIN public.player_profiles p ON p.user_id = u.id
LEFT JOIN public.player_ratings r ON r.user_id = u.id
LEFT JOIN public.cities c ON c.id = u.city_id
WHERE p.is_profile_public = true
  AND COALESCE(p.profile_visibility, 'public') = 'public';

GRANT SELECT ON public.public_players TO anon, authenticated;
