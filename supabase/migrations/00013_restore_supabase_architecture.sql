-- ============================================================================
-- MATCHPOIN — 00013_restore_supabase_architecture.sql
--
-- Restores the MySQL-era application features onto Supabase PostgreSQL so the
-- whole application can run on Supabase Auth + PostgreSQL + Storage + Realtime.
--
-- This migration is additive and idempotent:
--   * CREATE TABLE IF NOT EXISTS / CREATE OR REPLACE only (no drops, no deletes)
--   * No duplicate tables: it only adds the tables that exist in MySQL but are
--     missing from Supabase (RBAC, notifications, file metadata, registration
--     audit log) and recreates the public_players view with the same shape.
--   * Rating formulas are untouched (rating engine lives in 00004/00009).
--   * Existing data is preserved; backfills use NOT EXISTS guards.
--
-- Run with: psql "$SUPABASE_DB_URL" -f supabase/migrations/00013_restore_supabase_architecture.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. RBAC (parity with mysql/migrations/0010 + 0011)
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

CREATE TABLE IF NOT EXISTS public.rbac_security_state (
  id SMALLINT PRIMARY KEY,
  lock_name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_rbac_security_state_singleton CHECK (id = 1)
);

INSERT INTO public.rbac_security_state (id, lock_name)
VALUES (1, 'global-rbac-lock')
ON CONFLICT (id) DO UPDATE SET lock_name = EXCLUDED.lock_name;

INSERT INTO public.roles (code, name)
VALUES ('player', 'Player'), ('admin', 'Admin'), ('super_admin', 'Super Admin')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_system = TRUE;

-- Backfill the default player role for every existing user (no duplicates).
INSERT INTO public.user_roles (user_id, role_id, reason)
SELECT u.id, r.id, 'Backfill player role'
FROM public.users u
CROSS JOIN public.roles r
WHERE r.code = 'player'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = u.id AND ur.role_id = r.id AND ur.revoked_at IS NULL
  );

INSERT INTO public.role_audit_logs (user_id, role_id, action, reason)
SELECT ur.user_id, ur.role_id, 'assigned', 'Backfill player role'
FROM public.user_roles ur
JOIN public.roles r ON r.id = ur.role_id
WHERE r.code = 'player' AND ur.reason = 'Backfill player role'
  AND NOT EXISTS (
    SELECT 1 FROM public.role_audit_logs al
    WHERE al.user_id = ur.user_id AND al.role_id = ur.role_id
      AND al.reason = 'Backfill player role'
  );

-- Backfill admin grants from the legacy admin_users table when it exists.
DO $$
BEGIN
  IF to_regclass('public.admin_users') IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, reason)
    SELECT au.user_id, r.id, 'Backfill from admin_users'
    FROM public.admin_users au
    CROSS JOIN public.roles r
    WHERE r.code = 'admin' AND au.is_active = TRUE
      AND NOT EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = au.user_id AND ur.role_id = r.id AND ur.revoked_at IS NULL
      );

    INSERT INTO public.role_audit_logs (user_id, role_id, action, reason)
    SELECT ur.user_id, ur.role_id, 'assigned', 'Backfill from admin_users'
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.code = 'admin' AND ur.reason = 'Backfill from admin_users'
      AND NOT EXISTS (
        SELECT 1 FROM public.role_audit_logs al
        WHERE al.user_id = ur.user_id AND al.role_id = ur.role_id
          AND al.reason = 'Backfill from admin_users'
      );
  END IF;
END $$;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_security_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS roles_read ON public.roles;
CREATE POLICY roles_read ON public.roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS user_roles_own_read ON public.user_roles;
CREATE POLICY user_roles_own_read ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Writes go exclusively through SECURITY DEFINER RPCs / service role.

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

-- Mirrors assertActorCanManageRole + assignRole from src/lib/mysql/rbac-core.mjs.
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

