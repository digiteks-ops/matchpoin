-- MATCHPOIN V2 — Add is_private column to matches for RLS policy
-- The RLS policy in 00004_match_workflow.sql references is_private column
-- but it was never added to the matches table.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false;

-- Backfill: private matches have match_type = 'private' in metadata
UPDATE public.matches
SET is_private = true
WHERE metadata->>'match_type' = 'private';

-- Index for RLS policy performance
CREATE INDEX IF NOT EXISTS idx_matches_is_private ON public.matches (is_private);