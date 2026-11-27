-- ============================================================================
-- MATCHPOIN — Migration 00048a: Phase 4 status enum values
-- Run in: Supabase Dashboard -> SQL Editor (after 00047, before 00048b).
-- Idempotent and safe to re-run.
--
-- Enum values must be committed before they are used in later statements, so
-- this file is intentionally separated from 00048b.
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'match_status'
  ) THEN
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''pending''';
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''confirmed''';
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''disputed''';
    EXECUTE 'ALTER TYPE public.match_status ADD VALUE IF NOT EXISTS ''rejected''';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'result_status'
  ) THEN
    EXECUTE 'ALTER TYPE public.result_status ADD VALUE IF NOT EXISTS ''disputed''';
    EXECUTE 'ALTER TYPE public.result_status ADD VALUE IF NOT EXISTS ''rejected''';
  END IF;
END $$;
