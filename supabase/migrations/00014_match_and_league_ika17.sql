-- ============================================================================
-- MATCHPOIN — Migration 00014: match creation fix + Liga Tennis IKA17 model
--
-- Run in: Supabase Dashboard -> SQL Editor (whole file, top to bottom).
-- Idempotent: safe to run more than once.
--
-- Why this migration exists:
--  * `matches.court_id` was still NOT NULL on the live project, so every match
--    created with a manually typed court (court_id = NULL) failed with 23502.
--  * The live `tournaments` table stores league attributes inside `metadata`;
--    the application reads dedicated `category`, `season`, `is_league`,
--    `registration_deadline`, `league_*` and main-event columns.
--  * The live `tournament_participants` table has no entry/category/status
--    columns, so pending -> accepted/rejected registration could not work.
--  * The live project is missing the RBAC tables/functions used by the admin
--    guards, and the competition registration/approval RPCs.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Match creation fix and tournament linkage
-- ---------------------------------------------------------------------------

-- Manual courts are stored in matches.metadata (court_name/province/city) with
-- court_id NULL. The base schema still declared court_id NOT NULL.
ALTER TABLE public.matches ALTER COLUMN court_id DROP NOT NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS is_private BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tournament_id UUID REFERENCES public.tournaments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_league_challenge BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.match_participants
  ADD COLUMN IF NOT EXISTS left_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_matches_tournament
  ON public.matches (tournament_id) WHERE tournament_id IS NOT NULL;

-- A player may only occupy one slot per match, including concurrent requests.
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_participants_match_user
  ON public.match_participants (match_id, user_id);

-- ---------------------------------------------------------------------------
-- 2. League model on `tournaments`
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS season TEXT,
  ADD COLUMN IF NOT EXISTS is_league BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS registration_deadline DATE,
  ADD COLUMN IF NOT EXISTS league_key TEXT,
  ADD COLUMN IF NOT EXISTS league_name TEXT,
  ADD COLUMN IF NOT EXISTS main_event_start_date DATE,
  ADD COLUMN IF NOT EXISTS main_event_end_date DATE;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tournaments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.tournaments DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_category_check
  CHECK (category IS NULL OR category IN (
    'mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles'
  ));

-- Existing seeded leagues keep their category/season/is_league in metadata.
UPDATE public.tournaments
SET category = COALESCE(category, metadata->>'category'),
    season = COALESCE(season, metadata->>'season', 'Musim 1 2027'),
    is_league = COALESCE((metadata->>'is_league')::boolean, is_league, false),
    league_key = COALESCE(league_key, metadata->>'league_key', 'q1-2027'),
    league_name = COALESCE(league_name, metadata->>'league_name', 'MATCHPOIN League Q1 2027'),
    registration_deadline = COALESCE(registration_deadline, registration_close_at::date)
WHERE metadata IS NOT NULL;

UPDATE public.tournaments
SET is_league = true
WHERE category IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournaments_league_key
  ON public.tournaments (league_key) WHERE is_league = true;

-- ---------------------------------------------------------------------------
-- 3. Registration / entry model on `tournament_participants`
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS entry_id UUID,
  ADD COLUMN IF NOT EXISTS entry_role TEXT NOT NULL DEFAULT 'captain',
  ADD COLUMN IF NOT EXISTS partner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS joined_at TIMESTAMPTZ;

-- The base table may enforce one registration per tournament. A player must be
-- able to enter more than one category (for example Singles Man + Double Man),
-- so drop any legacy UNIQUE (tournament_id, user_id) constraint/index.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tournament_participants'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ~ 'UNIQUE \((tournament_id, user_id|user_id, tournament_id)\)'
  LOOP
    EXECUTE format('ALTER TABLE public.tournament_participants DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

DO $$
DECLARE
  i RECORD;
BEGIN
  FOR i IN
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tournament_participants'
      AND indexdef ~ 'UNIQUE.*\((tournament_id, user_id|user_id, tournament_id)\)'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', i.indexname);
  END LOOP;
END $$;

-- Legacy rows get their own entry so quota counting never merges them.
UPDATE public.tournament_participants
SET entry_id = gen_random_uuid()
WHERE entry_id IS NULL;

UPDATE public.tournament_participants tp
SET joined_at = COALESCE(tp.joined_at, now())
WHERE tp.joined_at IS NULL;

UPDATE public.tournament_participants tp
SET category = t.category
FROM public.tournaments t
WHERE tp.tournament_id = t.id AND tp.category IS NULL;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tournament_participants'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.tournament_participants DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tournament_participants
  ADD CONSTRAINT tournament_participants_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'confirmed', 'waiting_list'));

