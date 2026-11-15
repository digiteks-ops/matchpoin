-- ============================================================================
-- MATCHPOIN — Migration 00009: League Engine Foundation
-- Run in: Supabase Dashboard -> SQL Editor  (whole file, top to bottom)
-- Idempotent: safe to run multiple times.
--
-- Why this shape:
--  * The live DB already holds `tournaments` with 4 seeded Q1-2027 category
--    rows plus `tournament_participants`. Those are reused as the league
--    container and registration table rather than creating parallel `leagues`
--    tables (migration 00006 never reached this project and is superseded).
--  * One competition entry == one quota slot. A doubles team is two
--    `tournament_participants` rows sharing one `entry_id`, so
--    quota = COUNT(DISTINCT entry_id) and a team never costs two slots.
--  * Anti-rematch is a database state machine on `league_pairings` guarded by a
--    partial unique index, so two concurrent challenges cannot both succeed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Pre-flight fixes
-- ---------------------------------------------------------------------------

-- The app supports typed ("manual") court names stored in matches.metadata with
-- court_id NULL, but the base schema declared the column NOT NULL: every
-- manual-court create failed with 23502.
ALTER TABLE public.matches ALTER COLUMN court_id DROP NOT NULL;

-- Soft-withdraw marker. Nothing in the shipped schema ever added this column,
-- yet the league functions below (standings, walkover approval, cancellation)
-- and join_match/leave_match filter on it. Left as NULL for active rows so the
-- `left_at IS NULL` predicates are the canonical "still in the match" test.
ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_match_participants_active
  ON public.match_participants (match_id, user_id) WHERE left_at IS NULL;

-- Cancellation audit columns written by cancel_league_match().
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Walkover support columns (from 00006, never applied here).
ALTER TABLE public.match_results
  ADD COLUMN IF NOT EXISTS is_walkover BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS walkover_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS walkover_reason TEXT;

-- League linkage on matches, so standings derive from real columns.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_league_challenge BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_matches_tournament
  ON public.matches (tournament_id) WHERE tournament_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 1. League model on `tournaments`
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS season TEXT,
  ADD COLUMN IF NOT EXISTS is_league BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_category_check;
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_category_check
  CHECK (category IS NULL OR category IN (
    'mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles'
  ));

-- Backfill from the existing slugs.
UPDATE public.tournaments SET category = 'mens_singles',   season = 'Q1 2027', is_league = true WHERE slug = 'league-q1-2027-mens-singles'   AND category IS NULL;
UPDATE public.tournaments SET category = 'mens_doubles',   season = 'Q1 2027', is_league = true WHERE slug = 'league-q1-2027-mens-doubles'   AND category IS NULL;
UPDATE public.tournaments SET category = 'mixed_doubles',  season = 'Q1 2027', is_league = true WHERE slug = 'league-q1-2027-mixed-doubles'  AND category IS NULL;
UPDATE public.tournaments SET category = 'womens_doubles', season = 'Q1 2027', is_league = true WHERE slug = 'league-q1-2027-womens-doubles' AND category IS NULL;
UPDATE public.tournaments SET is_league = true WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_league
  ON public.tournaments (season, category) WHERE is_league = true;

-- ---------------------------------------------------------------------------
-- 2. Registration / entry model on `tournament_participants`
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS entry_id UUID,
  ADD COLUMN IF NOT EXISTS entry_role TEXT NOT NULL DEFAULT 'captain',
  ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'confirmed';

ALTER TABLE public.tournament_participants
  DROP CONSTRAINT IF EXISTS tournament_participants_status_check;
ALTER TABLE public.tournament_participants
  ADD CONSTRAINT tournament_participants_status_check
  CHECK (status IN ('pending', 'confirmed', 'rejected', 'waiting_list'));

ALTER TABLE public.tournament_participants
  DROP CONSTRAINT IF EXISTS tournament_participants_entry_role_check;
ALTER TABLE public.tournament_participants
  ADD CONSTRAINT tournament_participants_entry_role_check
  CHECK (entry_role IN ('captain', 'partner'));