-- One-time operator bootstrap (called only from a server script holding the
-- bootstrap secret). Mirrors bootstrapFirstSuperAdmin.
CREATE OR REPLACE FUNCTION public.bootstrap_first_super_admin(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User target wajib diisi.';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('matchpoin-rbac'));

  IF EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE r.code = 'super_admin' AND ur.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Super Admin sudah tersedia. Bootstrap tidak dapat diulang.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'User target belum terdaftar.';
  END IF;

  SELECT id INTO v_role_id FROM public.roles WHERE code = 'super_admin';
  INSERT INTO public.user_roles (user_id, role_id, reason)
  VALUES (p_user_id, v_role_id, 'Initial operator bootstrap');
  INSERT INTO public.role_audit_logs (user_id, role_id, action, reason)
  VALUES (p_user_id, v_role_id, 'assigned', 'Initial operator bootstrap');
END $$;

-- Idempotent onboarding used by login/callback: users + profile + rating + role.
CREATE OR REPLACE FUNCTION public.ensure_user_records(
  p_user_id UUID,
  p_email TEXT,
  p_full_name TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_player_role UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Tidak dapat menyinkronkan akun pemain lain.';
  END IF;

  INSERT INTO public.users (id, email, full_name)
  VALUES (p_user_id, p_email, COALESCE(NULLIF(btrim(p_full_name), ''), split_part(p_email, '@', 1)))
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(public.users.full_name, EXCLUDED.full_name);

  INSERT INTO public.player_profiles (user_id, display_name)
  VALUES (p_user_id, COALESCE(NULLIF(btrim(p_full_name), ''), split_part(p_email, '@', 1)))
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.player_ratings (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT id INTO v_player_role FROM public.roles WHERE code = 'player';
  IF v_player_role IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id, reason)
    VALUES (p_user_id, v_player_role, 'Default player role')
    ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_user_records(UUID, TEXT, TEXT) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.assign_role(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_role(UUID, TEXT, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_super_admin(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_role(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_role(UUID, TEXT, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bootstrap_first_super_admin(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Notifications (parity with mysql/migrations/0013) + Realtime
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  data JSONB,
  reference_id UUID,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id, is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_own_read ON public.notifications;
CREATE POLICY notifications_own_read ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS notifications_own_update ON public.notifications;
CREATE POLICY notifications_own_update ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
EXCEPTION WHEN undefined_object THEN
  NULL; -- publication not present on this project; broadcast channel still works
END $$;

-- ---------------------------------------------------------------------------
-- 3. File metadata (parity with mysql/migrations/0014)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.file_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  bucket TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  kind TEXT NOT NULL,
  reference_id UUID,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_file_metadata_kind CHECK (kind IN ('avatar', 'evidence', 'tournament_document'))
);

CREATE INDEX IF NOT EXISTS idx_file_metadata_user ON public.file_metadata (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_file_metadata_reference ON public.file_metadata (kind, reference_id);
CREATE INDEX IF NOT EXISTS idx_file_metadata_unverified ON public.file_metadata (verified_at, kind);

ALTER TABLE public.file_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS file_metadata_own_read ON public.file_metadata;
CREATE POLICY file_metadata_own_read ON public.file_metadata
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Tournament registration audit log (parity with mysql/migrations/0017)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tournament_registration_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES public.tournament_participants(id) ON DELETE CASCADE,
  tournament_id UUID NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  previous_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_tournament_reg_audit_action CHECK (action IN ('approved', 'rejected')),
  CONSTRAINT chk_tournament_reg_audit_status CHECK (
    previous_status IN ('pending', 'confirmed', 'rejected', 'waiting_list') AND
    new_status IN ('pending', 'confirmed', 'rejected', 'waiting_list')
  )
);

CREATE INDEX IF NOT EXISTS idx_tournament_reg_audit_registration
  ON public.tournament_registration_audit_logs (registration_id);
CREATE INDEX IF NOT EXISTS idx_tournament_reg_audit_tournament
  ON public.tournament_registration_audit_logs (tournament_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tournament_reg_audit_actor
  ON public.tournament_registration_audit_logs (actor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tournament_participants_tournament_status
  ON public.tournament_participants (tournament_id, status);

ALTER TABLE public.tournament_registration_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tournament_reg_audit_admin_read ON public.tournament_registration_audit_logs;
CREATE POLICY tournament_reg_audit_admin_read ON public.tournament_registration_audit_logs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ---------------------------------------------------------------------------
-- 5. users parity columns (auth session invalidation, mysql/migrations/0008)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS auth_session_version INTEGER NOT NULL DEFAULT 1;

-- League slugs: the MySQL seed uses human-readable ids such as
-- `ika17-mens-singles`. Supabase tournaments use UUID ids, so keep the slug in
-- its own column (no duplicate table, no id rewrite) and resolve by slug when
-- clients still send the legacy identifier.
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS slug TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_tournaments_slug
  ON public.tournaments (slug) WHERE slug IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. public_players view parity (mysql/migrations/0016 + 0018)
--    Same columns/semantics as MySQL: rating visibility + admin exclusion +
--    is_verified_player. Rating values are read from player_ratings unchanged.
-- ---------------------------------------------------------------------------
-- A view stores no data, so replacing it cannot lose rows. Dropping first avoids
-- `cannot change name of view column` when the deployed column order differs.
DROP VIEW IF EXISTS public.public_players;

CREATE OR REPLACE VIEW public.public_players AS
SELECT
  u.id AS user_id,
  COALESCE(p.display_name, u.full_name, 'Pemain MATCHPOIN') AS display_name,
  u.full_name,
  u.avatar_url,
  u.gender,
  u.city_id,
  c.name AS city_name,
  c.province,
  p.bio,
  p.preferred_hand,
  p.backhand,
  p.play_frequency,
  p.preferred_categories,
  p.preferred_times,
  p.self_assessed_level,
  p.playing_since,
  p.completion_score,
  p.allow_invites,
  p.show_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.current_rating, 1.00) ELSE NULL END AS current_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.peak_rating, 1.00) ELSE NULL END AS peak_rating,
  CASE WHEN p.show_rating THEN COALESCE(r.matches_played, 0) ELSE NULL END AS matches_played,
  CASE WHEN p.show_rating THEN COALESCE(r.wins, 0) ELSE NULL END AS wins,
  CASE WHEN p.show_rating THEN COALESCE(r.losses, 0) ELSE NULL END AS losses,
  CASE WHEN p.show_rating THEN COALESCE(r.draws, 0) ELSE NULL END AS draws,
  p.profile_visibility,
  p.is_verified_player,
  p.updated_at
FROM public.users u
JOIN public.player_profiles p ON p.user_id = u.id
LEFT JOIN public.player_ratings r ON r.user_id = u.id
LEFT JOIN public.cities c ON c.id = u.city_id
WHERE p.is_profile_public = TRUE
  AND p.profile_visibility = 'public'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles ro ON ro.id = ur.role_id
    WHERE ur.user_id = u.id
      AND ur.revoked_at IS NULL
      AND ro.code IN ('admin', 'super_admin')
  );

GRANT SELECT ON public.public_players TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Match roster integrity (parity with mysql/migrations/0019)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_match_participants_match_user
  ON public.match_participants (match_id, user_id);

-- ---------------------------------------------------------------------------
-- 8. Competition registration RPC (pending + super-admin approval workflow)
--    Mirrors src/lib/mysql/competition-registration-core.mjs rules and the
--    MySQL registerForCompetition flow. Atomic: tournament row lock + inserts.
--    The legacy register_for_league RPC is intentionally left untouched.
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

  v_category := COALESCE(NULLIF(v_tournament.category, ''), 'mens_singles');
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

  IF EXISTS (
    SELECT 1 FROM public.tournament_participants tp
    WHERE tp.tournament_id = p_tournament_id
      AND tp.user_id IN (p_user_id, COALESCE(p_partner_user_id, p_user_id))
      AND tp.status <> 'rejected'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda atau partner sudah terdaftar di liga ini.');
  END IF;

  IF v_doubles THEN
    SELECT gender INTO v_partner_gender FROM public.users WHERE id = p_partner_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner tidak ditemukan.');
    END IF;
    IF v_category = 'mixed_doubles' THEN
      SELECT gender INTO v_user_gender FROM public.users WHERE id = p_user_id;
      IF v_user_gender IS NULL OR v_partner_gender IS NULL
         OR v_user_gender NOT IN ('male', 'female') OR v_partner_gender NOT IN ('male', 'female') THEN
        RETURN jsonb_build_object('success', false, 'message', 'Lengkapi jenis kelamin Anda dan partner untuk ganda campuran.');
      END IF;
      IF v_user_gender = v_partner_gender THEN
        RETURN jsonb_build_object('success', false, 'message', 'Ganda campuran wajib terdiri dari satu putra dan satu putri.');
      END IF;
    ELSIF v_category = 'mens_doubles' AND (v_partner_gender IS DISTINCT FROM 'male') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner ganda putra harus pemain putra.');
    ELSIF v_category = 'womens_doubles' AND (v_partner_gender IS DISTINCT FROM 'female') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner ganda putri harus pemain putri.');
    END IF;
  END IF;

  SELECT COUNT(DISTINCT entry_id) INTO v_entry_count
  FROM public.tournament_participants
  WHERE tournament_id = p_tournament_id AND status <> 'rejected';

  IF v_entry_count >= v_tournament.max_participants THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kuota liga sudah penuh.');
  END IF;

  INSERT INTO public.tournament_participants
    (tournament_id, user_id, category, entry_id, entry_role, partner_user_id, status)
  VALUES
    (p_tournament_id, p_user_id, v_category, v_entry_id, 'captain', p_partner_user_id, 'pending');

  IF v_doubles AND p_partner_user_id IS NOT NULL THEN
    INSERT INTO public.tournament_participants
      (tournament_id, user_id, category, entry_id, entry_role, status)
    VALUES
      (p_tournament_id, p_partner_user_id, v_category, v_entry_id, 'partner', 'pending');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'category', v_category,
    'tournament_name', v_tournament.name,
    'partner_user_id', p_partner_user_id,
    'message', CASE WHEN v_doubles
      THEN 'Pendaftaran ganda berhasil dikirim. Menunggu persetujuan Super Admin.'
      ELSE 'Pendaftaran berhasil dikirim. Menunggu persetujuan Super Admin.' END
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.register_for_competition(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_competition(UUID, UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Super-admin registration approval / rejection RPCs (atomic + audit)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_pending_registrations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'Hanya Super Admin yang dapat melihat pendaftaran.';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
    FROM (
      SELECT
        tp.id,
        tp.tournament_id AS "tournamentId",
        t.name AS "tournamentName",
        t.category AS "tournamentCategory",
        t.max_participants AS "tournamentMaxParticipants",
        tp.user_id AS "userId",
        tp.category,
        tp.entry_id AS "entryId",
        tp.entry_role AS "entryRole",
        tp.partner_user_id AS "partnerUserId",
        tp.status,
        tp.joined_at AS "joinedAt",
        COALESCE(pp.display_name, u.full_name, 'Pemain MATCHPOIN') AS "playerName",
        COALESCE(pp2.display_name, u2.full_name) AS "partnerName",
        (SELECT COUNT(DISTINCT entry_id) FROM public.tournament_participants
         WHERE tournament_id = t.id AND status <> 'rejected') AS "currentEntries"
      FROM public.tournament_participants tp
      JOIN public.tournaments t ON t.id = tp.tournament_id
      JOIN public.users u ON u.id = tp.user_id
      LEFT JOIN public.player_profiles pp ON pp.user_id = tp.user_id
      LEFT JOIN public.users u2 ON u2.id = tp.partner_user_id
      LEFT JOIN public.player_profiles pp2 ON pp2.user_id = tp.partner_user_id
      WHERE tp.status = 'pending' AND t.is_league = TRUE
      ORDER BY tp.joined_at ASC
    ) t
  );
END $$;

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
  IF NOT public.has_role(p_actor_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hanya Super Admin yang dapat menyetujui pendaftaran.');
  END IF;

  SELECT * INTO v_reg FROM public.tournament_participants
  WHERE id = p_registration_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pendaftaran tidak ditemukan atau sudah diproses.');
  END IF;

  SELECT * INTO v_tournament FROM public.tournaments WHERE id = v_reg.tournament_id FOR UPDATE;

  SELECT COUNT(DISTINCT entry_id) INTO v_confirmed
  FROM public.tournament_participants
  WHERE tournament_id = v_reg.tournament_id AND status = 'confirmed';

  IF v_confirmed + 1 > v_tournament.max_participants THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kuota kategori ini sudah penuh. Tidak dapat menyetujui pendaftaran.');
  END IF;

  UPDATE public.tournament_participants
  SET status = 'confirmed'
  WHERE entry_id = v_reg.entry_id AND tournament_id = v_reg.tournament_id AND status = 'pending';

  INSERT INTO public.tournament_registration_audit_logs
    (registration_id, tournament_id, action, actor_id, previous_status, new_status, reason)
  VALUES
    (p_registration_id, v_reg.tournament_id, 'approved', p_actor_id, 'pending', 'confirmed', p_reason);

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pendaftaran berhasil disetujui.',
    'tournament_id', v_reg.tournament_id,
    'tournament_name', v_tournament.name,
    'user_id', v_reg.user_id,
    'partner_user_id', v_reg.partner_user_id
  );
END $$;

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
  IF NOT public.has_role(p_actor_id, 'super_admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Hanya Super Admin yang dapat menolak pendaftaran.');
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
  WHERE entry_id = v_reg.entry_id AND tournament_id = v_reg.tournament_id AND status = 'pending';

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

REVOKE EXECUTE ON FUNCTION public.admin_list_pending_registrations() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_approve_registration(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_reject_registration(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pending_registrations() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_approve_registration(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_reject_registration(UUID, UUID, TEXT) TO service_role;

COMMIT;
