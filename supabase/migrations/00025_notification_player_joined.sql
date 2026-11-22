-- ============================================================================
-- MATCHPOIN — Migration 00025: add notification_type.player_joined
-- Run in: Supabase SQL Editor (after 00024).
-- Idempotent. No data changes.
--
-- The join RPC succeeds, but host notification was rejected because the live
-- notification_type enum predates the player_joined notification used by the app.
-- ============================================================================

ALTER TYPE public.notification_type
  ADD VALUE IF NOT EXISTS 'player_joined';
