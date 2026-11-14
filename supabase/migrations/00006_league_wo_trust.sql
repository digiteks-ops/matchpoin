-- MATCHPOIN LEAGUE — Migration untuk WO, Trust Points, dan Anti-Rematch
-- Jalankan di Supabase Dashboard → SQL Editor

-- 1. Tambah kolom walkover ke match_results
ALTER TABLE public.match_results
  ADD COLUMN IF NOT EXISTS is_walkover BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walkover_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS walkover_reason TEXT;

-- 2. Tambah trust_points ke player_profiles
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS trust_points INTEGER NOT NULL DEFAULT 0;

-- 3. Tabel liga
CREATE TABLE IF NOT EXISTS public.leagues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles')),
  season TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.league_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id UUID REFERENCES public.leagues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(league_id, user_id)
);

-- RLS untuk leagues
ALTER TABLE public.leagues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Leagues are publicly readable" ON public.leagues FOR SELECT USING (true);
CREATE POLICY "Admins can manage leagues" ON public.leagues FOR ALL USING (auth.uid() IS NOT NULL);

-- RLS untuk league_participants
ALTER TABLE public.league_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "League participants are publicly readable" ON public.league_participants FOR SELECT USING (true);
CREATE POLICY "Users can join leagues" ON public.league_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Seed Liga Q1 2027
INSERT INTO public.leagues (name, category, season, start_date, end_date, status, max_players)
VALUES
  ('MATCHPOIN League Q1 2027', 'mens_singles', 'Q1 2027', '2027-01-01', '2027-03-31', 'active', 12),
  ('MATCHPOIN League Q1 2027', 'womens_singles', 'Q1 2027', '2027-01-01', '2027-03-31', 'active', 12),
  ('MATCHPOIN League Q1 2027', 'mens_doubles', 'Q1 2027', '2027-01-01', '2027-03-31', 'active', 12),
  ('MATCHPOIN League Q1 2027', 'womens_doubles', 'Q1 2027', '2027-01-01', '2027-03-31', 'active', 12),
  ('MATCHPOIN League Q1 2027', 'mixed_doubles', 'Q1 2027', '2027-01-01', '2027-03-31', 'active', 12)
ON CONFLICT DO NOTHING;
