-- MATCHPOIN V2 — allow organizers to invite a player into their own match.
--
-- Migration 00004 only let a user insert a match_participants row for themselves
-- (user_id = auth.uid()), which blocks the invite flow: an organizer has to be
-- able to add another player to their own match.
--
-- Idempotent: safe to run more than once.

DROP POLICY IF EXISTS "organizers can invite participants" ON public.match_participants;

CREATE POLICY "organizers can invite participants"
  ON public.match_participants
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_participants.match_id
        AND m.organizer_id = auth.uid()
    )
  );