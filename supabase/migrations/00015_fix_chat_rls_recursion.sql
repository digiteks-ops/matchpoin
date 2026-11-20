-- ============================================================================
-- MATCHPOIN — Migration 00015: Fix infinite RLS recursion in player chat
-- Run in: Supabase Dashboard -> SQL Editor
-- Depends on: 00010 (run that first).
-- Idempotent. Policies only; no data changes.
--
-- Root cause: the 00010 SELECT policy on conversation_members contained an
-- EXISTS subquery on conversation_members itself. Every read of that table
-- re-entered the same policy, producing:
--   "infinite recursion detected in policy for relation conversation_members".
-- The conversations/messages policies reference conversation_members too, so
-- any query touching chat (including profile-save refreshes) could hit it.
--
-- Fix: the membership check moves into a SECURITY DEFINER helper. It runs as
-- the table owner, which bypasses RLS, so the check cannot recurse.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members cm
     WHERE cm.conversation_id = p_conversation_id
       AND cm.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_conversation_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- conversations: members may read/update; creator may insert (unchanged).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "conversation members can read" ON public.conversations;
CREATE POLICY "conversation members can read" ON public.conversations
  FOR SELECT USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS "conversation members can update" ON public.conversations;
CREATE POLICY "conversation members can update" ON public.conversations
  FOR UPDATE USING (public.is_conversation_member(id));

-- ---------------------------------------------------------------------------
-- conversation_members: own rows plus rows of conversations you belong to,
-- evaluated through the definer helper instead of a recursive subquery.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members read memberships" ON public.conversation_members;
CREATE POLICY "members read memberships" ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_conversation_member(conversation_id)
  );

-- ---------------------------------------------------------------------------
-- messages: membership checks go through the helper as well.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "members read messages" ON public.messages;
CREATE POLICY "members read messages" ON public.messages
  FOR SELECT USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND public.is_conversation_member(conversation_id)
  );
