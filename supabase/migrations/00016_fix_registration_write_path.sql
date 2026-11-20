-- ============================================================================
-- MATCHPOIN — Migration 00016: Fix league registration write path
-- Run in: Supabase Dashboard -> SQL Editor
-- Depends on: 00013, 00014 (run those first).
-- Idempotent. Safe for existing data.
--
-- Root cause of "registration fails on click":
--   00013 created tournament_registration_audit_logs with
--     action          CHECK (action IN ('approved', 'rejected'))
--     previous_status NOT NULL
--     new_status      CHECK (... no 'accepted' ...)
--   but 00014's register_for_competition inserts action='submitted' with
--   previous_status = NULL, and admin_approve_registration inserts
--   new_status='accepted'. Every insert raised a CHECK/NOT NULL violation, so
--   the whole registration (and approval) transaction rolled back.
--
--   admin_approve_registration also wrote approved_at/approved_by columns that
--   no migration had created, so approvals failed even before the audit insert.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Audit log: accept every action/status the RPCs actually write.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_registration_audit_logs
  ALTER COLUMN previous_status DROP NOT NULL;

ALTER TABLE public.tournament_registration_audit_logs
  DROP CONSTRAINT IF EXISTS chk_tournament_reg_audit_action;
ALTER TABLE public.tournament_registration_audit_logs
  ADD CONSTRAINT chk_tournament_reg_audit_action
  CHECK (action IN ('submitted', 'approved', 'rejected'));

ALTER TABLE public.tournament_registration_audit_logs
  DROP CONSTRAINT IF EXISTS chk_tournament_reg_audit_status;
ALTER TABLE public.tournament_registration_audit_logs
  ADD CONSTRAINT chk_tournament_reg_audit_status
  CHECK (
    (previous_status IS NULL
      OR previous_status IN ('pending', 'accepted', 'rejected', 'confirmed', 'waiting_list'))
    AND new_status IN ('pending', 'accepted', 'rejected', 'confirmed', 'waiting_list')
  );

-- ---------------------------------------------------------------------------
-- 2. Approval bookkeeping columns used by admin_approve_registration.
-- ---------------------------------------------------------------------------

ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tournament_participants_approved_by
  ON public.tournament_participants (approved_by)
  WHERE approved_by IS NOT NULL;
