-- MATCHPOIN V2 — fix apply_match_rating_change for the generated column.
--
-- rating_history.rating_change is a generated column (new_rating - old_rating).
-- The first version of migration 00004 inserted an explicit value into it, which
-- makes Postgres raise 428C9 and every rating update fail.
--
-- Idempotent: safe to run more than once.

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
  IF p_new_rating < 1.00 OR p_new_rating > 10.00 THEN
    RAISE EXCEPTION 'Rating must be between 1.00 and 10.00';
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