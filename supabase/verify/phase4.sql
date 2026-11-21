-- ============================================================================
-- MATCHPOIN — Phase 4 verification (read-only, run in Supabase SQL Editor)
-- Safe: only SELECT statements. No changes.
-- Expected results are noted per section.
-- ============================================================================

-- 1. RLS must be enabled on EVERY public table.
--    Expected: zero rows.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = FALSE
ORDER BY tablename;

-- 2. Tables + policy counts (sanity: each table should have >= 1 policy).
--    Expected: no table with policy_count = 0.
SELECT t.tablename, COUNT(p.policyname) AS policy_count
FROM pg_tables t
LEFT JOIN pg_policies p ON p.schemaname = t.schemaname AND p.tablename = t.tablename
WHERE t.schemaname = 'public'
GROUP BY t.tablename
ORDER BY policy_count ASC, t.tablename;

-- 3. Policies still using bare auth.uid() (should be zero after 00022).
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE lower(COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) LIKE '%auth.uid()%'
  AND lower(COALESCE(qual, '') || ' ' || COALESCE(with_check, '')) NOT LIKE '%(select auth.uid()%'
ORDER BY schemaname, tablename, policyname;

-- 4. SECURITY DEFINER functions without a pinned search_path.
--    Expected: zero rows.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = TRUE
  AND NOT EXISTS (
    SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS cfg
    WHERE cfg LIKE 'search_path=%'
  )
ORDER BY p.proname;

-- 5. Admin reject RPC keeps the optional reason (Phase 2.2 behaviour).
--    Expected: exactly one row, has_defaults = true.
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.proargdefaults IS NOT NULL AS has_defaults
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'admin_reject_registration';

-- 6. Role self-escalation guard exists and is NOT security definer.
--    Expected: two rows (users + profiles trigger when present), definer = false.
SELECT t.relname AS tablename, tr.tgname, p.prosecdef AS definer
FROM pg_trigger tr
JOIN pg_class t ON t.oid = tr.tgrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
JOIN pg_proc p ON p.oid = tr.tgfoid
WHERE n.nspname = 'public' AND tr.tgname IN ('trg_guard_user_role', 'trg_guard_profile_role');

-- 7. Storage buckets (00019). Expected: avatars and match-results, public = true.
SELECT id, public, file_size_limit, allowed_mime_types
FROM storage.buckets
WHERE id IN ('avatars', 'match-results')
ORDER BY id;

-- 8. Storage write policies (00019 + 00022). Expected: six write policies,
--    each pinning auth.uid() in its expression.
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname IN (
    'avatars owner insert', 'avatars owner update', 'avatars owner delete',
    'match results participant insert', 'match results participant update',
    'match results participant delete'
  )
ORDER BY policyname;

-- 9. Hot-path indexes (00021). Expected: all seven present.
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname IN (
    'idx_matches_status_date', 'idx_matches_organizer',
    'idx_match_participants_user_active', 'idx_messages_conversation_created',
    'idx_conversation_members_user', 'idx_tournament_participants_user',
    'idx_notifications_user_created'
  )
ORDER BY indexname;

-- 10. OAuth onboarding trigger. Expected: on_auth_user_created on auth.users.
SELECT event_object_schema, event_object_table, trigger_name
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- 11. Registration status values actually in use.
SELECT status, COUNT(*) AS rows
FROM public.tournament_participants
GROUP BY status
ORDER BY status;
