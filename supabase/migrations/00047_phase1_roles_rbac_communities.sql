-- ============================================================================
-- MATCHPOIN — Migration 00047: Phase 1 roles, RBAC, and communities
-- Run in: Supabase Dashboard -> SQL Editor (after 00046).
-- Idempotent and safe to re-run.
--
-- Adds:
--   * HOST role (community admin) next to PLAYER, ADMIN, SUPER_ADMIN.
--   * Signup role selection (player | host) from auth metadata.
--   * communities, community_members, disputes, audit_logs tables.
--   * matches: community_id, submitted_by, submitted_at, confirm_deadline.
--   * Server-side audit trigger for match/dispute status changes.
--   * RLS: players cannot create matches; hosts only manage their community.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. HOST role and RBAC hierarchy
-- ---------------------------------------------------------------------------

ALTER TABLE public.roles DROP CONSTRAINT IF EXISTS chk_roles_code;
ALTER TABLE public.roles
  ADD CONSTRAINT chk_roles_code
  CHECK (code IN ('player', 'host', 'admin', 'super_admin'));

INSERT INTO public.roles (code, name)
VALUES ('host', 'Host')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_system = TRUE;

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
        OR (p_role = 'player' AND r.code IN ('host', 'admin', 'super_admin'))
        OR (p_role = 'host' AND r.code IN ('admin', 'super_admin'))
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
  IF p_role NOT IN ('player', 'host', 'admin', 'super_admin') THEN
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

-- Signup role selection. This trigger is separate from handle_new_user so the
-- existing onboarding function stays untouched; Postgres fires triggers in
-- name order, so on_auth_user_created (users row) runs before this one.
CREATE OR REPLACE FUNCTION public.assign_signup_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
  v_role_id UUID;
BEGIN
  IF to_regclass('public.roles') IS NULL OR to_regclass('public.user_roles') IS NULL THEN
    RETURN NEW;
  END IF;

  v_role := lower(COALESCE(NEW.raw_user_meta_data->>'role', 'player'));
  IF v_role NOT IN ('player', 'host') THEN
    v_role := 'player';
  END IF;

  BEGIN
    SELECT id INTO v_role_id FROM public.roles WHERE code = 'player';
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id, reason)
      VALUES (NEW.id, v_role_id, 'Signup role selection')
      ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;
    END IF;

    IF v_role = 'host' THEN
      SELECT id INTO v_role_id FROM public.roles WHERE code = 'host';
      IF v_role_id IS NOT NULL THEN
        INSERT INTO public.user_roles (user_id, role_id, reason)
        VALUES (NEW.id, v_role_id, 'Signup role selection')
        ON CONFLICT (user_id, role_id) WHERE revoked_at IS NULL DO NOTHING;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_role ON auth.users;
CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_signup_role();

-- ---------------------------------------------------------------------------
-- 2. Communities
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  city TEXT,
  admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  admin_phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The live database already had a legacy communities table (owner_id, city_id)
-- before this phase. CREATE TABLE IF NOT EXISTS is a no-op there, so add the
-- phase-1 columns explicitly before the index below references admin_id.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admin_phone TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT;

-- Backfill ownership/location from the legacy columns when they exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'communities' AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'UPDATE public.communities SET admin_id = owner_id WHERE admin_id IS NULL AND owner_id IS NOT NULL';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'communities' AND column_name = 'city_id'
  ) AND to_regclass('public.cities') IS NOT NULL THEN
    EXECUTE 'UPDATE public.communities c SET city = ci.name FROM public.cities ci WHERE c.city IS NULL AND c.city_id = ci.id';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_communities_admin
  ON public.communities (admin_id);

