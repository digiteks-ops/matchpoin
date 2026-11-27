-- ============================================================================
-- MATCHPOIN — Migration 00048b: Phase 4 dispute, auto-confirm, audit, ranking
-- Run in: Supabase Dashboard -> SQL Editor (after 00048a).
-- Idempotent and safe to re-run.
--
-- Adds / completes:
--   * HOST role + has_role helper (also present in 00047).
--   * communities.admin_id (backfilled from legacy owner_id when present).
--   * disputes table + RLS.
--   * matches workflow columns (community_id, submitted_by/at, confirm_deadline).
--   * audit_logs transition columns + server-side audit trigger (who/when/reason).
--   * RPCs: raise_match_dispute, confirm_match_result, resolve_match_dispute,
--     auto_confirm_due_matches (service-role only, idempotent).
--   * Legacy completed matches are normalized to confirmed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Role helper (idempotent; matches 00047)
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 2. Communities: host/admin ownership columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS admin_phone TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'communities' AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'UPDATE public.communities SET admin_id = owner_id WHERE admin_id IS NULL AND owner_id IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_communities_admin ON public.communities (admin_id);

-- ---------------------------------------------------------------------------
-- 3. Disputes
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

CREATE INDEX IF NOT EXISTS idx_disputes_match ON public.disputes (match_id, created_at);
CREATE INDEX IF NOT EXISTS idx_disputes_status ON public.disputes (status);

DROP TRIGGER IF EXISTS set_disputes_updated_at ON public.disputes;
CREATE TRIGGER set_disputes_updated_at
  BEFORE UPDATE ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS disputes_host_update ON public.disputes;
