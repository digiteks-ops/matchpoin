-- ============================================================================
-- MATCHPOIN — Migration 00022: RLS hardening (Phase 4 audit)
-- Run in: Supabase Dashboard -> SQL Editor (after 00021).
-- Idempotent, re-runnable, no data changes.
--
-- Audit findings fixed here:
--   1. 25 policies still called auth.uid() directly, so Postgres evaluated the
--      JWT claim once per row. They are rewritten with `(select auth.uid())`
--      (init-plan cached once per statement). Logic is otherwise unchanged.
--   2. `public.leagues."Admins can manage leagues"` allowed ANY authenticated
--      user to INSERT/UPDATE/DELETE league rows (`auth.uid() IS NOT NULL`).
--      It is now restricted to admin/super_admin, matching the policy name and
--      the rest of the admin surface.
--
-- Every statement is guarded by to_regclass so the file also runs on projects
-- that do not have the optional legacy tables.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles (own row only)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.profiles') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles$sql$;
    EXECUTE $sql$CREATE POLICY "Users can insert their own profile" ON public.profiles
      FOR INSERT WITH CHECK ((select auth.uid()) = id)$sql$;

    EXECUTE $sql$DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles$sql$;
    EXECUTE $sql$CREATE POLICY "Users can update their own profile" ON public.profiles
      FOR UPDATE USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id)$sql$;

    EXECUTE $sql$DROP POLICY IF EXISTS "owner full access" ON public.profiles$sql$;
    EXECUTE $sql$CREATE POLICY "owner full access" ON public.profiles
      FOR ALL USING ((select auth.uid()) = id) WITH CHECK ((select auth.uid()) = id)$sql$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- match_results (participants of the match only)
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.match_results') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "participants can submit results" ON public.match_results$sql$;
    EXECUTE $sql$CREATE POLICY "participants can submit results" ON public.match_results
      FOR INSERT WITH CHECK (
        submitted_by = (select auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = match_results.match_id AND mp.user_id = (select auth.uid())
        )
      )$sql$;

    EXECUTE $sql$DROP POLICY IF EXISTS "participants can update results" ON public.match_results$sql$;
    EXECUTE $sql$CREATE POLICY "participants can update results" ON public.match_results
      FOR UPDATE
      USING (
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = match_results.match_id AND mp.user_id = (select auth.uid())
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = match_results.match_id AND mp.user_id = (select auth.uid())
        )
      )$sql$;

    EXECUTE $sql$DROP POLICY IF EXISTS "participants can delete results" ON public.match_results$sql$;
    EXECUTE $sql$CREATE POLICY "participants can delete results" ON public.match_results
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = match_results.match_id AND mp.user_id = (select auth.uid())
        )
      )$sql$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- rating_history, player_ratings, feedback, user_roles, file_metadata
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.rating_history') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "users can read their rating history" ON public.rating_history$sql$;
    EXECUTE $sql$CREATE POLICY "users can read their rating history" ON public.rating_history
      FOR SELECT USING (user_id = (select auth.uid()))$sql$;
  END IF;

  IF to_regclass('public.player_ratings') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "users can create their own rating" ON public.player_ratings$sql$;
    EXECUTE $sql$CREATE POLICY "users can create their own rating" ON public.player_ratings
      FOR INSERT WITH CHECK (
        user_id = (select auth.uid())
        AND current_rating = 1.00
        AND matches_played = 0
      )$sql$;
  END IF;

  IF to_regclass('public.feedback') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "users read own feedback" ON public.feedback$sql$;
    EXECUTE $sql$CREATE POLICY "users read own feedback" ON public.feedback
      FOR SELECT USING (user_id = (select auth.uid()))$sql$;
  END IF;

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS user_roles_own_read ON public.user_roles$sql$;
    EXECUTE $sql$CREATE POLICY user_roles_own_read ON public.user_roles
      FOR SELECT TO authenticated USING (user_id = (select auth.uid()))$sql$;
  END IF;

  IF to_regclass('public.file_metadata') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS file_metadata_own_read ON public.file_metadata$sql$;
    EXECUTE $sql$CREATE POLICY file_metadata_own_read ON public.file_metadata
      FOR SELECT TO authenticated USING (user_id = (select auth.uid()))$sql$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- Legacy league tables. SECURITY FIX: "Admins can manage leagues" previously
