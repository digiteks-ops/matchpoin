-- ============================================================================
-- MATCHPOIN — Migration 00034: kategori Liga Tennis IKA17 (daftar final)
-- Run in: Supabase Dashboard -> SQL Editor (after 00033).
-- Idempotent and safe to re-run.
--
-- Daftar kategori final:
--   1. Single Man Beginner                      (mens_singles, putra,       beginner)
--   2. Double Man Beginner–Intermediate         (mens_doubles, putra,       beginner+intermediate)
--   3. Double Woman Beginner                    (womens_doubles, putri,     beginner)
--   4. Double Woman Beginner–Intermediate       (womens_doubles_intermediate, putri, beginner+intermediate)
--   5. Double Mix Beginner                      (mixed_doubles, campuran,   beginner)
--
-- Syarat level:
--   beginner     : maksimal 2 tahun bermain
--   intermediate : lebih dari 2 tahun bermain
--   Semua level  : belum pernah mengikuti PORDA, PORPROV, atau PON
--
-- Kategori lama `womens_singles` (Single Woman) dihapus dari daftar.
--
-- Isi migrasi:
--   1. constraints kategori tournaments (termasuk womens_doubles_intermediate)
--   2. tabel liga per kategori (seed/refresh 5 baris)
--   3. kolom level pemain + verifikasi eligibility per pendaftaran
--   4. register_for_competition: validasi level, gender, dan eligibility
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Constraint kategori turnamen
-- ---------------------------------------------------------------------------
-- Baris liga lama `womens_singles` (Single Woman) HARUS dibereskan lebih dulu.
-- `ADD CONSTRAINT` memvalidasi SELURUH baris yang sudah ada, jadi selama masih
-- ada satu baris `womens_singles`, constraint baru gagal dan SELURUH migrasi
-- batal — itulah sebabnya kategori baru tidak pernah muncul di aplikasi.
--
-- Baris placeholder kosong dihapus; baris yang sudah punya pendaftar dipindahkan
-- ke kategori penggantinya `womens_doubles_intermediate` agar tidak ada pemain
-- yang hilang.
DO $do$
DECLARE
  legacy RECORD;
  v_entries INTEGER;
  v_matches INTEGER;
  v_slug_taken BOOLEAN;
BEGIN
  IF to_regclass('public.tournaments') IS NULL THEN
    RETURN;
  END IF;

  FOR legacy IN
    SELECT id, slug, name FROM public.tournaments WHERE category = 'womens_singles'
  LOOP
    SELECT COUNT(*) INTO v_entries
    FROM public.tournament_participants
    WHERE tournament_id = legacy.id AND status <> 'rejected';

    SELECT COUNT(*) INTO v_matches
    FROM public.matches
    WHERE tournament_id = legacy.id;

    IF v_entries = 0 AND v_matches = 0 THEN
      -- Placeholder kosong untuk kategori yang sudah tidak ada di produk.
      -- Hapus anak-anaknya dulu supaya FK tidak menghalangi.
      IF to_regclass('public.tournament_registration_audit_logs') IS NOT NULL THEN
        DELETE FROM public.tournament_registration_audit_logs WHERE tournament_id = legacy.id;
      END IF;
      IF to_regclass('public.league_standings') IS NOT NULL THEN
        DELETE FROM public.league_standings WHERE tournament_id = legacy.id;
      END IF;
      DELETE FROM public.tournament_participants WHERE tournament_id = legacy.id;
      DELETE FROM public.tournaments WHERE id = legacy.id;
      RAISE NOTICE 'Liga lama dihapus (tanpa pendaftar): % (%)', legacy.name, legacy.slug;
    ELSE
      -- Ada pendaftar/pertandingan: pindahkan ke kategori pengganti, jangan
      -- hapus apa pun. Menghapus akan mengosongkan matches.tournament_id
      -- (ON DELETE SET NULL) dan riwayat pertandingan ikut kehilangan liga.
      SELECT EXISTS (
        SELECT 1 FROM public.tournaments
        WHERE slug = 'league-q1-2027-womens-doubles-intermediate'
          AND id <> legacy.id
      ) INTO v_slug_taken;

      UPDATE public.tournament_participants
      SET category = 'womens_doubles_intermediate'
      WHERE tournament_id = legacy.id;

      IF to_regclass('public.league_standings') IS NOT NULL THEN
        UPDATE public.league_standings
        SET category = 'womens_doubles_intermediate'
        WHERE tournament_id = legacy.id;
      END IF;

      UPDATE public.tournaments
      SET category = 'womens_doubles_intermediate',
          -- Ganti slug hanya bila slug kanonik belum dipakai baris lain.
          slug = CASE
                   WHEN v_slug_taken THEN slug
                   ELSE 'league-q1-2027-womens-doubles-intermediate'
                 END,
          metadata = COALESCE(metadata, '{}'::jsonb)
                     || jsonb_build_object('category', 'womens_doubles_intermediate'),
          updated_at = now()
      WHERE id = legacy.id;

      RAISE NOTICE 'Liga lama dipindahkan ke womens_doubles_intermediate: % (%)',
        legacy.name, legacy.slug;
    END IF;
  END LOOP;
