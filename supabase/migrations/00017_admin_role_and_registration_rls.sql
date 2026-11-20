-- ============================================================================
-- MATCHPOIN — Migration 00017: Admin role + registration RLS (Phase 2.2)
-- Run in: Supabase Dashboard -> SQL Editor (after 00016).
-- Idempotent and safe for existing data.
--
-- Adds:
--   * `role` column ('player' | 'admin') on users/profiles, protected by a
--     trigger so a player can never promote themselves through the API.
--   * public.is_admin() SECURITY DEFINER helper (no recursive policies).
--   * RLS: players read only their own registrations; only admins update them.
--   * RPCs: league_registration_counts(), admin_list_registrations(),
--     admin_registration_stats() (adds declined_entries).
--   * admin_reject_registration(): reason is now optional.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role column. `profiles` may not exist in every environment, so guard it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (role IN ('player', 'admin'));

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'player';
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check CHECK (role IN ('player', 'admin'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Self-escalation guard. This trigger is intentionally SECURITY INVOKER:
--    current_user is then the API role (`authenticated`/`anon`) for PostgREST
--    requests, `service_role` for server tooling, and `postgres` in the SQL
--    editor / definer functions. Only the latter two may change a role.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_role_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_user NOT IN ('postgres', 'supabase_admin', 'service_role') THEN
      RAISE EXCEPTION 'Perubahan role hanya dapat dilakukan oleh admin sistem.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_user_role ON public.users;
CREATE TRIGGER trg_guard_user_role
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.guard_role_column();

DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_guard_profile_role ON public.profiles';
    EXECUTE 'CREATE TRIGGER trg_guard_profile_role BEFORE UPDATE ON public.profiles
             FOR EACH ROW EXECUTE FUNCTION public.guard_role_column()';
  END IF;
END $$;

-- Column-level defence in depth for direct SQL users.
REVOKE UPDATE (role) ON public.users FROM anon, authenticated;
DO $$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'REVOKE UPDATE (role) ON public.profiles FROM anon, authenticated';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. is_admin(): role column OR an active admin/super_admin RBAC grant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := COALESCE(p_user_id, auth.uid());
  v_flag BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = v_uid
      AND ur.revoked_at IS NULL
      AND r.code IN ('admin', 'super_admin')
  ) INTO v_flag;
  IF v_flag THEN
    RETURN TRUE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.users u WHERE u.id = v_uid AND u.role = 'admin'
  ) INTO v_flag;
  IF v_flag THEN
    RETURN TRUE;
  END IF;

  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = $1 AND p.role = ''admin'')'
      INTO v_flag USING v_uid;
  END IF;

  RETURN COALESCE(v_flag, FALSE);
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;

-- Promote a role column admin into the RBAC array used by the app guards.
CREATE OR REPLACE FUNCTION public.get_user_roles(p_user_id UUID)
RETURNS TEXT[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_roles TEXT[];
BEGIN
  SELECT COALESCE(array_agg(DISTINCT r.code ORDER BY r.code), ARRAY[]::TEXT[])
  INTO v_roles
  FROM public.user_roles ur
  JOIN public.roles r ON r.id = ur.role_id
  WHERE ur.user_id = p_user_id AND ur.revoked_at IS NULL;

  IF public.is_admin(p_user_id) AND NOT ('admin' = ANY(v_roles)) THEN
    v_roles := array_append(v_roles, 'admin');
  END IF;

  IF v_roles IS NULL OR array_length(v_roles, 1) IS NULL THEN
    RETURN ARRAY['player']::TEXT[];
  END IF;
  RETURN v_roles;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_roles(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(p_user_id UUID, p_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p_role = ANY(public.get_user_roles(p_user_id))
    OR (p_role = 'player')
    OR (p_role = 'admin' AND 'super_admin' = ANY(public.get_user_roles(p_user_id)));
$$;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Public quota counts (accepted only) without exposing other registrants.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.league_registration_counts()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'tournament_id', t.id,
        'accepted', (
          SELECT COUNT(DISTINCT COALESCE(x.entry_id::text, x.id::text))
          FROM public.tournament_participants x
          WHERE x.tournament_id = t.id
            AND x.status IN ('accepted', 'confirmed')
        ),
        'pending', (
          SELECT COUNT(DISTINCT COALESCE(x.entry_id::text, x.id::text))
          FROM public.tournament_participants x
          WHERE x.tournament_id = t.id
            AND x.status = 'pending'
            AND x.entry_role = 'captain'
        )
      )
    ),
    '[]'::jsonb
  )
  FROM public.tournaments t
  WHERE t.is_league = TRUE;
$$;

REVOKE ALL ON FUNCTION public.league_registration_counts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.league_registration_counts() TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Registration RLS: own rows (or admin) may be read; only admins update.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "registrations are publicly readable" ON public.tournament_participants;
DROP POLICY IF EXISTS "registrations are written by the database function" ON public.tournament_participants;
DROP POLICY IF EXISTS "registrations are updated by the database function" ON public.tournament_participants;
DROP POLICY IF EXISTS "players read own registrations" ON public.tournament_participants;
DROP POLICY IF EXISTS "admins update registrations" ON public.tournament_participants;

CREATE POLICY "players read own registrations" ON public.tournament_participants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- Writes still go through register_for_competition (SECURITY DEFINER).
CREATE POLICY "registrations are written by the database function" ON public.tournament_participants
  FOR INSERT WITH CHECK (false);

CREATE POLICY "admins update registrations" ON public.tournament_participants
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6. Admin registration list with filters (all statuses) + stats.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_registrations(
  p_tournament_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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
      ORDER BY tp.joined_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.tournament_participants tp
  JOIN public.tournaments t ON t.id = tp.tournament_id
  JOIN public.users u ON u.id = tp.user_id
  LEFT JOIN public.player_profiles pp ON pp.user_id = tp.user_id
  LEFT JOIN public.users u2 ON u2.id = tp.partner_user_id
  LEFT JOIN public.player_profiles pp2 ON pp2.user_id = tp.partner_user_id
  WHERE t.is_league = TRUE
    AND tp.entry_role = 'captain'
    AND (p_tournament_id IS NULL OR tp.tournament_id = p_tournament_id)
    AND (p_status IS NULL OR tp.status = p_status);
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_registrations(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_registrations(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_registration_stats()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
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
    ),
    'declined_entries', (
      SELECT COUNT(DISTINCT COALESCE(entry_id::text, id::text))
      FROM public.tournament_participants
      WHERE status = 'rejected'
    )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.admin_registration_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_registration_stats() TO service_role;

-- ---------------------------------------------------------------------------
-- 7. Decline reason becomes optional (defaults to a system reason).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_reject_registration(
  p_registration_id UUID,
  p_actor_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg public.tournament_participants%ROWTYPE;
  v_tournament public.tournaments%ROWTYPE;
  v_reason TEXT := NULLIF(btrim(COALESCE(p_reason, '')), '');
BEGIN
  IF NOT public.has_role(p_actor_id, 'admin') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda tidak memiliki akses untuk menolak pendaftaran.');
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
    (p_registration_id, v_reg.tournament_id, 'rejected', p_actor_id, 'pending', 'rejected',
     COALESCE(v_reason, 'Ditolak oleh admin'));

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Pendaftaran ditolak.',
    'tournament_id', v_reg.tournament_id,
    'tournament_name', v_tournament.name,
    'user_id', v_reg.user_id,
    'partner_user_id', v_reg.partner_user_id
  );
END $$;

REVOKE EXECUTE ON FUNCTION public.admin_reject_registration(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_registration(UUID, UUID, TEXT) TO service_role;