-- allowed every authenticated user to write. Now admin/super_admin only.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.leagues') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "Admins can manage leagues" ON public.leagues$sql$;
    EXECUTE $sql$CREATE POLICY "Admins can manage leagues" ON public.leagues
      FOR ALL
      USING (public.has_role((select auth.uid()), 'admin'))
      WITH CHECK (public.has_role((select auth.uid()), 'admin'))$sql$;
  END IF;

  IF to_regclass('public.league_participants') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "Users can join leagues" ON public.league_participants$sql$;
    EXECUTE $sql$CREATE POLICY "Users can join leagues" ON public.league_participants
      FOR INSERT WITH CHECK ((select auth.uid()) = user_id)$sql$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- Walkover reports and cancellation requests
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.match_wo_reports') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "wo reports visible to reporter" ON public.match_wo_reports$sql$;
    EXECUTE $sql$CREATE POLICY "wo reports visible to reporter" ON public.match_wo_reports
      FOR SELECT USING (reported_by = (select auth.uid()))$sql$;

    EXECUTE $sql$DROP POLICY IF EXISTS "participants can report walkover" ON public.match_wo_reports$sql$;
    EXECUTE $sql$CREATE POLICY "participants can report walkover" ON public.match_wo_reports
      FOR INSERT WITH CHECK (
        reported_by = (select auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = match_wo_reports.match_id AND mp.user_id = (select auth.uid())
        )
      )$sql$;
  END IF;

  IF to_regclass('public.match_cancellation_requests') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS "cancellation requests visible to requester" ON public.match_cancellation_requests$sql$;
    EXECUTE $sql$CREATE POLICY "cancellation requests visible to requester" ON public.match_cancellation_requests
      FOR SELECT USING (requested_by = (select auth.uid()))$sql$;

    EXECUTE $sql$DROP POLICY IF EXISTS "participants can request cancellation" ON public.match_cancellation_requests$sql$;
    EXECUTE $sql$CREATE POLICY "participants can request cancellation" ON public.match_cancellation_requests
      FOR INSERT WITH CHECK (
        requested_by = (select auth.uid())
        AND EXISTS (
          SELECT 1 FROM public.match_participants mp
          WHERE mp.match_id = match_cancellation_requests.match_id AND mp.user_id = (select auth.uid())
        )
      )$sql$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- Admin audit logs
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.tournament_registration_audit_logs') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS tournament_reg_audit_admin_read ON public.tournament_registration_audit_logs$sql$;
    EXECUTE $sql$CREATE POLICY tournament_reg_audit_admin_read ON public.tournament_registration_audit_logs
      FOR SELECT TO authenticated USING (public.has_role((select auth.uid()), 'admin'))$sql$;
  END IF;

  IF to_regclass('public.role_audit_logs') IS NOT NULL THEN
    EXECUTE $sql$DROP POLICY IF EXISTS role_audit_admin_read ON public.role_audit_logs$sql$;
    EXECUTE $sql$CREATE POLICY role_audit_admin_read ON public.role_audit_logs
      FOR SELECT TO authenticated USING (public.has_role((select auth.uid()), 'admin'))$sql$;
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- storage.objects: same folder rules, auth.uid() evaluated once per statement.
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname IN (
        'avatars owner insert', 'avatars owner update', 'avatars owner delete',
        'match results participant insert', 'match results participant update',
        'match results participant delete'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;

  EXECUTE $sql$CREATE POLICY "avatars owner insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'avatars'
      AND (
        split_part(name, '/', 1) = (select auth.uid())::text
        OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || (select auth.uid())::text || '-%')
      )
    )$sql$;

  EXECUTE $sql$CREATE POLICY "avatars owner update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (
        split_part(name, '/', 1) = (select auth.uid())::text
        OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || (select auth.uid())::text || '-%')
      )
    )
    WITH CHECK (
      bucket_id = 'avatars'
      AND (
        split_part(name, '/', 1) = (select auth.uid())::text
        OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || (select auth.uid())::text || '-%')
      )
    )$sql$;

  EXECUTE $sql$CREATE POLICY "avatars owner delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'avatars'
      AND (
        split_part(name, '/', 1) = (select auth.uid())::text
        OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || (select auth.uid())::text || '-%')
      )
    )$sql$;

  EXECUTE $sql$CREATE POLICY "match results participant insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'match-results'
      AND split_part(name, '/', 1) = 'matches'
      AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(name, '/', 3) = (select auth.uid())::text
      AND public.is_match_participant(split_part(name, '/', 2)::uuid, (select auth.uid()))
    )$sql$;

  EXECUTE $sql$CREATE POLICY "match results participant update" ON storage.objects
    FOR UPDATE TO authenticated
    USING (
      bucket_id = 'match-results'
      AND split_part(name, '/', 1) = 'matches'
      AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(name, '/', 3) = (select auth.uid())::text
      AND public.is_match_participant(split_part(name, '/', 2)::uuid, (select auth.uid()))
    )$sql$;

  EXECUTE $sql$CREATE POLICY "match results participant delete" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'match-results'
      AND split_part(name, '/', 1) = 'matches'
      AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      AND split_part(name, '/', 3) = (select auth.uid())::text
      AND public.is_match_participant(split_part(name, '/', 2)::uuid, (select auth.uid()))
    )$sql$;
END
$do$;
