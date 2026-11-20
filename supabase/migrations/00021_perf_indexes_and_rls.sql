-- ============================================================================
-- MATCHPOIN — Migration 00021: Query performance indexes + RLS optimisation
-- Run in: Supabase Dashboard -> SQL Editor (after 00020).
-- Idempotent and safe for existing data. Policies keep the same semantics.
--
-- Every `auth.uid()` in a filtered policy is wrapped as `(select auth.uid())`
-- so Postgres evaluates it once per statement instead of once per row.
-- Membership/organizer checks move into SECURITY DEFINER helpers, which use
-- the indexes below and bypass nested RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Indexes for the hot read paths.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_matches_status_date
  ON public.matches (status, match_date, start_time);

CREATE INDEX IF NOT EXISTS idx_matches_organizer
  ON public.matches (organizer_id);

CREATE INDEX IF NOT EXISTS idx_match_participants_user_active
  ON public.match_participants (user_id) WHERE left_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
  ON public.conversation_members (user_id);

CREATE INDEX IF NOT EXISTS idx_conversation_members_conversation
  ON public.conversation_members (conversation_id);

CREATE INDEX IF NOT EXISTS idx_tournament_participants_user
  ON public.tournament_participants (user_id);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. Definer helpers (single indexed lookup instead of a correlated EXISTS).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_match_member(p_match_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.match_participants mp
    WHERE mp.match_id = p_match_id AND mp.user_id = p_user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_match_organizer(p_match_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = p_match_id AND m.organizer_id = p_user_id
  );
$$;

REVOKE ALL ON FUNCTION public.is_match_member(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_match_organizer(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_match_member(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_match_organizer(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. matches: same visibility rules, one auth.uid() evaluation per statement.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "matches are publicly readable" ON public.matches;
CREATE POLICY "matches are publicly readable"
  ON public.matches
  FOR SELECT
  USING (
    is_private = false
    OR organizer_id = (SELECT auth.uid())
    OR public.is_match_member(id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "organizers can create matches" ON public.matches;
CREATE POLICY "organizers can create matches"
  ON public.matches
  FOR INSERT
  WITH CHECK (organizer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "organizers can update their matches" ON public.matches;
CREATE POLICY "organizers can update their matches"
  ON public.matches
  FOR UPDATE
  USING (organizer_id = (SELECT auth.uid()))
  WITH CHECK (organizer_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "organizers can delete their matches" ON public.matches;
CREATE POLICY "organizers can delete their matches"
  ON public.matches
  FOR DELETE
  USING (organizer_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 4. match_participants.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users can join as themselves" ON public.match_participants;
CREATE POLICY "users can join as themselves"
  ON public.match_participants
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "organizers can invite participants" ON public.match_participants;
CREATE POLICY "organizers can invite participants"
  ON public.match_participants
  FOR INSERT
  WITH CHECK (public.is_match_organizer(match_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "participants and organizers can update" ON public.match_participants;
CREATE POLICY "participants and organizers can update"
  ON public.match_participants
  FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_match_organizer(match_id, (SELECT auth.uid()))
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    OR public.is_match_organizer(match_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "participants and organizers can remove" ON public.match_participants;
CREATE POLICY "participants and organizers can remove"
  ON public.match_participants
  FOR DELETE
  USING (
    user_id = (SELECT auth.uid())
    OR public.is_match_organizer(match_id, (SELECT auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 5. Own-row policies (users, player_profiles, notifications).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "users can insert themselves" ON public.users;
CREATE POLICY "users can insert themselves"
  ON public.users
  FOR INSERT
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users can update themselves" ON public.users;
CREATE POLICY "users can update themselves"
  ON public.users
  FOR UPDATE
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users can insert their own profile" ON public.player_profiles;
CREATE POLICY "users can insert their own profile"
  ON public.player_profiles
  FOR INSERT
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "users can update their own profile" ON public.player_profiles;
CREATE POLICY "users can update their own profile"
  ON public.player_profiles
  FOR UPDATE
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_own_read ON public.notifications;
CREATE POLICY notifications_own_read ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS notifications_own_update ON public.notifications;
CREATE POLICY notifications_own_update ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. Chat policies (keep the 00015 definer membership helper).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "conversation members can read" ON public.conversations;
CREATE POLICY "conversation members can read" ON public.conversations
  FOR SELECT USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS "users create conversations they own" ON public.conversations;
CREATE POLICY "users create conversations they own" ON public.conversations
  FOR INSERT WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "conversation members can update" ON public.conversations;
CREATE POLICY "conversation members can update" ON public.conversations
  FOR UPDATE USING (public.is_conversation_member(id));

DROP POLICY IF EXISTS "members read memberships" ON public.conversation_members;
CREATE POLICY "members read memberships" ON public.conversation_members
  FOR SELECT USING (
    user_id = (SELECT auth.uid())
    OR public.is_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "users join their own membership" ON public.conversation_members;
CREATE POLICY "users join their own membership" ON public.conversation_members
  FOR INSERT WITH CHECK (
    user_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_members.conversation_id
        AND c.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "members update own membership" ON public.conversation_members;
CREATE POLICY "members update own membership" ON public.conversation_members
  FOR UPDATE USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "members read messages" ON public.messages;
CREATE POLICY "members read messages" ON public.messages
  FOR SELECT USING (public.is_conversation_member(conversation_id));

DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND public.is_conversation_member(conversation_id)
  );

DROP POLICY IF EXISTS "senders edit own messages" ON public.messages;
CREATE POLICY "senders edit own messages" ON public.messages
  FOR UPDATE USING (sender_id = (SELECT auth.uid()))
  WITH CHECK (sender_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "senders delete own messages" ON public.messages;
CREATE POLICY "senders delete own messages" ON public.messages
  FOR DELETE USING (sender_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 7. League registrations: own rows (or admin), unchanged visibility.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "players read own registrations" ON public.tournament_participants;
CREATE POLICY "players read own registrations" ON public.tournament_participants
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_admin());
