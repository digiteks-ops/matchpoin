-- MATCHPOIN TOURNAMENT — Tabel turnamen dan peserta
-- Jalankan di Supabase Dashboard → SQL Editor

-- 1. Tabel tournaments
CREATE TABLE IF NOT EXISTS public.tournaments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles')),
  season TEXT NOT NULL,
  registration_start DATE NOT NULL,
  registration_end DATE NOT NULL,
  event_start_date DATE NOT NULL,
  event_end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Tabel tournament_participants
CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tournament_id, user_id)
);

-- 3. RLS untuk tournaments
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tournaments are publicly readable" ON public.tournaments FOR SELECT USING (true);
CREATE POLICY "Admins can manage tournaments" ON public.tournaments FOR ALL USING (auth.uid() IS NOT NULL);

-- 4. RLS untuk tournament_participants
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tournament participants are publicly readable" ON public.tournament_participants FOR SELECT USING (true);
CREATE POLICY "Users can join tournaments" ON public.tournament_participants FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Seed turnamen MATCHPOIN November 2026 (pendaftaran 13 Nov – 31 Des 2026)
INSERT INTO public.tournaments (name, category, season, registration_start, registration_end, event_start_date, event_end_date, status, max_players)
VALUES
  ('MATCHPOIN Tournament November 2026', 'mens_singles', 'November 2026', '2026-11-13', '2026-12-31', '2027-01-05', '2027-01-12', 'upcoming', 16),
  ('MATCHPOIN Tournament November 2026', 'womens_singles', 'November 2026', '2026-11-13', '2026-12-31', '2027-01-05', '2027-01-12', 'upcoming', 16),
  ('MATCHPOIN Tournament November 2026', 'mens_doubles', 'November 2026', '2026-11-13', '2026-12-31', '2027-01-05', '2027-01-12', 'upcoming', 16),
  ('MATCHPOIN Tournament November 2026', 'womens_doubles', 'November 2026', '2026-11-13', '2026-12-31', '2027-01-05', '2027-01-12', 'upcoming', 16),
  ('MATCHPOIN Tournament November 2026', 'mixed_doubles', 'November 2026', '2026-11-13', '2026-12-31', '2027-01-05', '2027-01-12', 'upcoming', 16)
ON CONFLICT DO NOTHING;
