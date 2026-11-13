-- supabase/migrations/00003_add_match_metadata.sql
-- Add metadata columns for race-to-8 format and no‑ad rule

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS race_to INTEGER NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS no_ad BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS court_swapped BOOLEAN NOT NULL DEFAULT false;

-- No additional RLS changes needed – existing policies cover matches.
