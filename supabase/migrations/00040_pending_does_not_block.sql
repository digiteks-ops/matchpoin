-- ============================================================================
-- MATCHPOIN — Migration 00040: pending requests do not reserve a slot
-- Run in: Supabase Dashboard -> SQL Editor (after 00039).
-- Idempotent and safe to re-run.
--
-- Behaviour change: while a slot is not yet confirmed by the host, other
-- players may still apply for the same slot. Capacity is enforced only by
-- confirmed/invited participants, so multiple pending requests can wait for
-- the host to pick one. A headroom cap (logical capacity + 2) still limits how
-- many applications a match can accumulate, to prevent abuse.
--
-- Catatan: ini membalik perilaku migration 00038 (pending menempati slot).
-- Permintaan pemain adalah: selama host belum menerima lawan, pemain lain
-- tetap boleh mengajukan slot. Kapasitas bermain tetap dijaga hanya oleh baris
-- confirmed/invited, sehingga satu permohonan pending tidak pernah membuat
-- pertandingan terlihat penuh.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.join_match(
  p_match_id UUID,
  p_team INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  v_t1 INTEGER := 0;   -- confirmed/invited on the host side
  v_t2 INTEGER := 0;   -- confirmed/invited on the opponent side
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
  -- matches.max_players stores the logical capacity (2 or 4). Use a separate
  -- headroom for pending applications so they can exceed the logical capacity.
  v_max_rows := v_max + 2;

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

  -- Capacity is based on confirmed/invited rows only. Pending requests never
  -- reserve a playing slot, so other players can still apply.
  SELECT
    count(*) FILTER (WHERE COALESCE(mp.team, 1) <> 2),
    count(*) FILTER (WHERE COALESCE(mp.team, 1) = 2),
    count(*)
  INTO v_t1, v_t2, v_total
  FROM public.match_participants mp
  WHERE mp.match_id = p_match_id
    AND mp.left_at IS NULL
    AND (
      mp.is_organizer
      OR COALESCE(mp.metadata ->> 'status', 'confirmed') IN ('confirmed', 'invited')
    );

  IF v_total >= v_max THEN
    RETURN jsonb_build_object('success', false, 'reason', 'full',
      'message', 'Slot pertandingan sudah penuh.');
  END IF;

  -- Headroom guard: limits how many applications (including pending) a match
  -- can accumulate, but it is never used to treat a pending request as if it
  -- had already filled a playing slot.
  SELECT count(*)
    INTO v_active
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
    IF v_t2 >= 1 THEN
      RETURN jsonb_build_object('success', false, 'reason', 'full',
        'message', 'Slot lawan sudah terisi.');
    END IF;
    v_target := 2;
  ELSE
    IF v_want_team = 1 THEN
      IF v_t1 >= v_per_team THEN
        RETURN jsonb_build_object('success', false, 'reason', 'full',
          'message', 'Tim host sudah penuh.');
      END IF;
      v_target := 1;
    ELSIF v_want_team = 2 THEN
      IF v_t2 >= v_per_team THEN
        RETURN jsonb_build_object('success', false, 'reason', 'full',
          'message', 'Tim lawan sudah penuh.');
      END IF;
      v_target := 2;
    ELSE
      IF v_t2 < v_per_team THEN
        v_target := 2;
      ELSIF v_t1 < v_per_team THEN
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

REVOKE ALL ON FUNCTION public.join_match(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_match(UUID, INTEGER) TO authenticated, service_role;

COMMIT;
