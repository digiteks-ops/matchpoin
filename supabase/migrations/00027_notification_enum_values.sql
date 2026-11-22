-- ============================================================================
-- MATCHPOIN — Migration 00027: align notification_type enum with the app
-- Run in: Supabase SQL Editor (after 00026).
--
-- The live notification_type enum predates several notification types used by
-- src/lib/notifications/notification-service.ts. Inserts rejected unknown
-- values, so tournament registration/approval notifications were dropped.
-- Idempotent: ADD VALUE IF NOT EXISTS is safe to re-run.
-- ============================================================================

ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'match_challenge';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'challenge_accepted';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'challenge_rejected';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'player_joined';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'match_cancelled';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'result_confirmed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'result_disputed';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'tournament_registration';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'tournament_update';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'admin_announcement';