CREATE POLICY disputes_host_update ON public.disputes
  FOR UPDATE TO authenticated
  USING (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.matches m
      LEFT JOIN public.communities c ON c.id = m.community_id
      WHERE m.id = disputes.match_id
        AND (m.organizer_id = (select auth.uid()) OR c.admin_id = (select auth.uid()))
    )
  )
  WITH CHECK (
    public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.matches m
      LEFT JOIN public.communities c ON c.id = m.community_id
      WHERE m.id = disputes.match_id
        AND (m.organizer_id = (select auth.uid()) OR c.admin_id = (select auth.uid()))
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Match workflow columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirm_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_raised_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_matches_community ON public.matches (community_id) WHERE community_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_matches_confirm_deadline ON public.matches (confirm_deadline) WHERE confirm_deadline IS NOT NULL;

ALTER TABLE public.match_results
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS disputed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolution_notes TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS is_walkover BOOLEAN NOT NULL DEFAULT FALSE;

-- Normalize legacy lifecycle labels into the Phase 4 workflow.
UPDATE public.matches SET status = 'confirmed' WHERE status = 'completed';
UPDATE public.match_results SET status = 'disputed' WHERE status = 'under_review';

-- ---------------------------------------------------------------------------
-- 5. Audit log: who / when / reason for every status transition
-- ---------------------------------------------------------------------------

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS old_status TEXT,
  ADD COLUMN IF NOT EXISTS new_status TEXT,
  ADD COLUMN IF NOT EXISTS reason TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON public.audit_logs (entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON public.audit_logs (actor_id, created_at);

CREATE OR REPLACE FUNCTION public.log_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_old TEXT;
  v_new TEXT;
  v_reason TEXT;
  v_actor UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new := NEW.status::TEXT;
  ELSE
    v_old := OLD.status::TEXT;
    v_new := NEW.status::TEXT;
    IF v_old IS NOT DISTINCT FROM v_new THEN
      RETURN NEW;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'disputes' THEN
    v_actor := auth.uid();
    v_reason := COALESCE(NULLIF(NEW.resolution, ''), NULLIF(NEW.reason, ''));
  ELSE
    v_actor := COALESCE(
      auth.uid(),
      NULLIF(NEW.metadata->>'status_actor', '')::UUID
    );
    v_reason := NULLIF(NEW.metadata->>'status_reason', '');
  END IF;

  INSERT INTO public.audit_logs (
    actor_id, action, entity_type, entity_id, old_status, new_status, reason, metadata
  ) VALUES (
    v_actor,
    CASE WHEN TG_OP = 'INSERT' THEN 'status_created' ELSE 'status_changed' END,
    TG_TABLE_NAME, NEW.id, v_old, v_new, v_reason,
    jsonb_build_object('table', TG_TABLE_NAME, 'reason', v_reason)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_matches_status ON public.matches;
CREATE TRIGGER trg_audit_matches_status
  AFTER INSERT OR UPDATE OF status ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

DROP TRIGGER IF EXISTS trg_audit_match_results_status ON public.match_results;
CREATE TRIGGER trg_audit_match_results_status
  AFTER INSERT OR UPDATE OF status ON public.match_results
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

DROP TRIGGER IF EXISTS trg_audit_disputes_status ON public.disputes;
CREATE TRIGGER trg_audit_disputes_status
  AFTER INSERT OR UPDATE OF status ON public.disputes
  FOR EACH ROW EXECUTE FUNCTION public.log_status_change();

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_admin_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role((select auth.uid()), 'admin'));

-- ---------------------------------------------------------------------------
-- 6. Server-side dispute / confirmation / resolution RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.raise_match_dispute(
  p_match_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match RECORD;
  v_result RECORD;
  v_deadline TIMESTAMPTZ;
  v_reason TEXT := trim(COALESCE(p_reason, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Anda harus masuk untuk menyanggah hasil.';
  END IF;
  IF v_reason = '' THEN
    RAISE EXCEPTION 'Alasan sanggahan wajib diisi.';
  END IF;

  SELECT id, organizer_id, status, confirm_deadline, metadata
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pertandingan tidak ditemukan.';
  END IF;

  IF NOT (
    v_match.organizer_id = v_uid
    OR EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = p_match_id AND mp.user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Anda bukan peserta pertandingan ini.';
  END IF;

  SELECT id, submitted_by, status, submitted_at, metadata
    INTO v_result FROM public.match_results WHERE match_id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Belum ada hasil pertandingan yang dikirim.';
  END IF;
  IF v_result.status IN ('disputed', 'under_review') THEN
    RAISE EXCEPTION 'Hasil ini sudah berada dalam peninjauan.';
  END IF;
  IF v_result.status <> 'pending' THEN
    RAISE EXCEPTION 'Hasil sudah dikonfirmasi dan tidak dapat disanggah.';
  END IF;
  IF v_result.submitted_by = v_uid THEN
    RAISE EXCEPTION 'Anda tidak dapat menyanggah hasil yang Anda kirim sendiri.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.disputes WHERE match_id = p_match_id AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'Hasil ini sudah berada dalam peninjauan.';
  END IF;

  v_deadline := COALESCE(
    v_match.confirm_deadline,
    NULLIF(v_result.metadata->>'dispute_deadline', '')::TIMESTAMPTZ,
    v_result.submitted_at + INTERVAL '24 hours'
  );
  IF v_deadline IS NULL OR now() > v_deadline THEN
    RAISE EXCEPTION 'Waktu sanggahan 24 jam telah berakhir.';
  END IF;

  INSERT INTO public.disputes (match_id, raised_by, reason)
  VALUES (p_match_id, v_uid, v_reason);

  UPDATE public.match_results
     SET status = 'disputed',
         disputed_at = now(),
         metadata = COALESCE(metadata, '{}'::JSONB)
           || jsonb_build_object('dispute_reason', v_reason, 'status_reason', v_reason)
   WHERE id = v_result.id;

  UPDATE public.matches
     SET status = 'disputed',
         dispute_raised_at = now(),
         metadata = COALESCE(metadata, '{}'::JSONB)
           || jsonb_build_object('status_reason', v_reason)
   WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'result_id', v_result.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_match_result(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match RECORD;
  v_result RECORD;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Anda harus masuk untuk mengonfirmasi hasil.';
  END IF;

  SELECT id, organizer_id, status, metadata
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pertandingan tidak ditemukan.';
  END IF;

  IF NOT (
    v_match.organizer_id = v_uid
    OR EXISTS (
      SELECT 1 FROM public.match_participants mp
      WHERE mp.match_id = p_match_id AND mp.user_id = v_uid
    )
  ) THEN
    RAISE EXCEPTION 'Anda bukan peserta pertandingan ini.';
  END IF;

  SELECT id, submitted_by, status INTO v_result
    FROM public.match_results WHERE match_id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Belum ada hasil pertandingan yang dikirim.';
  END IF;
  IF v_result.status = 'confirmed' THEN
    RETURN jsonb_build_object('success', true, 'already_confirmed', true);
  END IF;
  IF v_result.status <> 'pending' THEN
    RAISE EXCEPTION 'Hasil sedang ditinjau dan belum dapat dikonfirmasi.';
  END IF;
  IF v_result.submitted_by = v_uid THEN
    RAISE EXCEPTION 'Anda tidak dapat mengonfirmasi hasil yang Anda kirim sendiri.';
  END IF;

  UPDATE public.match_results
     SET status = 'confirmed',
         confirmed_at = now(),
         metadata = COALESCE(metadata, '{}'::JSONB)
           || jsonb_build_object('status_reason', 'confirmed_by_opponent')
   WHERE id = v_result.id;

  UPDATE public.matches
     SET status = 'confirmed',
         result_confirmed_at = now(),
         metadata = COALESCE(metadata, '{}'::JSONB)
           || jsonb_build_object('status_reason', 'confirmed_by_opponent')
   WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_match_dispute(
  p_match_id UUID,
  p_resolution TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match RECORD;
  v_dispute RECORD;
  v_reason TEXT := NULLIF(trim(COALESCE(p_reason, '')), '');
  v_allowed BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Anda harus masuk untuk menyelesaikan sanggahan.';
  END IF;
  IF p_resolution NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Keputusan sanggahan tidak valid.';
  END IF;
  IF p_resolution = 'rejected' AND v_reason IS NULL THEN
    RAISE EXCEPTION 'Alasan penolakan wajib diisi.';
  END IF;

  SELECT id, organizer_id, community_id, status, metadata
    INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pertandingan tidak ditemukan.';
  END IF;

  v_allowed := public.has_role(v_uid, 'admin')
    OR v_match.organizer_id = v_uid
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = v_match.community_id AND c.admin_id = v_uid
    );
  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Hanya Host atau Admin yang dapat menyelesaikan sanggahan.';
  END IF;
  IF v_match.status <> 'disputed' THEN
    RAISE EXCEPTION 'Pertandingan ini tidak sedang disanggah.';
  END IF;

  SELECT id INTO v_dispute FROM public.disputes
   WHERE match_id = p_match_id AND status = 'open'
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tidak ada sanggahan terbuka untuk pertandingan ini.';
  END IF;

  UPDATE public.disputes
     SET status = CASE WHEN p_resolution = 'confirmed' THEN 'resolved' ELSE 'rejected' END,
         resolution = COALESCE(v_reason, 'dispute_resolved_' || p_resolution),
         resolved_by = v_uid,
         resolved_at = now()
   WHERE id = v_dispute.id;

  UPDATE public.match_results
     SET status = p_resolution::public.result_status,
         resolved_at = now(),
         resolved_by = v_uid,
         resolution_notes = v_reason,
         confirmed_at = CASE WHEN p_resolution = 'confirmed' THEN now() ELSE confirmed_at END,
         metadata = COALESCE(metadata, '{}'::JSONB)
           || jsonb_build_object(
                'status_reason', COALESCE(v_reason, 'dispute_resolved_' || p_resolution),
                'resolution_reason', v_reason
              )
   WHERE match_id = p_match_id;

  UPDATE public.matches
     SET status = p_resolution::public.match_status,
         dispute_resolved_at = now(),
         result_confirmed_at = CASE WHEN p_resolution = 'confirmed' THEN now() ELSE result_confirmed_at END,
         metadata = COALESCE(metadata, '{}'::JSONB)
           || jsonb_build_object('status_reason', COALESCE(v_reason, 'dispute_resolved_' || p_resolution))
   WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'status', p_resolution);
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. Scheduled auto-confirm (service-role only, idempotent)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.auto_confirm_due_matches(p_limit INTEGER DEFAULT 100)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
  v_now TIMESTAMPTZ := now();
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Hanya sistem atau Admin yang dapat menjalankan konfirmasi otomatis.';
  END IF;

  FOR v_row IN
    SELECT r.id AS result_id, r.match_id
      FROM public.match_results r
      JOIN public.matches m ON m.id = r.match_id
     WHERE r.status = 'pending'
       AND r.submitted_at IS NOT NULL
       AND r.submitted_at <= v_now - INTERVAL '24 hours'
       AND m.status IN ('pending', 'in_progress', 'full', 'open')
       AND NOT EXISTS (
         SELECT 1 FROM public.disputes d
         WHERE d.match_id = r.match_id AND d.status = 'open'
       )
     ORDER BY r.submitted_at ASC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
     FOR UPDATE OF r SKIP LOCKED
  LOOP
    UPDATE public.match_results
       SET status = 'confirmed',
           confirmed_at = v_now,
           metadata = COALESCE(metadata, '{}'::JSONB)
             || jsonb_build_object('auto_confirmed', TRUE, 'status_reason', 'auto_confirm_24h')
     WHERE id = v_row.result_id AND status = 'pending';

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    UPDATE public.matches
       SET status = 'confirmed',
           result_confirmed_at = v_now,
           metadata = COALESCE(metadata, '{}'::JSONB)
             || jsonb_build_object('auto_confirmed', TRUE, 'status_reason', 'auto_confirm_24h')
     WHERE id = v_row.match_id AND status IN ('pending', 'in_progress', 'full', 'open');

    RETURN NEXT v_row.match_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.raise_match_dispute(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_match_result(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_match_dispute(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auto_confirm_due_matches(INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.raise_match_dispute(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_match_result(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_match_dispute(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_confirm_due_matches(INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. Guard: finished matches cannot accept new participants
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_finished_match_participants()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status::TEXT INTO v_status FROM public.matches WHERE id = NEW.match_id;
  IF v_status IN ('confirmed', 'disputed', 'rejected', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Pertandingan sudah selesai dan tidak dapat menerima peserta baru.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_finished_match_participants ON public.match_participants;
CREATE TRIGGER trg_guard_finished_match_participants
  BEFORE INSERT ON public.match_participants
  FOR EACH ROW EXECUTE FUNCTION public.guard_finished_match_participants();