CREATE TABLE IF NOT EXISTS public.community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('host', 'player')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (community_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_members_user
  ON public.community_members (user_id);

-- ---------------------------------------------------------------------------
-- 3. Match workflow columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirm_deadline TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_matches_community
  ON public.matches (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_submitted_by
  ON public.matches (submitted_by) WHERE submitted_by IS NOT NULL;

-- The live column uses the match_status enum. Extend it with the result
-- workflow labels without removing the lifecycle values still used by the app.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'match_status'
  ) THEN
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''pending''';
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''confirmed''';
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''disputed''';
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''rejected''';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Disputes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  raised_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'rejected')),
  resolution TEXT,
  resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_disputes_match
  ON public.disputes (match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_disputes_status
  ON public.disputes (status);

-- ---------------------------------------------------------------------------
-- 5. Audit log for status changes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_status TEXT,
  new_status TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor
  ON public.audit_logs (actor_id, created_at);

CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (
      actor_id, action, entity_type, entity_id, old_status, new_status, metadata
    ) VALUES (
      (select auth.uid()), 'status_changed', TG_TABLE_NAME, NEW.id,
      OLD.status::TEXT, NEW.status::TEXT,
      jsonb_build_object('table', TG_TABLE_NAME)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_matches_status ON public.matches;
CREATE TRIGGER trg_audit_matches_status
  AFTER UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

DROP TRIGGER IF EXISTS trg_audit_disputes_status ON public.disputes;
CREATE TRIGGER trg_audit_disputes_status
  AFTER UPDATE OF status ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

-- ---------------------------------------------------------------------------
-- 6. Timestamp triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_communities_updated_at ON public.communities;
CREATE TRIGGER set_communities_updated_at
  BEFORE UPDATE ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_disputes_updated_at ON public.disputes;
CREATE TRIGGER set_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- 7. RLS: communities and members
-- ---------------------------------------------------------------------------

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communities_public_read ON public.communities;
CREATE POLICY communities_public_read ON public.communities
  FOR SELECT USING (true);

DROP POLICY IF EXISTS communities_host_insert ON public.communities;
CREATE POLICY communities_host_insert ON public.communities
  FOR INSERT TO authenticated
  WITH CHECK (
    admin_id = (select auth.uid())
    AND (
      public.has_role((select auth.uid()), 'host')
      OR public.has_role((select auth.uid()), 'admin')
    )
  );

DROP POLICY IF EXISTS communities_host_update ON public.communities;
CREATE POLICY communities_host_update ON public.communities
  FOR UPDATE TO authenticated
  USING (admin_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'))
  WITH CHECK (admin_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS communities_host_delete ON public.communities;
CREATE POLICY communities_host_delete ON public.communities
  FOR DELETE TO authenticated
  USING (admin_id = (select auth.uid()) OR public.has_role((select auth.uid()), 'admin'));

DROP POLICY IF EXISTS community_members_read ON public.community_members;
CREATE POLICY community_members_read ON public.community_members
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS community_members_insert ON public.community_members;
CREATE POLICY community_members_insert ON public.community_members
  FOR INSERT TO authenticated
  WITH CHECK (
    (user_id = (select auth.uid()) AND role = 'player')
    OR public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.admin_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS community_members_manage ON public.community_members;
CREATE POLICY community_members_manage ON public.community_members
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.admin_id = (select auth.uid())
    )
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.admin_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS community_members_delete ON public.community_members;
CREATE POLICY community_members_delete ON public.community_members
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_members.community_id
        AND c.admin_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 8. RLS: players cannot create matches; hosts only their own community
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "organizers can create matches" ON public.matches;
CREATE POLICY "organizers can create matches"
  ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (
    organizer_id = (select auth.uid())
    AND (
      public.has_role((select auth.uid()), 'admin')
      OR (
        public.has_role((select auth.uid()), 'host')
        AND (
          community_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.communities c
            WHERE c.id = matches.community_id
              AND c.admin_id = (select auth.uid())
          )
        )
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 9. RLS: disputes and audit log
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS disputes_participant_read ON public.disputes;
CREATE POLICY disputes_participant_read ON public.disputes
  FOR SELECT TO authenticated
  USING (
    raised_by = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = disputes.match_id
        AND (
          m.organizer_id = (select auth.uid())
          OR EXISTS (
            SELECT 1 FROM public.match_participants mp
            WHERE mp.match_id = m.id AND mp.user_id = (select auth.uid())
          )
        )
    )
  );

DROP POLICY IF EXISTS disputes_participant_insert ON public.disputes;
CREATE POLICY disputes_participant_insert ON public.disputes
  FOR INSERT TO authenticated
  WITH CHECK (
    raised_by = (select auth.uid())
    AND (
      public.has_role((select auth.uid()), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.matches m
        WHERE m.id = disputes.match_id
          AND (
            m.organizer_id = (select auth.uid())
            OR EXISTS (
              SELECT 1 FROM public.match_participants mp
              WHERE mp.match_id = m.id AND mp.user_id = (select auth.uid())
            )
          )
      )
    )
  );

DROP POLICY IF EXISTS disputes_host_update ON public.disputes;
CREATE POLICY disputes_host_update ON public.disputes
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.communities c ON c.id = m.community_id
      WHERE m.id = disputes.match_id AND c.admin_id = (select auth.uid())
    )
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.matches m
      JOIN public.communities c ON c.id = m.community_id
      WHERE m.id = disputes.match_id AND c.admin_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS audit_logs_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_admin_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));
