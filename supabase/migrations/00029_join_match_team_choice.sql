-- ============================================================================
-- MATCHPOIN — Migration 00029: choose host team or opponent team on doubles
-- Run in: Supabase SQL Editor (after 00028).
--
-- join_match now accepts an optional p_team (1 = host team, 2 = opponent team)
-- so a player applying to an open doubles match can pick a side. The request
-- is still stored as 'pending' and needs host approval. Singles ignore p_team
-- and always target the opponent side.
-- Idempotent: drops and recreates the RPC.
-- ============================================================================

DROP FUNCTION IF EXISTS public.join_match(uuid);

CREATE OR REPLACE FUNCTION public.join_match(
  p_match_id UUID,
  p_team INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_match RECORD;
  v_existing RECORD;
  v_existing_status TEXT;
  v_category TEXT;
  v_max INTEGER;
  v_max_rows INTEGER;
  v_per_team INTEGER;
  v_t1 INTEGER := 0;
  v_t2 INTEGER := 0;
  v_a1 INTEGER := 0;
  v_a2 INTEGER := 0;
  v_total INTEGER := 0;
  v_active INTEGER := 0;
  v_want_team INTEGER;
  v_target INTEGER;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized',
      'message', 'Anda harus masuk untuk bergabung.');
  END IF;

  SELECT id, organizer_id, status, metadata, max_players
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
  v_max_rows := COALESCE(v_match.max_players, v_max + 2);

  v_want_team := CASE WHEN p_team IN (1, 2) THEN p_team ELSE NULL END;

  SELECT id, metadata
    INTO v_existing
    FROM public.match_participants
   WHERE match_id = p_match_id
     AND user_id = v_uid
     AND left_at IS NULL
   FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    v_existing_status := COALESCE(v_existing.metadata ->> 'status', 'confirmed');
    IF v_existing_status IN ('confirmed', 'invited', 'pending') THEN
      RETURN jsonb_build_object('success', false, 'reason', 'duplicate',
        'message', 'Anda sudah terdaftar atau sedang menunggu persetujuan pada pertandingan ini.');
    END IF;
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

  SELECT
    count(*) FILTER (
      WHERE COALESCE(mp.team, 1) = 1
        AND (mp.is_organizer OR COALESCE(mp.metadata ->> 'status', 'confirmed') IN ('confirmed', 'invited', 'pending'))
    ),
    count(*) FILTER (
      WHERE COALESCE(mp.team, 1) = 2
        AND (mp.is_organizer OR COALESCE(mp.metadata ->> 'status', 'confirmed') IN ('confirmed', 'invited', 'pending'))
    ),
    count(*)
  INTO v_a1, v_a2, v_active
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.left_at IS NULL
    AND (
      mp.is_organizer
      OR COALESCE(mp.metadata ->> 'status', 'confirmed') IN ('confirmed', 'invited', 'pending')
    );

  IF v_active >= v_max_rows THEN
    RETURN jsonb_build_object('success', false, 'reason', 'full',
      'message', 'Permohonan untuk pertandingan ini sudah penuh.');
  END IF;

  IF v_max = 2 THEN
    IF v_want_team = 1 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'full',
        'message', 'Pertandingan tunggal tidak memiliki slot tim host.');
    END IF;
    IF v_t2 >= 1 OR v_a2 >= 1 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'full',
        'message', 'Slot lawan sudah terisi atau sedang menunggu persetujuan.');
    END IF;
    v_target := 2;
  ELSE
    IF v_want_team = 1 THEN
      IF v_a1 >= v_per_team THEN
        RETURN jsonb_build_object('success', false, 'reason', 'full',
          'message', 'Tim host sudah penuh.');
      END IF;
      v_target := 1;
    ELSIF v_want_team = 2 THEN
      IF v_a2 >= v_per_team THEN
        RETURN jsonb_build_object('success', false, 'reason', 'full',
          'message', 'Tim lawan sudah penuh.');
      END IF;
      v_target := 2;
    ELSE
      IF v_a2 < v_per_team THEN
        v_target := 2;
      ELSIF v_a1 < v_per_team THEN
        v_target := 1;
      ELSE
        RETURN jsonb_build_object('success', false, 'reason', 'full',
          'message', 'Slot pertandingan sudah penuh.');
      END IF;
    END IF;
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.match_participants
       SET metadata = jsonb_build_object('status', 'pending', 'joined_via', 'open_match'),
           team = v_target,
           confirmed_at = NULL
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.match_participants (
      match_id, user_id, is_organizer, team, metadata, confirmed_at
    ) VALUES (
      p_match_id, v_uid, false, v_target,
      jsonb_build_object('status', 'pending', 'joined_via', 'open_match'),
      NULL
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'pending',
    'team', v_target,
    'message', 'Permohonan terkirim. Menunggu persetujuan host.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_match(UUID, INTEGER) TO authenticated;
