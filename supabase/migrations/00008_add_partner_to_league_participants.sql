-- MATCHPOIN LEAGUE — Add partner_user_id to league_participants for doubles registration
ALTER TABLE public.league_participants
  ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES auth.users(id);

-- Add index for partner lookups
CREATE INDEX IF NOT EXISTS idx_league_participants_partner_user_id
  ON public.league_participants (partner_user_id);