-- Backfill: every pre-existing row becomes its own single entry, and inherits
-- the category of its tournament.
UPDATE public.tournament_participants tp
   SET category = t.category
  FROM public.tournaments t
 WHERE t.id = tp.tournament_id
   AND tp.category IS NULL
   AND t.category IS NOT NULL;

UPDATE public.tournament_participants SET entry_id = id WHERE entry_id IS NULL;

-- A player may hold only one entry per tournament (per category, since each
-- tournament row is a single category).
CREATE UNIQUE INDEX IF NOT EXISTS ux_tournament_entries_user
  ON public.tournament_participants (tournament_id, user_id)
  WHERE status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_tournament_entries_entry
  ON public.tournament_participants (entry_id) WHERE entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_entries_cat
  ON public.tournament_participants (tournament_id, category);

-- ---------------------------------------------------------------------------
-- 3. Anti-rematch: league pairings (state machine)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.league_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  pairing_key TEXT NOT NULL,
  entry_a UUID NOT NULL,
  entry_b UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  match_id UUID REFERENCES public.matches(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  cancelled_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_pairings_status_check
    CHECK (status IN ('pending', 'accepted', 'completed', 'wo_approved', 'rejected', 'cancelled', 'expired')),
  CONSTRAINT league_pairings_distinct_entries CHECK (entry_a <> entry_b)
);

-- One live pairing per (season, category, unordered pair). Rejected / cancelled
-- / expired rows fall outside this index, which is what re-opens the pairing;
-- completed / wo_approved stay locked for the rest of the season.
CREATE UNIQUE INDEX IF NOT EXISTS ux_league_pairings_live
  ON public.league_pairings (tournament_id, category, pairing_key)
  WHERE status IN ('pending', 'accepted', 'completed', 'wo_approved');

CREATE INDEX IF NOT EXISTS idx_league_pairings_entries
  ON public.league_pairings (entry_a, entry_b);

