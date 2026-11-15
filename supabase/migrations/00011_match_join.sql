-- ============================================================================
-- MATCHPOIN — Migration 00011: Race-safe match join / leave
-- Run in: Supabase Dashboard -> SQL Editor
-- Depends on: 00009 (court_id fix). Idempotent.
--
-- Why RPCs instead of client inserts:
--  * The spec forbids relying on frontend checks for capacity, duplicates or
--    concurrent slot grabs.
--  * Both functions take a row lock on `matches` (SELECT ... FOR UPDATE), so two
--    players tapping Join at the same instant are serialised and the second one
--    is told the match is full instead of both being written.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.join_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match RECORD;
  v_category TEXT;
  v_max INTEGER;
  v_per_team INTEGER;
  v_t1 INTEGER := 0;
  v_t2 INTEGER := 0;
  v_total INTEGER := 0;
  v_target INTEGER;
  v_status TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized',
      'message', 'Anda harus masuk untuk bergabung.');
  END IF;

  -- Row lock: serialises concurrent join attempts for this match.
  SELECT id, organizer_id, status, metadata
    INTO v_match
    FROM public.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF v_match.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found',
      'message', 'Pertandingan tidak ditemukan.');
  END IF;

  IF v_match.organizer_id = v_uid THEN
    RETURN jsonb_build_object('success', false, 'reason', 'organizer',
      'message', 'Anda adalah penyelenggara pertandingan ini.');
  END IF;

  IF v_match.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'cancelled',
      'message', 'Pertandingan ini telah dibatalkan.');
  END IF;

  IF v_match.status = 'completed' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'completed',
      'message', 'Pertandingan ini telah selesai.');
  END IF;

  IF v_match.status = 'in_progress' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'in_progress',
      'message', 'Pertandingan ini sedang berlangsung.');
  END IF;

  IF v_match.status = 'full' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'full',
      'message', 'Slot pertandingan sudah penuh.');
  END IF;

  v_category := COALESCE(v_match.metadata ->> 'category', 'mens_singles');
  v_max := CASE WHEN v_category LIKE '%doubles%' THEN 4 ELSE 2 END;
  v_per_team := v_max / 2;

  -- Duplicate guard, including pending/rejected leftovers.
  IF EXISTS (
    SELECT 1 FROM public.match_participants mp
     WHERE mp.match_id = p_match_id
       AND mp.user_id = v_uid
       AND mp.left_at IS NULL
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'duplicate',
      'message', 'Anda sudah terdaftar pada pertandingan ini.');
  END IF;

  SELECT
    count(*) FILTER (WHERE COALESCE(mp.team, 1) <> 2),
    count(*) FILTER (WHERE COALESCE(mp.team, 1) = 2),
    count(*)
  INTO v_t1, v_t2, v_total
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.left_at IS NULL
    AND COALESCE(mp.metadata ->> 'status', 'confirmed') IN ('confirmed', 'invited');

  IF v_total >= v_max THEN
    RETURN jsonb_build_object('success', false, 'reason', 'full',
      'message', 'Slot pertandingan sudah penuh.');
  END IF;

  -- Singles: host is side 1, joiner is always side 2.
  -- Doubles: fill the challenger side first, then the host's partner slot.
  IF v_max = 2 THEN
    v_target := 2;
  ELSIF v_t2 < v_per_team THEN
    v_target := 2;
  ELSIF v_t1 < v_per_team THEN
    v_target := 1;
  ELSE
    RETURN jsonb_build_object('success', false, 'reason', 'full',
      'message', 'Slot pertandingan sudah penuh.');
  END IF;

  INSERT INTO public.match_participants (
    match_id, user_id, is_organizer, team, metadata, confirmed_at
  ) VALUES (
    p_match_id, v_uid, false, v_target,
    jsonb_build_object('status', 'confirmed', 'joined_via', 'open_match'),
    now()
  );

  v_total := v_total + 1;
  v_status := CASE WHEN v_total >= v_max THEN 'full' ELSE 'open' END;

  UPDATE public.matches
     SET status = v_status,
         updated_at = now()
   WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'success', true,
    'team', v_target,
    'status', v_status,
    'filled', v_total,
    'capacity', v_max
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- leave_match: withdraw from a match you are not organising.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.leave_match(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match RECORD;
  v_category TEXT;
  v_max INTEGER;
  v_remaining INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda harus masuk.');
  END IF;

  SELECT id, organizer_id, status, metadata
    INTO v_match
    FROM public.matches
   WHERE id = p_match_id
   FOR UPDATE;

  IF v_match.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pertandingan tidak ditemukan.');
  END IF;

  IF v_match.organizer_id = v_uid THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Penyelenggara tidak dapat keluar. Batalkan pertandingan jika diperlukan.');
  END IF;

  IF v_match.status IN ('completed', 'cancelled') THEN
    RETURN jsonb_build_object('success', false, 'message',
      'Pertandingan yang sudah selesai tidak dapat diubah.');
  END IF;

  DELETE FROM public.match_participants
   WHERE match_id = p_match_id
     AND user_id = v_uid
     AND is_organizer = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda bukan peserta pertandingan ini.');
  END IF;

  v_category := COALESCE(v_match.metadata ->> 'category', 'mens_singles');
  v_max := CASE WHEN v_category LIKE '%doubles%' THEN 4 ELSE 2 END;

  SELECT count(*) INTO v_remaining
    FROM public.match_participants mp
   WHERE mp.match_id = p_match_id
     AND mp.left_at IS NULL
     AND COALESCE(mp.metadata ->> 'status', 'confirmed') IN ('confirmed', 'invited');

  UPDATE public.matches
     SET status = CASE WHEN v_remaining < v_max THEN 'open' ELSE status END
   WHERE id = p_match_id;

  RETURN jsonb_build_object('success', true, 'remaining', v_remaining);
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_match(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leave_match(UUID) TO authenticated;