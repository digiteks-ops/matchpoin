-- ============================================================================
-- MATCHPOIN — Migration 00036: perbaikan pendaftaran liga & kuota
-- Run in: Supabase Dashboard -> SQL Editor (after 00035).
-- Idempotent and safe to re-run.
--
-- Dua masalah yang diperbaiki:
--
-- 1. "Player tidak bisa daftar turnamen".
--    Migrasi 00034 membuat ulang `register_for_competition` dengan lima
--    parameter. Bila versi lama (3 parameter atau lebih awal) masih ada,
--    PostgREST dapat memilih fungsi yang salah / ambigu sehingga pemanggilan
--    dari aplikasi gagal. Di sini SEMUA versi lama dibuang lebih dulu, baru
--    satu definisi final dipasang.
--
-- 2. "Ajukan slot bilang penuh, padahal belum".
--    Kuota kategori hanya boleh menghitung pendaftar yang benar-benar
--    diterima, dan baris ganda dihitung satu tim (entry_id). Aturan ini
--    dipertahankan, tetapi pesan dan batasnya dibuat eksplisit.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Buang semua versi lama fungsi pendaftaran
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'register_for_competition'
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s', fn.signature);
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. Definisi final register_for_competition
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_for_competition(
  p_user_id UUID,
  p_tournament_id UUID,
  p_partner_user_id UUID DEFAULT NULL,
  p_playing_experience TEXT DEFAULT NULL,
  p_eligibility_confirmed BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tournament RECORD;
  v_user_gender TEXT;
  v_partner_gender TEXT;
  v_category TEXT;
  v_doubles BOOLEAN;
  v_entry_count INTEGER;
  v_entry_id UUID := gen_random_uuid();
  v_experience TEXT := lower(COALESCE(p_playing_experience, ''));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Akun pemain tidak ditemukan.');
  END IF;

  SELECT id, name, category, status, registration_deadline, registration_open_at,
         max_participants, slug
    INTO v_tournament
    FROM public.tournaments
   WHERE id = p_tournament_id;

  IF v_tournament.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Liga tidak ditemukan.');
  END IF;

  IF v_tournament.status <> 'registration_open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pendaftaran untuk kategori ini sudah ditutup.');
  END IF;

  -- Periode pendaftaran: 1 - 31 Desember 2026 (sumber: ika17-core.mjs).
  IF v_tournament.registration_open_at IS NOT NULL
     AND (v_tournament.registration_open_at AT TIME ZONE 'Asia/Makassar')::date > CURRENT_DATE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pendaftaran dibuka mulai ' ||
        to_char((v_tournament.registration_open_at AT TIME ZONE 'Asia/Makassar')::date,
                'FMDD FMMonth YYYY') || '.'
    );
  END IF;

  IF v_tournament.registration_deadline IS NOT NULL
     AND v_tournament.registration_deadline < CURRENT_DATE THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pendaftaran untuk kategori ini sudah ditutup.');
  END IF;

  IF v_experience NOT IN ('beginner', 'intermediate') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pilih pengalaman bermain: beginner (maksimal 2 tahun) atau intermediate (lebih dari 2 tahun).'
    );
  END IF;

  IF p_eligibility_confirmed IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.'
    );
  END IF;

  v_category := COALESCE(v_tournament.category, 'mens_singles');
  v_doubles := v_category LIKE '%doubles%';

  -- Tunggal tidak boleh memilih partner; ganda wajib punya partner.
  IF NOT v_doubles AND p_partner_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori tunggal tidak dapat memilih partner.');
  END IF;
  IF v_doubles AND p_partner_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori ganda wajib memilih partner.');
  END IF;
  IF p_partner_user_id IS NOT NULL AND p_partner_user_id = p_user_id THEN
    RETURN jsonb_build_object('success', false, 'message', 'Partner tidak boleh sama dengan diri sendiri.');
  END IF;

  SELECT gender INTO v_user_gender FROM public.users WHERE id = p_user_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Akun pemain tidak ditemukan.');
  END IF;

  IF v_doubles THEN
    SELECT gender INTO v_partner_gender FROM public.users WHERE id = p_partner_user_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner tidak ditemukan.');
    END IF;
  END IF;

  -- Satu pendaftaran per pemain per kategori (status rejected boleh daftar lagi).
  IF EXISTS (
    SELECT 1 FROM public.tournament_participants tp
    WHERE tp.tournament_id = p_tournament_id
      AND tp.category = v_category
      AND tp.user_id IN (p_user_id, COALESCE(p_partner_user_id, p_user_id))
      AND tp.status <> 'rejected'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Anda atau partner sudah terdaftar di kategori ini.');
  END IF;

  IF v_category = 'mixed_doubles' THEN
    IF v_user_gender IS NULL OR v_partner_gender IS NULL
       OR v_user_gender NOT IN ('male', 'female') OR v_partner_gender NOT IN ('male', 'female') THEN
      RETURN jsonb_build_object('success', false, 'message', 'Lengkapi jenis kelamin Anda dan partner untuk ganda campuran.');
    END IF;
    IF v_user_gender = v_partner_gender THEN
      RETURN jsonb_build_object('success', false, 'message', 'Ganda campuran wajib terdiri dari satu putra dan satu putri.');
    END IF;
  ELSIF v_category LIKE 'mens_%' THEN
    IF v_user_gender IS DISTINCT FROM 'male' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Kategori putra hanya dapat diisi pemain putra.');
    END IF;
    IF v_doubles AND v_partner_gender IS DISTINCT FROM 'male' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner ganda putra harus pemain putra.');
    END IF;
  ELSIF v_category LIKE 'womens_%' THEN
    IF v_user_gender IS DISTINCT FROM 'female' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Kategori putri hanya dapat diisi pemain putri.');
    END IF;
    IF v_doubles AND v_partner_gender IS DISTINCT FROM 'female' THEN
      RETURN jsonb_build_object('success', false, 'message', 'Partner ganda putri harus pemain putri.');
    END IF;
  END IF;

  -- Kuota: hanya pendaftar yang sudah diterima, dan satu tim ganda = satu slot.
  SELECT COUNT(DISTINCT COALESCE(tp.entry_id::text, tp.id::text)) INTO v_entry_count
  FROM public.tournament_participants tp
  WHERE tp.tournament_id = p_tournament_id
    AND tp.category = v_category
    AND tp.status IN ('accepted', 'confirmed');

  IF v_entry_count >= COALESCE(v_tournament.max_participants, 24) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kuota kategori ini sudah penuh.');
  END IF;

  INSERT INTO public.tournament_participants
    (tournament_id, user_id, category, entry_id, entry_role, partner_user_id, status,
     joined_at, playing_experience, eligibility_confirmed)
  VALUES
    (p_tournament_id, p_user_id, v_category, v_entry_id, 'captain', p_partner_user_id, 'pending',
     now(), v_experience, TRUE);

  IF v_doubles THEN
    INSERT INTO public.tournament_participants
      (tournament_id, user_id, category, entry_id, entry_role, status,
       joined_at, playing_experience, eligibility_confirmed)
    VALUES
      (p_tournament_id, p_partner_user_id, v_category, v_entry_id, 'partner', 'pending',
       now(), v_experience, TRUE);
  END IF;

  -- Simpan level di profil agar admin dapat memverifikasi kapan pun.
  UPDATE public.player_profiles
  SET playing_experience = v_experience,
      updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO public.tournament_registration_audit_logs
    (registration_id, tournament_id, action, actor_id, previous_status, new_status, reason)
  SELECT id, p_tournament_id, 'submitted', p_user_id, NULL, 'pending', NULL
  FROM public.tournament_participants
  WHERE entry_id = v_entry_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'entry_id', v_entry_id,
    'category', v_category,
    'tournament_name', v_tournament.name,
    'partner_user_id', p_partner_user_id,
    'status', 'pending',
    'message', CASE WHEN v_doubles
      THEN 'Pendaftaran ganda berhasil dikirim. Menunggu persetujuan admin.'
      ELSE 'Pendaftaran berhasil dikirim. Menunggu persetujuan admin.' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_for_competition(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_competition(UUID, UUID, UUID, TEXT, BOOLEAN)
  TO authenticated, service_role;

COMMIT;