-- ---------------------------------------------------------------------------
-- 4. Walkover reports
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.match_wo_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  reported_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  winner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  evidence_urls TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT match_wo_reports_status_check CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_match_wo_reports_active
  ON public.match_wo_reports (match_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 5. Cancellation requests
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.match_cancellation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  agreed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  agreed_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at TIMESTAMPTZ,
  decision_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT match_cancellation_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_match_cancellation_active
  ON public.match_cancellation_requests (match_id) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- 6. League standings
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.league_standings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  category TEXT,
  entry_id UUID NOT NULL,
  position INTEGER,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  wo_won INTEGER NOT NULL DEFAULT 0,
  wo_lost INTEGER NOT NULL DEFAULT 0,
  games_won INTEGER NOT NULL DEFAULT 0,
  games_lost INTEGER NOT NULL DEFAULT 0,
  game_diff INTEGER NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  needs_tiebreak BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT league_standings_key UNIQUE (tournament_id, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_league_standings_rank
  ON public.league_standings (tournament_id, points DESC, game_diff DESC, games_won DESC);

-- ---------------------------------------------------------------------------
-- 7. Feedback
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT feedback_category_check CHECK (category IN ('bug', 'feature', 'complaint', 'question', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON public.feedback (created_at DESC);

-- ===========================================================================
-- 8. Server-side functions
-- ===========================================================================

-- Order-independent key for an unordered pair of entries (A vs B == B vs A).
CREATE OR REPLACE FUNCTION public.join_pairing_key(a UUID, b UUID)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN a::text < b::text THEN a::text || '|' || b::text
              ELSE b::text || '|' || a::text END;
$$;

-- ---------------------------------------------------------------------------
-- 8a. Atomic league registration (one entry == one quota slot)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_for_league(
  p_tournament_id UUID,
  p_partner_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_tournament RECORD;
  v_category TEXT;
  v_is_doubles BOOLEAN;
  v_quota INTEGER;
  v_taken INTEGER;
  v_entry_id UUID := gen_random_uuid();
  v_self_gender TEXT;
  v_partner_gender TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized',
      'message', 'Anda harus masuk untuk mendaftar.');
  END IF;

  SELECT id, name, category, max_participants,
         registration_open_at, registration_close_at
    INTO v_tournament
    FROM public.tournaments
   WHERE id = p_tournament_id;

  IF v_tournament.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found',
      'message', 'Liga tidak ditemukan.');
  END IF;

  v_category := COALESCE(v_tournament.category,
    CASE
      WHEN v_tournament.name ILIKE '%mixed%'       THEN 'mixed_doubles'
      WHEN v_tournament.name ILIKE '%women%doubles%' THEN 'womens_doubles'
      WHEN v_tournament.name ILIKE '%doubles%'     THEN 'mens_doubles'
      ELSE 'mens_singles'
    END);

  v_is_doubles := v_category LIKE '%doubles';
  v_quota := COALESCE(v_tournament.max_participants, 12);

  IF v_tournament.registration_close_at IS NOT NULL AND now() > v_tournament.registration_close_at THEN
    RETURN jsonb_build_object('success', false, 'reason', 'closed',
      'message', 'Pendaftaran untuk kategori ini sudah ditutup.');
  END IF;

  IF v_tournament.registration_open_at IS NOT NULL AND now() < v_tournament.registration_open_at THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_open',
      'message', 'Pendaftaran untuk kategori ini belum dibuka.');
  END IF;

  IF v_is_doubles AND p_partner_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'partner_required',
      'message', 'Kategori ganda wajib memilih partner.');
  END IF;

  IF p_partner_user_id = v_uid THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid_partner',
      'message', 'Partner tidak boleh sama dengan diri sendiri.');
  END IF;

  -- Serialise quota check + insert for this tournament.
  PERFORM pg_advisory_xact_lock(hashtext('league_reg:' || p_tournament_id::text));

  IF EXISTS (
    SELECT 1 FROM public.tournament_participants tp
     WHERE tp.tournament_id = p_tournament_id
       AND tp.user_id = v_uid
       AND tp.status <> 'rejected'
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate',
      'message', 'Anda sudah terdaftar pada kategori ini.');
  END IF;

  IF v_is_doubles THEN
    IF EXISTS (
      SELECT 1 FROM public.tournament_participants tp
       WHERE tp.tournament_id = p_tournament_id
         AND tp.user_id = p_partner_user_id
         AND tp.status <> 'rejected'
    ) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'duplicate_partner',
        'message', 'Partner yang dipilih sudah terdaftar di kategori lain.');
    END IF;

    SELECT gender INTO v_partner_gender FROM public.users WHERE id = p_partner_user_id;
    IF v_partner_gender IS NULL AND NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_partner_user_id) THEN
      RETURN jsonb_build_object('success', false, 'reason', 'invalid_partner',
        'message', 'Partner tidak ditemukan.');
    END IF;

    -- Mixed doubles: exactly one male and one female.
    IF v_category = 'mixed_doubles' THEN
      SELECT gender INTO v_self_gender FROM public.users WHERE id = v_uid;
      IF v_self_gender IS NOT NULL AND v_partner_gender IS NOT NULL
         AND v_self_gender = v_partner_gender THEN
        RETURN jsonb_build_object('success', false, 'reason', 'ineligible',
          'message', 'Ganda Campuran wajib terdiri dari 1 pemain putra dan 1 pemain putri.');
      END IF;
    END IF;
  END IF;

  -- Quota: distinct entries already registered for this tournament.
  SELECT count(*) INTO v_taken
    FROM (SELECT DISTINCT tp.entry_id
            FROM public.tournament_participants tp
           WHERE tp.tournament_id = p_tournament_id
             AND tp.status <> 'rejected'
             AND tp.entry_id IS NOT NULL) e;

  if v_taken >= v_quota THEN
    RETURN jsonb_build_object('success', false, 'reason', 'full',
      'message', 'Kuota kategori ini sudah penuh.');
  END IF;

  INSERT INTO public.tournament_participants (
    tournament_id, user_id, registered_at, category, entry_id, entry_role,
    partner_user_id, status, metadata
  ) VALUES (
    p_tournament_id, v_uid, now(), v_category, v_entry_id, 'captain',
    p_partner_user_id, 'confirmed', '{}'::jsonb
  );

  IF v_is_doubles THEN
    INSERT INTO public.tournament_participants (
      tournament_id, user_id, registered_at, category, entry_id, entry_role,
      status, metadata
    ) VALUES (
      p_tournament_id, p_partner_user_id, now(), v_category, v_entry_id, 'partner',
      'confirmed', jsonb_build_object('invited_by', v_uid)
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'entryId', v_entry_id,
    'category', v_category,
    'message', CASE WHEN v_is_doubles
      THEN 'Tim Anda berhasil didaftarkan ke MATCHPOIN League!'
      ELSE 'Anda berhasil terdaftar ke MATCHPOIN League!' END
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 8b. Anti-rematch: read current state, then create a pairing
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.league_pairing_status(
  p_tournament_id UUID,
  p_entry_a UUID,
  p_entry_b UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := public.join_pairing_key(p_entry_a, p_entry_b);
  v_status TEXT;
BEGIN
  SELECT lp.status INTO v_status
    FROM public.league_pairings lp
   WHERE lp.tournament_id = p_tournament_id
     AND lp.pairing_key = v_key
     AND lp.status IN ('pending', 'accepted', 'completed', 'wo_approved')
   LIMIT 1;

  RETURN COALESCE(v_status, 'available');
END;
$$;

CREATE OR REPLACE FUNCTION public.create_league_pairing(
  p_tournament_id UUID,
  p_entry_a UUID,
  p_entry_b UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key TEXT := public.join_pairing_key(p_entry_a, p_entry_b);
  v_existing RECORD;
  v_category TEXT;
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized',
      'message', 'Anda harus masuk.');
  END IF;

  IF p_entry_a = p_entry_b THEN
    RETURN jsonb_build_object('success', false, 'reason', 'invalid',
      'message', 'Tidak dapat menantang diri sendiri.');
  END IF;

  SELECT category INTO v_category FROM public.tournaments WHERE id = p_tournament_id;
  IF v_category IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found',
      'message', 'Liga tidak ditemukan.');
  END IF;

  SELECT id, status INTO v_existing
    FROM public.league_pairings
   WHERE tournament_id = p_tournament_id
     AND pairing_key = v_key
     AND status IN ('pending', 'accepted', 'completed', 'wo_approved')
   LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.status = 'pending' THEN
      RETURN jsonb_build_object('success', false, 'reason', 'pending',
        'message', 'Tantangan untuk lawan ini sedang menunggu konfirmasi.');
    END IF;
    IF v_existing.status = 'accepted' THEN
      RETURN jsonb_build_object('success', false, 'reason', 'accepted',
        'message', 'Tantangan dengan lawan ini sedang berjalan.');
    END IF;
    RETURN jsonb_build_object('success', false, 'reason', 'already_played',
      'message', 'Anda sudah pernah bertanding melawan lawan ini pada musim ini.');
  END IF;

  INSERT INTO public.league_pairings (
    tournament_id, category, pairing_key, entry_a, entry_b, status, created_by
  ) VALUES (
    p_tournament_id, v_category, v_key, p_entry_a, p_entry_b, 'pending', auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'pairingId', v_id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'reason', 'concurrent',
      'message', 'Tantangan untuk lawan ini sudah dibuat.');
END;
$$;

-- ---------------------------------------------------------------------------
-- 8c. Standings recompute — confirmed results only.
--     Pts = wins*3 (normal + WO). Cancelled matches are never counted.
-- ---------------------------------------------------------------------------

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

  -- One row per confirmed entry in this tournament.
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
    count(*) FILTER (WHERE s.is_win) * 3
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

  -- Rank: points, then game difference, then games won.
  WITH ranked AS (
    SELECT id,
           row_number() OVER (
             PARTITION BY tournament_id
             ORDER BY points DESC, game_diff DESC, games_won DESC, entry_id
           ) AS rn
      FROM public.league_standings
     WHERE tournament_id = p_tournament_id
  )
  UPDATE public.league_standings ls
     SET position = ranked.rn,
         updated_at = now()
    FROM ranked
   WHERE ls.id = ranked.id;

  -- Flag ties that the ordered columns above cannot separate (admin tiebreak).
  UPDATE public.league_standings a
     SET needs_tiebreak = true
    WHERE a.tournament_id = p_tournament_id
      AND EXISTS (
        SELECT 1 FROM public.league_standings b
         WHERE b.tournament_id = a.tournament_id
           AND b.entry_id <> a.entry_id
           AND b.points = a.points
           AND b.game_diff = a.game_diff
           AND b.games_won = a.games_won
      );

  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 8d. Walkover approval — always produces an official 8-0 result.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_walkover(p_report_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_report RECORD;
  v_match RECORD;
  v_admin_id UUID := auth.uid();
  v_is_official BOOLEAN := false;
  v_winner_team INTEGER;
  v_result_id UUID;
BEGIN
  SELECT * INTO v_report FROM public.match_wo_reports WHERE id = p_report_id;
  IF v_report.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Laporan WO tidak ditemukan.');
  END IF;
  IF v_report.status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Laporan ini sudah diproses.');
  END IF;

  -- Officials: active admin, or the organizer of the league / the match.
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users au
     WHERE au.user_id = v_admin_id AND au.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.tournaments t
     WHERE t.id = v_report.tournament_id AND t.organizer_id = v_admin_id
  ) OR EXISTS (
    SELECT 1 FROM public.matches m
     WHERE m.id = v_report.match_id AND m.organizer_id = v_admin_id
  ) INTO v_is_official;

  IF v_admin_id IS NULL OR NOT v_is_official THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Hanya admin resmi yang dapat menyetujui walkover.');
  END IF;

  SELECT id, organizer_id, tournament_id INTO v_match
    FROM public.matches WHERE id = v_report.match_id;

  IF v_match.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pertandingan tidak ditemukan.');
  END IF;

  -- The winning side is derived from the participants, never typed by hand.
  SELECT team INTO v_winner_team
    FROM public.match_participants
   WHERE match_id = v_report.match_id
     AND user_id = v_report.winner_user_id
     AND left_at IS NULL
   LIMIT 1;

  IF v_winner_team IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Pemenang walkover tidak valid untuk pertandingan ini.');
  END IF;

  UPDATE public.match_wo_reports
     SET status = 'approved', reviewed_by = v_admin_id, reviewed_at = now()
   WHERE id = p_report_id;

  INSERT INTO public.match_results (
    match_id, submitted_by, winner_team, team1_score, team2_score,
    status, submitted_at, confirmed_at, metadata
  ) VALUES (
    v_match.id, v_report.reported_by, v_winner_team,
    CASE WHEN v_winner_team = 1 THEN 8 ELSE 0 END,
    CASE WHEN v_winner_team = 1 THEN 0 ELSE 8 END,
    'confirmed', now(), now(),
    jsonb_build_object('walkover', true, 'approved_by', v_admin_id, 'report_id', p_report_id)
  )
  ON CONFLICT (match_id) DO UPDATE
    SET winner_team = EXCLUDED.winner_team,
        team1_score = EXCLUDED.team1_score,
        team2_score = EXCLUDED.team2_score,
        status = 'confirmed',
        confirmed_at = now()
  RETURNING id INTO v_result_id;

  UPDATE public.match_results
     SET is_walkover = true,
         walkover_by = v_report.reported_by,
         walkover_reason = v_report.reason
   WHERE id = v_result_id;

  UPDATE public.matches
     SET status = 'completed',
         result_submitted_at = now(),
         result_confirmed_at = now()
   WHERE id = v_match.id;

  -- Lock the pairing for the rest of the season.
  UPDATE public.league_pairings
     SET status = 'wo_approved', match_id = v_match.id, responded_at = now()
   WHERE match_id = v_match.id
     AND status IN ('accepted', 'pending');

  IF v_match.tournament_id IS NOT NULL THEN
    PERFORM public.recompute_league_standings(v_match.tournament_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Walkover disetujui.');
END;
$$;

-- ---------------------------------------------------------------------------
-- 8e. Cancel a league match: releases the pairing, awards no points.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cancel_league_match(
  p_match_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match RECORD;
  v_is_participant BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda harus masuk.');
  END IF;

  IF COALESCE(trim(p_reason), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Alasan pembatalan wajib diisi.');
  END IF;

  SELECT id, organizer_id, status, tournament_id INTO v_match
    FROM public.matches WHERE id = p_match_id;

  IF v_match.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pertandingan tidak ditemukan.');
  END IF;

  IF v_match.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Pertandingan yang sudah selesai atau dibatalkan tidak dapat dibatalkan lagi.');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.match_participants mp
     WHERE mp.match_id = p_match_id AND mp.user_id = v_uid AND mp.left_at IS NULL
  ) INTO v_is_participant;

  IF v_match.organizer_id <> v_uid AND NOT v_is_participant THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tidak ada izin membatalkan pertandingan ini.');
  END IF;

  UPDATE public.matches
     SET status = 'cancelled',
         cancellation_reason = trim(p_reason),
         cancelled_at = now(),
         cancelled_by = v_uid
   WHERE id = p_match_id;

  INSERT INTO public.match_cancellation_requests (
    match_id, requested_by, reason, status, decided_by, decided_at
  ) VALUES (
    p_match_id, v_uid, trim(p_reason), 'approved', v_uid, now()
  );

  -- No points are awarded: release the pairing so it can be challenged again.
  UPDATE public.league_pairings
     SET status = 'cancelled', cancelled_reason = trim(p_reason), responded_at = now()
   WHERE match_id = p_match_id
     AND status IN ('pending', 'accepted');

  IF v_match.tournament_id IS NOT NULL THEN
    PERFORM public.recompute_league_standings(v_match.tournament_id);
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'Pertandingan dibatalkan.');
END;
$$;

-- ===========================================================================
-- 9. Grants
-- ===========================================================================

GRANT EXECUTE ON FUNCTION public.join_pairing_key(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_for_league(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_pairing_status(UUID, UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_league_pairing(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_league_standings(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_walkover(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_league_match(UUID, TEXT) TO authenticated;

-- ===========================================================================
-- 10. Row Level Security
-- ===========================================================================

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_pairings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_wo_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_cancellation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leagues are publicly readable" ON public.tournaments;
CREATE POLICY "leagues are publicly readable" ON public.tournaments
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "registrations are publicly readable" ON public.tournament_participants;
CREATE POLICY "registrations are publicly readable" ON public.tournament_participants
  FOR SELECT USING (true);

-- Writes go exclusively through register_for_league().
DROP POLICY IF EXISTS "registrations are written by the database function" ON public.tournament_participants;
CREATE POLICY "registrations are written by the database function" ON public.tournament_participants
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "pairings are publicly readable" ON public.league_pairings;
CREATE POLICY "pairings are publicly readable" ON public.league_pairings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "wo reports visible to reporter" ON public.match_wo_reports;
CREATE POLICY "wo reports visible to reporter" ON public.match_wo_reports
  FOR SELECT USING (reported_by = auth.uid());

DROP POLICY IF EXISTS "participants can report walkover" ON public.match_wo_reports;
CREATE POLICY "participants can report walkover" ON public.match_wo_reports
  FOR INSERT WITH CHECK (
    reported_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
       WHERE mp.match_id = match_wo_reports.match_id
         AND mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cancellation requests visible to requester" ON public.match_cancellation_requests;
CREATE POLICY "cancellation requests visible to requester" ON public.match_cancellation_requests
  FOR SELECT USING (requested_by = auth.uid());

DROP POLICY IF EXISTS "participants can request cancellation" ON public.match_cancellation_requests;
CREATE POLICY "participants can request cancellation" ON public.match_cancellation_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.match_participants mp
       WHERE mp.match_id = match_cancellation_requests.match_id
         AND mp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "standings are publicly readable" ON public.league_standings;
CREATE POLICY "standings are publicly readable" ON public.league_standings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "anyone can submit feedback" ON public.feedback;
CREATE POLICY "anyone can submit feedback" ON public.feedback
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "users read own feedback" ON public.feedback;
CREATE POLICY "users read own feedback" ON public.feedback
  FOR SELECT USING (user_id = auth.uid());