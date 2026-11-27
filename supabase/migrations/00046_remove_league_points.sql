-- Remove +3 league points: all standings and rankings use MatchPoin Rating (MPR).

CREATE OR REPLACE FUNCTION public.recompute_league_standings(p_tournament_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category TEXT;
  v_count INTEGER := 0;
BEGIN
  SELECT category INTO v_category FROM public.tournaments WHERE id = p_tournament_id;

  DELETE FROM public.league_standings WHERE tournament_id = p_tournament_id;

  INSERT INTO public.league_standings (
    tournament_id, category, entry_id, position,
    played, won, lost, wo_won, wo_lost, games_won, games_lost, game_diff, points
  )
  SELECT
    p_tournament_id,
    v_category,
    s.entry_id,
    0,
    count(*),
    count(*) FILTER (WHERE s.is_win AND NOT s.is_wo),
    count(*) FILTER (WHERE NOT s.is_win AND NOT s.is_wo),
    count(*) FILTER (WHERE s.is_win AND s.is_wo),
    count(*) FILTER (WHERE NOT s.is_win AND s.is_wo),
    COALESCE(sum(s.games_for), 0),
    COALESCE(sum(s.games_against), 0),
    COALESCE(sum(s.games_for), 0) - COALESCE(sum(s.games_against), 0),
    0
  FROM (
    SELECT DISTINCT
           pr.match_id,
           tp.entry_id,
           CASE WHEN mp.team = 1 THEN pr.team1_score ELSE pr.team2_score END AS games_for,
           CASE WHEN mp.team = 1 THEN pr.team2_score ELSE pr.team1_score END AS games_against,
           (pr.winner_team = mp.team) AS is_win,
           pr.is_walkover AS is_wo
      FROM public.match_results pr
      JOIN public.matches m ON m.id = pr.match_id
      JOIN public.match_participants mp ON mp.match_id = pr.match_id
      JOIN public.tournament_participants tp
        ON tp.tournament_id = p_tournament_id
       AND tp.user_id = mp.user_id
     WHERE pr.status = 'confirmed'
       AND m.tournament_id = p_tournament_id
       AND mp.team IS NOT NULL
       AND mp.left_at IS NULL
  ) s
  GROUP BY s.entry_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY tournament_id
             ORDER BY won DESC, game_diff DESC, games_won DESC, entry_id
           ) AS rn
      FROM public.league_standings
     WHERE tournament_id = p_tournament_id
  )
  UPDATE public.league_standings ls
     SET position = ranked.rn,
         updated_at = now()
    FROM ranked
   WHERE ls.id = ranked.id;

  UPDATE public.league_standings a
     SET needs_tiebreak = true
    WHERE a.tournament_id = p_tournament_id
      AND EXISTS (
        SELECT 1 FROM public.league_standings b
         WHERE b.tournament_id = a.tournament_id
           AND b.entry_id <> a.entry_id
           AND b.won = a.won
           AND b.game_diff = a.game_diff
           AND b.games_won = a.games_won
      );

  RETURN v_count;
END;
$$;