-- One active entry per player per category. Rejected rows are excluded so a
-- player can register again after a rejection.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_participants_category_user
  ON public.tournament_participants (tournament_id, category, user_id)
  WHERE status <> 'rejected';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_participants_entry_user
  ON public.tournament_participants (entry_id, user_id)
  WHERE entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_status
  ON public.tournament_participants (tournament_id, status);

ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

-- Replace any pre-existing policies so registration writes can only happen
-- through the SECURITY DEFINER functions below.
DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('tournaments', 'tournament_participants')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "registrations are publicly readable" ON public.tournament_participants;
CREATE POLICY "registrations are publicly readable" ON public.tournament_participants
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "registrations are written by the database function" ON public.tournament_participants;
CREATE POLICY "registrations are written by the database function" ON public.tournament_participants
  FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "registrations are updated by the database function" ON public.tournament_participants;
CREATE POLICY "registrations are updated by the database function" ON public.tournament_participants
  FOR UPDATE USING (false);

ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leagues are publicly readable" ON public.tournaments;
CREATE POLICY "leagues are publicly readable" ON public.tournaments
  FOR SELECT USING (true);

-- ---------------------------------------------------------------------------
-- 4. RBAC tables and functions (required by the admin guards)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_roles_code CHECK (code IN ('player', 'admin', 'super_admin'))
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  assigned_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  reason TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_roles_active
  ON public.user_roles (user_id, role_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_roles_user
  ON public.user_roles (user_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_user_roles_role
  ON public.user_roles (role_id, revoked_at);

CREATE TABLE IF NOT EXISTS public.role_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  role_id UUID REFERENCES public.roles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_role_audit_logs_action CHECK (action IN ('assigned', 'revoked', 'changed'))
);

CREATE INDEX IF NOT EXISTS idx_role_audit_logs_user
  ON public.role_audit_logs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_role_audit_logs_actor
  ON public.role_audit_logs (actor_id, created_at);

INSERT INTO public.roles (code, name)
VALUES ('player', 'Player'), ('admin', 'Admin'), ('super_admin', 'Super Admin')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_system = TRUE;

INSERT INTO public.user_roles (user_id, role_id, reason)
SELECT u.id, r.id, 'Backfill player role'
FROM public.users u
CROSS JOIN public.roles r
WHERE r.code = 'player'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role_id = r.id AND ur.revoked_at IS NULL
  );

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_readable ON public.roles;
CREATE POLICY roles_readable ON public.roles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_roles_own_read ON public.user_roles;
CREATE POLICY user_roles_own_read ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_user_roles(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    array_agg(DISTINCT r.code ORDER BY r.code),
    ARRAY['player']::TEXT[]
  )
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL;
$$;

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = p_user_id
      AND ur.revoked_at IS NULL
      AND (
        r.code = p_role
        OR (p_role = 'player' AND r.code IN ('admin', 'super_admin'))
        OR (p_role = 'admin' AND r.code = 'super_admin')
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.assign_role(
  p_target_user_id UUID,
  p_role TEXT,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id UUID;
  v_actor_roles TEXT[];
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Aktor wajib diidentifikasi.';
  END IF;
  IF p_actor_id = p_target_user_id THEN
    RAISE EXCEPTION 'User tidak dapat mengubah role miliknya sendiri.';
  END IF;
  IF p_role NOT IN ('player', 'admin', 'super_admin') THEN
    RAISE EXCEPTION 'Role % tidak ditemukan.', p_role;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('matchpoin-rbac'));
  v_actor_roles := public.get_user_roles(p_actor_id);

  IF NOT ('admin' = ANY(v_actor_roles) OR 'super_admin' = ANY(v_actor_roles)) THEN
    RAISE EXCEPTION 'Aktor tidak memiliki izin mengelola role.';
  END IF;
  IF p_role IN ('admin', 'super_admin') AND NOT ('super_admin' = ANY(v_actor_roles)) THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengelola role Admin atau Super Admin.';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE code = p_role;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % tidak ditemukan.', p_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role_id, assigned_by, reason)
  VALUES (p_target_user_id, v_role_id, p_actor_id, p_reason)
  ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL
  DO UPDATE SET assigned_by = EXCLUDED.assigned_by,
                assigned_at = now(),
                reason = EXCLUDED.reason,
                revoked_by = NULL,
                revoked_at = NULL;

  INSERT INTO public.role_audit_logs (user_id, role_id, action, actor_id, reason)
  VALUES (p_target_user_id, v_role_id, 'assigned', p_actor_id, p_reason);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_role(
  p_target_user_id UUID,
  p_role TEXT,
  p_actor_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id UUID;
  v_actor_roles TEXT[];
  v_updated INTEGER;
  v_remaining INTEGER;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION 'Aktor wajib diidentifikasi.';
  END IF;
  IF p_actor_id = p_target_user_id THEN
    RAISE EXCEPTION 'User tidak dapat mengubah role miliknya sendiri.';
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'Alasan pencabutan wajib diisi.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('matchpoin-rbac'));
  v_actor_roles := public.get_user_roles(p_actor_id);

  IF NOT ('admin' = ANY(v_actor_roles) OR 'super_admin' = ANY(v_actor_roles)) THEN
    RAISE EXCEPTION 'Aktor tidak memiliki izin mengelola role.';
  END IF;
  IF p_role IN ('admin', 'super_admin') AND NOT ('super_admin' = ANY(v_actor_roles)) THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat mengelola role Admin atau Super Admin.';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE code = p_role;
  IF v_role_id IS NULL THEN
    RAISE EXCEPTION 'Role % tidak ditemukan.', p_role;
  END IF;

  UPDATE public.user_roles
  SET revoked_by = p_actor_id, revoked_at = now(), reason = p_reason
  WHERE user_id = p_target_user_id AND role_id = v_role_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Role aktif tidak ditemukan atau sudah dicabut.';
  END IF;

  IF p_role = 'super_admin' THEN
    SELECT COUNT(*) INTO v_remaining
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.code = 'super_admin' AND ur.revoked_at IS NULL;
    IF v_remaining = 0 THEN
      RAISE EXCEPTION 'Tidak dapat mencabut Super Admin terakhir.';
    END IF;
  END IF;

  INSERT INTO public.role_audit_logs (user_id, role_id, action, actor_id, reason)
  VALUES (p_target_user_id, v_role_id, 'revoked', p_actor_id, p_reason);
END $$;

DROP POLICY IF EXISTS role_audit_admin_read ON public.role_audit_logs;
CREATE POLICY role_audit_admin_read ON public.role_audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 5. Registration audit log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.tournament_registration_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES public.tournament_participants(id) ON DELETE SET NULL,
  tournament_id UUID REFERENCES public.tournaments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  previous_status TEXT,
  new_status TEXT,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tournament_reg_audit_action CHECK (action IN ('approved', 'rejected', 'submitted')),
  CONSTRAINT chk_tournament_reg_audit_previous CHECK (
    previous_status IS NULL OR previous_status IN ('pending', 'accepted', 'confirmed', 'rejected', 'waiting_list')
  ),
  CONSTRAINT chk_tournament_reg_audit_new CHECK (
    new_status IS NULL OR new_status IN ('pending', 'accepted', 'confirmed', 'rejected', 'waiting_list')
  )
);

