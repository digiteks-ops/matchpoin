-- MATCHPOIN V2 — Match workflow, result verification, ratings, and public directory
-- Apply this migration against the live Supabase project.
-- The earlier migrations in this folder (00001-00003) are stale and must NOT be run.
--
-- NOTE: a trigger on public.match_participants maintains matches.current_players
-- (+1 on insert, -1 on delete) and a check constraint keeps
-- current_players <= matches.max_players. Because the trigger counts every row —
-- including pending join requests and invites — the app stores
-- max_players = logical players + 2 of headroom and derives the displayed
-- roster from confirmed participant rows (see src/lib/matches/constants.ts).

-- ---------------------------------------------------------------------------
-- 1. Match results: one result per match, status normalized
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ux_match_results_match_id
  ON public.match_results (match_id);

-- match_results.status is the enum public.result_status (pending, confirmed,
-- disputed). The app also uses 'under_review' for a disputed result, so add that
-- label instead of a CHECK constraint: an enum already rejects unknown values.
ALTER TYPE public.result_status ADD VALUE IF NOT EXISTS 'under_review';

-- Drop any legacy CHECK on match_results.status; the enum is authoritative.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE conrelid = 'public.match_results'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.match_results DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2. RLS policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rating_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_ratings ENABLE ROW LEVEL SECURITY;

-- Replace any pre-existing policies so the workflow below is authoritative.
DO $$
DECLARE
  t TEXT;
  p TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'matches',
    'match_participants',
    'match_results',
    'rating_history',
    'player_ratings'
  ]
  LOOP
    FOR p IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p, t);
    END LOOP;
  END LOOP;
END $$;

-- matches -------------------------------------------------------------------

DROP POLICY IF EXISTS "matches are publicly readable" ON public.matches;
CREATE POLICY "matches are publicly readable"
  ON public.matches
  FOR SELECT
  USING (
    is_private = false
    OR organizer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = matches.id AND mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "organizers can create matches" ON public.matches;
CREATE POLICY "organizers can create matches"
  ON public.matches
  FOR INSERT
  WITH CHECK (organizer_id = auth.uid());

DROP POLICY IF EXISTS "organizers can update their matches" ON public.matches;
CREATE POLICY "organizers can update their matches"
  ON public.matches
  FOR UPDATE
  USING (organizer_id = auth.uid())
  WITH CHECK (organizer_id = auth.uid());

DROP POLICY IF EXISTS "organizers can delete their matches" ON public.matches;
CREATE POLICY "organizers can delete their matches"
  ON public.matches
  FOR DELETE
  USING (organizer_id = auth.uid());

-- match_participants --------------------------------------------------------

DROP POLICY IF EXISTS "participants are publicly readable" ON public.match_participants;
CREATE POLICY "participants are publicly readable"
  ON public.match_participants
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "users can join as themselves" ON public.match_participants;
CREATE POLICY "users can join as themselves"
  ON public.match_participants
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Organizers must be able to add another player to their own match: that insert
-- is how an invitation is created.
DROP POLICY IF EXISTS "organizers can invite participants" ON public.match_participants;
CREATE POLICY "organizers can invite participants"
  ON public.match_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_participants.match_id
        AND m.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "participants and organizers can update" ON public.match_participants;
CREATE POLICY "participants and organizers can update"
  ON public.match_participants
  FOR UPDATE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_participants.match_id AND m.organizer_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_participants.match_id AND m.organizer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "participants and organizers can remove" ON public.match_participants;
CREATE POLICY "participants and organizers can remove"
  ON public.match_participants
  FOR DELETE
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_participants.match_id AND m.organizer_id = auth.uid()
    )
  );

-- match_results -------------------------------------------------------------

DROP POLICY IF EXISTS "results are publicly readable" ON public.match_results;
CREATE POLICY "results are publicly readable"
  ON public.match_results
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "participants can submit results" ON public.match_results;
CREATE POLICY "participants can submit results"
  ON public.match_results
  FOR INSERT
  WITH CHECK (
    submitted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_results.match_id AND mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "participants can update results" ON public.match_results;
CREATE POLICY "participants can update results"
  ON public.match_results
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_results.match_id AND mp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_results.match_id AND mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "participants can delete results" ON public.match_results;
CREATE POLICY "participants can delete results"
  ON public.match_results
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = match_results.match_id AND mp.user_id = auth.uid()
    )
  );

-- rating_history ------------------------------------------------------------

DROP POLICY IF EXISTS "users can read their rating history" ON public.rating_history;
CREATE POLICY "users can read their rating history"
  ON public.rating_history
  FOR SELECT
  USING (user_id = auth.uid());

-- player_ratings ------------------------------------------------------------

DROP POLICY IF EXISTS "player ratings are publicly readable" ON public.player_ratings;
CREATE POLICY "player ratings are publicly readable"
  ON public.player_ratings
  FOR SELECT
  USING (true);

-- A player may create only their own initial rating row. Further changes go
-- exclusively through apply_match_rating_change() below.
DROP POLICY IF EXISTS "users can create their own rating" ON public.player_ratings;
CREATE POLICY "users can create their own rating"
  ON public.player_ratings
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND current_rating = 1.00
    AND matches_played = 0
  );

-- Direct writes to player_ratings are intentionally disabled; rating changes
-- are applied only through the SECURITY DEFINER function below.

-- ---------------------------------------------------------------------------
-- 2b. Onboarding policies (users / player_profiles)
--
-- Registration upserts public.users and inserts public.player_profiles from the
-- browser under the new user's own JWT. Without these policies signup fails with
-- "new row violates row-level security policy for table users".
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users can insert themselves" ON public.users;
CREATE POLICY "users can insert themselves"
  ON public.users
  FOR INSERT
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users can update themselves" ON public.users;
CREATE POLICY "users can update themselves"
  ON public.users
  FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "users can insert their own profile" ON public.player_profiles;
CREATE POLICY "users can insert their own profile"
  ON public.player_profiles
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "users can update their own profile" ON public.player_profiles;
CREATE POLICY "users can update their own profile"
  ON public.player_profiles
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Atomic rating application (SECURITY DEFINER)
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ux_rating_history_match_user
  ON public.rating_history (match_id, user_id);

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
  IF p_new_rating < 1.00 OR p_new_rating > 10.00 then
    RAISE EXCEPTION 'Rating must be between 1.00 and 10.00';
  END IF;

  -- rating_change is a generated column (new_rating - old_rating); inserting it
  -- explicitly raises 428C9, so it is left to the database.
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
    1
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

-- ---------------------------------------------------------------------------
-- 4. Signup trigger (the old trigger targets a non-existent `profiles` table)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_city_id UUID;
  display_name TEXT;
BEGIN
  SELECT id INTO default_city_id FROM public.cities WHERE name = 'Makassar' LIMIT 1;

  display_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.users (id, email, full_name, city_id, timezone, locale)
  VALUES (NEW.id, NEW.email, display_name, default_city_id, 'Asia/Makassar', 'id')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.player_profiles (user_id, display_name, completion_score)
  VALUES (NEW.id, display_name, 40)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.player_ratings (user_id, current_rating, peak_rating, matches_played, wins, losses, draws)
  VALUES (NEW.id, 1.00, 1.00, 0, 0, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. Public player directory view (safe columns only; no email/phone)
-- ---------------------------------------------------------------------------

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
  p.self_assessed_level,
  p.playing_since,
  p.preferred_categories,
  p.preferred_times,
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