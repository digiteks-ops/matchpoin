-- ============================================================================
-- MATCHPOIN — Migration 00010: Private player chat
-- Run in: Supabase Dashboard -> SQL Editor
-- Depends on: 00009 (run that first).
-- Idempotent.
--
-- The tables already exist and are empty: `conversations`, `conversation_members`
-- and `messages` (message_type accepts 'text'). This migration adds the DM
-- identity key, locks the tables down with RLS, and adds the two RPCs the UI
-- needs (open a conversation, mark it read).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. DM identity key
--    Two users can have exactly one direct conversation, regardless of who
--    opened it. A vs B and B vs A produce the same key.
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS dm_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_dm_key
  ON public.conversations (dm_key)
  WHERE is_group = false AND dm_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_recent
  ON public.conversations (last_message_at DESC NULLS LAST);

-- ---------------------------------------------------------------------------
-- 2. Keep the conversation list preview fresh
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
     SET last_message_at = NEW.created_at,
         last_message_preview = COALESCE(
           NULLIF(NEW.content, ''),
           CASE NEW.type WHEN 'image' THEN '[Foto]' ELSE '[Pesan]' END
         ),
         updated_at = now()
   WHERE id = NEW.conversation_id;

  -- Accepting a message counts as reading it for the sender.
  UPDATE public.conversation_members
     SET last_read_at = NEW.created_at
   WHERE conversation_id = NEW.conversation_id
     AND user_id = NEW.sender_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_conversation_on_message ON public.messages;
CREATE TRIGGER trg_touch_conversation_on_message
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.touch_conversation_on_message();

-- ---------------------------------------------------------------------------
-- 3. RPCs
-- ---------------------------------------------------------------------------

-- Opens (or returns) the direct conversation between the caller and one other
-- player. RLS would otherwise let a user enumerate conversations.
CREATE OR REPLACE FUNCTION public.get_or_create_dm(p_other_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_key TEXT;
  v_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda harus masuk.');
  END IF;

  IF p_other_user_id = v_uid THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tidak dapat memulai percakapan dengan diri sendiri.');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_other_user_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pemain tidak ditemukan.');
  END IF;

  v_key := CASE WHEN v_uid::text < p_other_user_id::text
                THEN v_uid::text || '|' || p_other_user_id::text
                ELSE p_other_user_id::text || '|' || v_uid::text END;

  SELECT id INTO v_id
    FROM public.conversations
   WHERE is_group = false AND dm_key = v_key
   LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.conversations (created_by, is_group, dm_key)
    VALUES (v_uid, false, v_key)
    RETURNING id INTO v_id;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    VALUES (v_id, v_uid, 'member'), (v_id, p_other_user_id, 'member')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('success', true, 'conversationId', v_id);
EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_id FROM public.conversations
     WHERE is_group = false AND dm_key = v_key LIMIT 1;
    RETURN jsonb_build_object('success', true, 'conversationId', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda harus masuk.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_members cm
     WHERE cm.conversation_id = p_conversation_id AND cm.user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda bukan anggota percakapan ini.');
  END IF;

  UPDATE public.conversation_members
     SET last_read_at = now()
   WHERE conversation_id = p_conversation_id
     AND user_id = v_uid;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- conversations: only members may see a conversation.
DROP POLICY IF EXISTS "conversation members can read" ON public.conversations;
CREATE POLICY "conversation members can read" ON public.conversations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
       WHERE cm.conversation_id = conversations.id
         AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users create conversations they own" ON public.conversations;
CREATE POLICY "users create conversations they own" ON public.conversations
  FOR INSERT WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "conversation members can update" ON public.conversations;
CREATE POLICY "conversation members can update" ON public.conversations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
       WHERE cm.conversation_id = conversations.id AND cm.user_id = auth.uid()
    )
  );

-- conversation_members: a user sees their own membership rows and those of the
-- conversations they belong to.
DROP POLICY IF EXISTS "members read memberships" ON public.conversation_members;
CREATE POLICY "members read memberships" ON public.conversation_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversation_members mine
       WHERE mine.conversation_id = conversation_members.conversation_id
         AND mine.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "users join their own membership" ON public.conversation_members;
CREATE POLICY "users join their own membership" ON public.conversation_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = conversation_members.conversation_id
         AND c.created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members update own membership" ON public.conversation_members;
CREATE POLICY "members update own membership" ON public.conversation_members
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- messages: members read, members send as themselves.
DROP POLICY IF EXISTS "members read messages" ON public.messages;
CREATE POLICY "members read messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversation_members cm
       WHERE cm.conversation_id = messages.conversation_id
         AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "members send messages" ON public.messages;
CREATE POLICY "members send messages" ON public.messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversation_members cm
       WHERE cm.conversation_id = messages.conversation_id
         AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "senders edit own messages" ON public.messages;
CREATE POLICY "senders edit own messages" ON public.messages
  FOR UPDATE USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

DROP POLICY IF EXISTS "senders delete own messages" ON public.messages;
CREATE POLICY "senders delete own messages" ON public.messages
  FOR DELETE USING (sender_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.get_or_create_dm(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Realtime
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime'
       AND schemaname = 'public'
       AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;