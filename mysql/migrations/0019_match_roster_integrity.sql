-- Match roster integrity.
--
-- A player may only occupy one slot in a match roster. The application
-- validates this on create/invite/join; this unique key enforces the same
-- invariant at the schema level so duplicated participant rows can never be
-- persisted (for example when two requests race).
ALTER TABLE match_participants
  ADD UNIQUE KEY uq_match_participants_match_user (match_id, user_id);
