-- ============================================================================
-- MATCHPOIN — Migration 00026: store the logical capacity in matches.max_players
-- Run in: Supabase SQL Editor (after 00025). Idempotent.
--
-- Creation used to store capacity + join headroom (singles 4, doubles 6) while
-- the UI shows the logical capacity (2 / 4), so cards and detail pages disagreed.
-- ============================================================================

UPDATE public.matches
SET max_players = CASE
  WHEN COALESCE(metadata ->> 'category', 'mens_singles') LIKE '%doubles%' THEN 4
  ELSE 2
END
WHERE max_players IS DISTINCT FROM CASE
  WHEN COALESCE(metadata ->> 'category', 'mens_singles') LIKE '%doubles%' THEN 4
  ELSE 2
END;