END
$do$;

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
             ''womens_doubles'',
             ''womens_doubles_intermediate'',
             ''mixed_doubles''
           ))';
END
$do$;

-- ---------------------------------------------------------------------------
-- 2. Eligibility pemain per pendaftaran
-- ---------------------------------------------------------------------------
DO $do$
BEGIN
  IF to_regclass('public.tournament_participants') IS NULL THEN
    RETURN;
  END IF;

  -- Level yang dinyatakan pemain saat mendaftar (beginner / intermediate).
  EXECUTE 'ALTER TABLE public.tournament_participants
           ADD COLUMN IF NOT EXISTS playing_experience TEXT';

  -- Pemisahan akun pernah ikut PORDA/PORPROV/PON atau tidak.
  EXECUTE 'ALTER TABLE public.tournament_participants
           ADD COLUMN IF NOT EXISTS eligibility_confirmed BOOLEAN NOT NULL DEFAULT false';
END
$do$;

-- Level yang dipakai saat mendaftar disimpan juga di profil agar admin bisa
-- memverifikasi tanpa membuka riwayat pendaftaran.
DO $do$
BEGIN
  IF to_regclass('public.player_profiles') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.player_profiles
             ADD COLUMN IF NOT EXISTS playing_experience TEXT';

    EXECUTE 'ALTER TABLE public.player_profiles DROP CONSTRAINT IF EXISTS player_profiles_playing_experience_check';
    EXECUTE 'ALTER TABLE public.player_profiles
             ADD CONSTRAINT player_profiles_playing_experience_check
             CHECK (playing_experience IS NULL OR playing_experience IN (''beginner'', ''intermediate''))';
  END IF;
END
$do$;

-- ---------------------------------------------------------------------------
-- 3. Seed / refresh liga per kategori
-- ---------------------------------------------------------------------------
DO $do$
DECLARE
  v_city UUID;
  v_organizer UUID;
  v_entry RECORD;
BEGIN
  IF to_regclass('public.tournaments') IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_city FROM public.cities ORDER BY (name = 'Makassar') DESC, name LIMIT 1;

  SELECT id INTO v_organizer
  FROM public.users
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_organizer IS NULL THEN
    -- Belum ada akun: seed liga ditunda sampai admin pertama dibuat.
    RETURN;
  END IF;

  FOR v_entry IN
    SELECT * FROM (VALUES
      ('mens_singles',
       'league-q1-2027-mens-singles',
       'Single Man Beginner'),
      ('mens_doubles',
       'league-q1-2027-mens-doubles',
       'Double Man Beginner–Intermediate'),
      ('womens_doubles',
       'league-q1-2027-womens-doubles',
       'Double Woman Beginner'),
      ('womens_doubles_intermediate',
       'league-q1-2027-womens-doubles-intermediate',
       'Double Woman Beginner–Intermediate'),
      ('mixed_doubles',
       'league-q1-2027-mixed-doubles',
       'Double Mix Beginner')
    ) AS t(category, slug, label)
  LOOP
    -- Update-lalu-insert, bukan ON CONFLICT. `uq_tournaments_slug` adalah
    -- PARTIAL unique index (WHERE slug IS NOT NULL); ON CONFLICT hanya mau
    -- memakai partial index bila predikatnya ditulis ulang, dan bentuknya pun
    -- berbeda antar-database (constraint penuh vs partial index). Pola ini
    -- bekerja di keduanya.
    UPDATE public.tournaments
    SET name = 'Liga Tennis IKA17 — ' || v_entry.label,
        description = v_entry.label || ' Liga Tennis IKA17 Musim 1 2027.',
        category = v_entry.category,
        season = 'Musim 1 2027',
        is_league = true,
        league_key = 'ika17-2027',
        league_name = 'Liga Tennis IKA17',
        status = 'registration_open',
        registration_deadline = '2026-12-31',
        main_event_start_date = '2027-04-03',
        main_event_end_date = '2027-04-04',
        max_participants = COALESCE(public.tournaments.max_participants, 24),
        metadata = COALESCE(public.tournaments.metadata, '{}'::jsonb)
                   || jsonb_build_object(
                        'league_key', 'ika17-2027',
                        'league_name', 'Liga Tennis IKA17',
                        'season', 'Musim 1 2027',
                        'category', v_entry.category,
                        'is_league', true
                      ),
        updated_at = now()
    WHERE slug = v_entry.slug;

    IF NOT FOUND THEN
      INSERT INTO public.tournaments (
        name, slug, description, city_id, organizer_id, format, status,
        registration_open_at, registration_close_at, start_date, end_date,
        max_participants, category, season, is_league, league_key, league_name,
        registration_deadline, main_event_start_date, main_event_end_date,
        is_public, requires_approval, metadata
      ) VALUES (
        'Liga Tennis IKA17 — ' || v_entry.label,
        v_entry.slug,
        v_entry.label || ' Liga Tennis IKA17 Musim 1 2027.',
        v_city,
        v_organizer,
        'round_robin',
        'registration_open',
        '2026-12-01T00:00:00+08:00',
        '2026-12-31T23:59:59+08:00',
        '2027-01-01',
        '2027-03-31',
        24,
        v_entry.category,
        'Musim 1 2027',
        true,
        'ika17-2027',
        'Liga Tennis IKA17',
        '2026-12-31',
        '2027-04-03',
        '2027-04-04',
        true,
        true,
        jsonb_build_object(
          'league_key', 'ika17-2027',
          'league_name', 'Liga Tennis IKA17',
          'season', 'Musim 1 2027',
          'category', v_entry.category,
          'is_league', true
        )
      );
    END IF;
  END LOOP;