-- If 00013 already created this table, its checks do not allow the `accepted`
-- or `submitted` values used by this flow. Replace them.
DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tournament_registration_audit_logs'::regclass
      AND contype = 'c'
  LOOP
    EXECUTE format('ALTER TABLE public.tournament_registration_audit_logs DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.tournament_registration_audit_logs
  ADD CONSTRAINT chk_tournament_reg_audit_action CHECK (action IN ('approved', 'rejected', 'submitted')),
  ADD CONSTRAINT chk_tournament_reg_audit_previous CHECK (
    previous_status IS NULL OR previous_status IN ('pending', 'accepted', 'confirmed', 'rejected', 'waiting_list')
  ),
  ADD CONSTRAINT chk_tournament_reg_audit_new CHECK (
    new_status IS NULL OR new_status IN ('pending', 'accepted', 'confirmed', 'rejected', 'waiting_list')
  );

CREATE INDEX IF NOT EXISTS idx_tournament_reg_audit_registration
  ON public.tournament_registration_audit_logs (registration_id);
CREATE INDEX IF NOT EXISTS idx_tournament_reg_audit_tournament
  ON public.tournament_registration_audit_logs (tournament_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tournament_reg_audit_actor
  ON public.tournament_registration_audit_logs (actor_id, created_at);

ALTER TABLE public.tournament_registration_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_reg_audit_admin_read ON public.tournament_registration_audit_logs;
CREATE POLICY tournament_reg_audit_admin_read ON public.tournament_registration_audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 6. Competition registration (pending -> accepted/rejected)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_for_competition(
  p_user_id UUID,
  p_tournament_id UUID,
  p_partner_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_category TEXT;
  v_doubles BOOLEAN;
  v_entry_id UUID := gen_random_uuid();
  v_entry_count INTEGER;
  v_user_gender TEXT;
  v_partner_gender TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Harap masuk untuk mendaftar liga.');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tidak dapat mendaftarkan pemain lain.');
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id AND is_league = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Liga tidak ditemukan.');
  END IF;

  v_category := COALESCE(
    NULLIF(v_tournament.category, ''),
    NULLIF(v_tournament.metadata->>'category', '')
  );
  IF v_category IS NULL OR v_category NOT IN (
    'mens_singles', 'womens_singles', 'mens_doubles', 'womens_doubles', 'mixed_doubles'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori liga tidak valid.');
  END IF;
  v_doubles := v_category LIKE '%_doubles';

  IF v_tournament.status <> 'registration_open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pendaftaran liga belum dibuka atau sudah ditutup.');
  END IF;
  IF v_tournament.registration_deadline IS NOT NULL
     AND (now() AT TIME ZONE 'Asia/Jakarta')::date > v_tournament.registration_deadline THEN
    RETURN jsonb_build_object('success', false, 'message', 'Batas waktu pendaftaran liga sudah lewat.');
  END IF;
  IF v_doubles AND p_partner_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori ganda wajib memilih partner.');
  END IF;
  IF NOT v_doubles AND p_partner_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori tunggal tidak menggunakan partner.');
  END IF;
  IF p_partner_user_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Partner tidak boleh sama dengan diri sendiri.');
  END IF;

  SELECT gender INTO v_user_gender FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Akun pemain tidak ditemukan.');
  END IF;

  IF v_doubles THEN
    SELECT gender INTO v_partner_gender FROM public.users WHERE id = p_partner_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner tidak ditemukan.');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.tournament_participants tp
    WHERE tp.tournament_id = p_tournament_id
      AND tp.category = v_category
      AND tp.user_id IN (p_user_id, COALESCE(p_partner_user_id, p_user_id))
      AND tp.status <> 'rejected'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda atau partner sudah terdaftar di kategori ini.');
  END IF;

  IF v_category = 'mixed_doubles' THEN
    IF v_user_gender IS NULL OR v_partner_gender IS NULL
       OR v_user_gender NOT IN ('male', 'female') OR v_partner_gender NOT IN ('male', 'female') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Lengkapi jenis kelamin Anda dan partner untuk ganda campuran.');
    END IF;
    IF v_user_gender = v_partner_gender THEN
      RETURN jsonb_build_object('success', false, 'message', 'Ganda campuran wajib terdiri dari satu putra dan satu putri.');
    END IF;
  ELSIF v_category LIKE 'mens_%' THEN
    IF v_user_gender IS DISTINCT FROM 'male' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Kategori putra hanya dapat diisi pemain putra.');
    END IF;
    IF v_doubles AND v_partner_gender IS DISTINCT FROM 'male' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner ganda putra harus pemain putra.');
    END IF;
  ELSIF v_category LIKE 'womens_%' THEN
    IF v_user_gender IS DISTINCT FROM 'female' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Kategori putri hanya dapat diisi pemain putri.');
    END IF;
    IF v_doubles AND v_partner_gender IS DISTINCT FROM 'female' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner ganda putri harus pemain putri.');
    END IF;
  END IF;

  SELECT COUNT(DISTINCT COALESCE(tp.entry_id::text, tp.id::text)) INTO v_entry_count
  FROM public.tournament_participants tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.category = v_category
    AND tp.status IN ('accepted', 'confirmed');

  IF v_entry_count >= COALESCE(v_tournament.max_participants, 24) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kuota kategori ini sudah penuh.');
  END IF;

  INSERT INTO public.tournament_participants
    (tournament_id, user_id, category, entry_id, entry_role, partner_user_id, status, joined_at)
  VALUES
    (p_tournament_id, p_user_id, v_category, v_entry_id, 'captain', p_partner_user_id, 'pending', now());

  IF v_doubles AND p_partner_user_id IS NOT NULL THEN
    INSERT INTO public.tournament_participants
      (tournament_id, user_id, category, entry_id, entry_role, status, joined_at)
    VALUES
      (p_tournament_id, p_partner_user_id, v_category, v_entry_id, 'partner', 'pending', now());
  END IF;

  INSERT INTO public.tournament_registration_audit_logs
    (registration_id, tournament_id, action, actor_id, previous_status, new_status, reason)
  SELECT id, p_tournament_id, 'submitted', p_user_id, NULL, 'pending', NULL
  FROM public.tournament_participants
  WHERE entry_id = v_entry_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'category', v_category,
    'tournament_name', v_tournament.name,
    'partner_user_id', p_partner_user_id,
    'status', 'pending',
    'message', CASE WHEN v_doubles
      THEN 'Pendaftaran ganda berhasil dikirim. Menunggu persetujuan admin.'
      ELSE 'Pendaftaran berhasil dikirim. Menunggu persetujuan admin.' END
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.register_for_competition(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_competition(UUID, UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Admin approval RPCs (admin or super_admin)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_pending_registrations()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', tp.id,
        'tournamentId', t.id,
        'tournamentName', t.name,
        'tournamentCategory', tp.category,
        'tournamentMaxParticipants', t.max_participants,
        'userId', tp.user_id,
        'category', tp.category,
        'entryId', tp.entry_id,
        'entryRole', tp.entry_role,
        'partnerUserId', tp.partner_user_id,
        'status', tp.status,
        'joinedAt', tp.joined_at,
        'playerName', COALESCE(pp.display_name, u.full_name, 'Pemain MATCHPOIN'),
        'partnerName', COALESCE(pp2.display_name, u2.full_name),
        'currentEntries', (
          SELECT COUNT(DISTINCT COALESCE(x.entry_id::text, x.id::text))
          FROM public.tournament_participants x
          WHERE x.tournament_id = t.id
            AND x.category = tp.category
            AND x.status IN ('accepted', 'confirmed')
        )
      )
      ORDER BY tp.joined_at ASC
    ),
    '[]'::jsonb
  )
  FROM public.tournament_participants tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  JOIN public.users u ON u.id = tp.user_id
  LEFT JOIN public.player_profiles pp ON pp.user_id = tp.user_id
  LEFT JOIN public.users u2 ON u2.id = tp.partner_user_id
  LEFT JOIN public.player_profiles pp2 ON pp2.user_id = tp.partner_user_id
  WHERE tp.status = 'pending'
    AND t.is_league = TRUE
    AND tp.entry_role = 'captain';
$$;

CREATE OR REPLACE FUNCTION public.admin_approve_registration(
  p_registration_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg public.tournament_participants%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_confirmed INTEGER;
BEGIN
  IF NOT public.has_role(p_actor_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda tidak memiliki akses untuk menyetujui pendaftaran.');
  END IF;

  SELECT * INTO v_reg FROM public.tournament_participants
  WHERE id = p_registration_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pendaftaran tidak ditemukan atau sudah diproses.');
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_reg.tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Turnamen tidak ditemukan.');
  END IF;

  SELECT COUNT(DISTINCT COALESCE(tp.entry_id::text, tp.id::text)) INTO v_confirmed
  FROM public.tournament_participants tp
  WHERE tp.tournament_id = v_reg.tournament_id
    AND tp.category = v_reg.category
    AND tp.status IN ('accepted', 'confirmed');

  IF v_confirmed + 1 > COALESCE(v_tournament.max_participants, 24) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kuota kategori ini sudah penuh. Tidak dapat menyetujui pendaftaran.');
  END IF;

  UPDATE public.tournament_participants
  SET status = 'accepted',
      approved_at = now(),
      approved_by = p_actor_id
  WHERE tournament_id = v_reg.tournament_id
    AND category = v_reg.category
    AND (entry_id = v_reg.entry_id OR id = v_reg.id)
    AND status = 'pending';

  INSERT INTO public.tournament_registration_audit_logs
    (registration_id, tournament_id, action, actor_id, previous_status, new_status, reason)
  VALUES
    (p_registration_id, v_reg.tournament_id, 'approved', p_actor_id, 'pending', 'accepted', p_reason);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pendaftaran berhasil disetujui.',
    'tournament_id', v_reg.tournament_id,
    'tournament_name', v_tournament.name,
    'user_id', v_reg.user_id,
    'partner_user_id', v_reg.partner_user_id
  );
END $$;

-- A later migration (00017) gives p_reason a default. Dropping first keeps this
-- file re-runnable on a database that already has the newer signature.
DROP FUNCTION IF EXISTS public.admin_reject_registration(UUID, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.admin_reject_registration(
  p_registration_id UUID,
  p_actor_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reg public.tournament_participants%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
BEGIN
  IF NOT public.has_role(p_actor_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda tidak memiliki akses untuk menolak pendaftaran.');
  END IF;
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Alasan penolakan wajib diisi.');
  END IF;

  SELECT * INTO v_reg FROM public.tournament_participants
  WHERE id = p_registration_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pendaftaran tidak ditemukan atau sudah diproses.');
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_reg.tournament_id;

  UPDATE public.tournament_participants
  SET status = 'rejected'
  WHERE tournament_id = v_reg.tournament_id
    AND category = v_reg.category
    AND (entry_id = v_reg.entry_id OR id = v_reg.id)
    AND status = 'pending';

  INSERT INTO public.tournament_registration_audit_logs
    (registration_id, tournament_id, action, actor_id, previous_status, new_status, reason)
  VALUES
    (p_registration_id, v_reg.tournament_id, 'rejected', p_actor_id, 'pending', 'rejected', p_reason);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pendaftaran ditolak.',
    'tournament_id', v_reg.tournament_id,
    'tournament_name', v_tournament.name,
    'user_id', v_reg.user_id,
    'partner_user_id', v_reg.partner_user_id
  );
END $$;

CREATE OR REPLACE FUNCTION public.admin_registration_stats()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'pending_entries', (
      SELECT COUNT(DISTINCT COALESCE(entry_id::text, id::text))
      FROM public.tournament_participants
      WHERE status = 'pending'
    ),
    'accepted_entries', (
      SELECT COUNT(DISTINCT COALESCE(entry_id::text, id::text))
      FROM public.tournament_participants
      WHERE status IN ('accepted', 'confirmed')
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_pending_registrations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_approve_registration(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reject_registration(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_registrations() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_approve_registration(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_registration(UUID, UUID, TEXT) TO service_role;
REVOKE EXECUTE ON FUNCTION public.admin_registration_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_registration_stats() TO service_role;

GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assign_role(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_role(UUID, TEXT, UUID, TEXT) TO service_role;

COMMIT;
