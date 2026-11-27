-- ============================================================================
-- MATCHPOIN — Migration 00045: hapus kategori liga Double Mix
-- Run in: Supabase Dashboard -> SQL Editor (after 00042).
-- Idempotent and safe to re-run.
--
-- Liga IKA17 kini hanya tiga kategori:
--   1. Single Man     (mens_singles)
--   2. Double Man     (mens_doubles)
--   3. Double Woman   (womens_doubles)
--
-- Kategori `mixed_doubles` (Double Mix) tidak lagi dibuka sebagai liga.
-- Format ganda campuran tetap tersedia untuk pertandingan umum di luar
-- turnamen; yang dihapus hanya kategorinya di liga.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Nonaktifkan liga Double Mix (data pendaftaran tetap disimpan untuk audit)
--
-- `category` WAJIB dikosongkan, bukan hanya `is_league`: constraint baru di
-- langkah 2 menolak nilai di luar tiga kategori, sehingga baris lama dengan
-- category 'mixed_doubles' akan menggagalkan ALTER TABLE (23514). Nilai asli
-- disimpan di metadata.removed_category agar jejaknya tidak hilang.
--
-- `status` bertipe enum `tournament_status`, jadi jangan membandingkan dengan
-- literal yang mungkin tidak ada di enum (mis. 'active' -> 22P02). Baris yang
-- kategorinya dihapus tidak lagi menjadi liga, sehingga selalu 'cancelled'.
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.tournaments') IS NULL THEN
    RETURN;
  END IF;

  -- Model liga (00009) mengizinkan category NULL, tetapi DB yang dibuat dari
  -- skema lama bisa masih membawa NOT NULL. Drop NOT NULL agar baris yang
  -- kategorinya dihapus tidak gagal dengan 23502.
  EXECUTE 'ALTER TABLE public.tournaments ALTER COLUMN category DROP NOT NULL';

  UPDATE public.tournaments
  SET metadata = COALESCE(metadata, '{}'::jsonb)
        || jsonb_build_object('removed_category', category),
      is_league = false,
      status = 'cancelled',
      category = NULL
  WHERE category IS NOT NULL
    AND category NOT IN ('mens_singles', 'mens_doubles', 'womens_doubles');
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. Constraint kategori: hanya tiga kategori final
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  c RECORD;
BEGIN
  IF to_regclass('public.tournaments') IS NULL THEN
    RETURN;
  END IF;

  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.tournaments'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%category%'
  LOOP
    EXECUTE format('ALTER TABLE public.tournaments DROP CONSTRAINT %I', c.conname);
  END LOOP;

  EXECUTE 'ALTER TABLE public.tournaments
           ADD CONSTRAINT tournaments_category_check
           CHECK (category IS NULL OR category IN (
             ''mens_singles'',
             ''mens_doubles'',
             ''womens_doubles''
           ))';
END
$do$;

-- ---------------------------------------------------------------------------
-- 3. Buang semua versi lama register_for_competition
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
-- 4. Definisi final: tiga kategori liga, tanpa validasi level
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
  v_entry_id UUID := gen_random_uuid();
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

  IF p_eligibility_confirmed IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.'
    );
  END IF;

  v_category := COALESCE(v_tournament.category, 'mens_singles');
  IF v_category NOT IN ('mens_singles', 'mens_doubles', 'womens_doubles') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori liga tidak valid.');
  END IF;

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

  IF v_category LIKE 'mens_%' THEN
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

  -- Tanpa batas kuota: pendaftaran hanya ditutup oleh periode dan status liga.

  INSERT INTO public.tournament_participants
    (tournament_id, user_id, category, entry_id, entry_role, partner_user_id, status,
     joined_at, playing_experience, eligibility_confirmed)
  VALUES
    (p_tournament_id, p_user_id, v_category, v_entry_id, 'captain', p_partner_user_id, 'pending',
     now(), NULL, TRUE);

  IF v_doubles THEN
    INSERT INTO public.tournament_participants
      (tournament_id, user_id, category, entry_id, entry_role, status,
       joined_at, playing_experience, eligibility_confirmed)
    VALUES
      (p_tournament_id, p_partner_user_id, v_category, v_entry_id, 'partner', 'pending',
       now(), NULL, TRUE);
  END IF;

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