END
$do$;

-- ---------------------------------------------------------------------------
-- 4. register_for_competition: level + eligibility
-- ---------------------------------------------------------------------------
-- Signature lama (3 argumen) diganti total agar PostgREST tidak ambigu.
DROP FUNCTION IF EXISTS public.register_for_competition(UUID, UUID, UUID);

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
  v_tournament public.tournaments%ROWTYPE;
  v_category TEXT;
  v_doubles BOOLEAN;
  v_entry_id UUID := gen_random_uuid();
  v_entry_count INTEGER;
  v_user_gender TEXT;
  v_partner_gender TEXT;
  v_level TEXT := lower(COALESCE(p_playing_experience, ''));
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Harap masuk untuk mendaftar liga.');
  END IF;
  IF auth.uid() IS NOT NULL AND p_user_id <> auth.uid() THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tidak dapat mendaftarkan pemain lain.');
  END IF;

  SELECT * INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id AND is_league = TRUE
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Liga tidak ditemukan.');
  END IF;

  v_category := COALESCE(
    NULLIF(v_tournament.category, ''),
    NULLIF(v_tournament.metadata->>'category', '')
  );
  IF v_category IS NULL OR v_category NOT IN (
    'mens_singles', 'mens_doubles', 'womens_doubles',
    'womens_doubles_intermediate', 'mixed_doubles'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori liga tidak valid.');
  END IF;
  -- 'womens_doubles_intermediate' TIDAK berakhir dengan '_doubles', jadi pola
  -- '%_doubles' salah menganggapnya kategori tunggal. Cocokkan kata "doubles"
  -- di mana pun posisinya — tidak ada kategori tunggal yang memuatnya.
  v_doubles := v_category LIKE '%doubles%';

  -- Syarat pengalaman bermain: beginner maksimal 2 tahun, intermediate lebih.
  IF v_level NOT IN ('beginner', 'intermediate') THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Pilih pengalaman bermain: beginner (maksimal 2 tahun) atau intermediate (lebih dari 2 tahun).'
    );
  END IF;

  IF v_category = 'mens_singles' OR v_category = 'womens_doubles' OR v_category = 'mixed_doubles' THEN
    IF v_level <> 'beginner' THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Kategori ini khusus beginner: maksimal 2 tahun bermain.'
      );
    END IF;
  END IF;

  -- Tidak boleh pernah tampil di PORDA, PORPROV, atau PON.
  IF p_eligibility_confirmed IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Konfirmasi bahwa Anda belum pernah mengikuti PORDA, PORPROV, atau PON.'
    );
  END IF;

  IF v_tournament.status <> 'registration_open' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Pendaftaran liga belum dibuka atau sudah ditutup.');
  END IF;
  IF v_tournament.registration_deadline IS NOT NULL
     AND (now() AT TIME ZONE 'Asia/Jakarta')::date > v_tournament.registration_deadline THEN
    RETURN jsonb_build_object('success', false, 'message', 'Batas waktu pendaftaran liga sudah lewat.');
  END IF;
  IF v_doubles AND p_partner_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori ganda wajib memilih partner.');
  END IF;
  IF NOT v_doubles AND p_partner_user_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kategori tunggal tidak menggunakan partner.');
  END IF;
  IF p_partner_user_id = p_user_id THEN
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
     now(), v_level, true);

  IF v_doubles AND p_partner_user_id IS NOT NULL THEN
    INSERT INTO public.tournament_participants
      (tournament_id, user_id, category, entry_id, entry_role, status,
       joined_at, playing_experience, eligibility_confirmed)
    VALUES
      (p_tournament_id, p_partner_user_id, v_category, v_entry_id, 'partner', 'pending',
       now(), v_level, true);
  END IF;

  -- Simpan level di profil agar admin dapat memverifikasi kapan pun.
  UPDATE public.player_profiles
  SET playing_experience = v_level,
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
END $$;

REVOKE EXECUTE ON FUNCTION public.register_for_competition(UUID, UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_for_competition(UUID, UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;