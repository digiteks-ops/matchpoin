-- ============================================================================
-- MATCHPOIN — Migration 00019: Storage buckets and image upload policies
-- Run in: Supabase Dashboard -> SQL Editor (after 00018).
-- Idempotent and safe for existing data (buckets/policies only).
--
-- Buckets:
--   avatars       public read, owner-only writes
--   match-results public read, writes limited to participants of the match
-- Writes also succeed through service-role signed upload URLs, which bypass RLS.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avatars', 'avatars', TRUE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('match-results', 'match-results', TRUE, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Membership helper for match-results uploads (definer avoids RLS recursion).
CREATE OR REPLACE FUNCTION public.is_match_participant(
  p_match_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_match_id IS NULL OR p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id AND m.organizer_id = p_user_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = p_match_id
      AND mp.user_id = p_user_id
      AND mp.left_at IS NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_match_participant(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_match_participant(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Drop any previous version of these policies before recreating them. A plain
-- `DROP POLICY IF EXISTS` can miss a policy created by a different owner, which
-- produced `policy "..." already exists` on re-runs. The catalog loop is
-- deterministic and schema-qualified.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  p RECORD;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'avatars public read',
        'avatars owner insert',
        'avatars owner update',
        'avatars owner delete',
        'match results public read',
        'match results participant insert',
        'match results participant update',
        'match results participant delete'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', p.policyname);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- avatars: public read; owner-only writes.
-- Accepts both key layouts:
--   {userId}/avatar-*.webp        (current)
--   avatars/{userId}-*.jpg        (legacy)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "avatars public read" ON storage.objects;
CREATE POLICY "avatars public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars owner insert" ON storage.objects;
CREATE POLICY "avatars owner insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '-%')
    )
  );

DROP POLICY IF EXISTS "avatars owner update" ON storage.objects;
CREATE POLICY "avatars owner update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '-%')
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '-%')
    )
  );

DROP POLICY IF EXISTS "avatars owner delete" ON storage.objects;
CREATE POLICY "avatars owner delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      split_part(name, '/', 1) = auth.uid()::text
      OR (split_part(name, '/', 1) = 'avatars' AND name LIKE 'avatars/' || auth.uid()::text || '-%')
    )
  );

-- ---------------------------------------------------------------------------
-- match-results: public read; only participants/organizer may write.
-- Key layout: matches/{matchId}/{userId}/...
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "match results public read" ON storage.objects;
CREATE POLICY "match results public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'match-results');

DROP POLICY IF EXISTS "match results participant insert" ON storage.objects;
CREATE POLICY "match results participant insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'match-results'
    AND split_part(name, '/', 1) = 'matches'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 3) = auth.uid()::text
    AND public.is_match_participant(split_part(name, '/', 2)::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "match results participant update" ON storage.objects;
CREATE POLICY "match results participant update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'match-results'
    AND split_part(name, '/', 1) = 'matches'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 3) = auth.uid()::text
    AND public.is_match_participant(split_part(name, '/', 2)::uuid, auth.uid())
  );

DROP POLICY IF EXISTS "match results participant delete" ON storage.objects;
CREATE POLICY "match results participant delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'match-results'
    AND split_part(name, '/', 1) = 'matches'
    AND split_part(name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND split_part(name, '/', 3) = auth.uid()::text
    AND public.is_match_participant(split_part(name, '/', 2)::uuid, auth.uid())
  );
