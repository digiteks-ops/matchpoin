-- ============================================================================
-- MATCHPOIN — Migration 00044: Chat pertandingan (host ↔ penantang, semua peserta)
--
-- Jalankan di: Supabase Dashboard -> SQL Editor (setelah 00043).
-- Idempoten: aman dijalankan berulang.
--
-- Tabel chat sudah ada sejak 00010 (conversations, conversation_members,
-- messages) beserta RLS-nya, dan RPC `get_or_create_dm` sudah dipakai untuk
-- chat pribadi. Migrasi ini hanya menambah yang dibutuhkan chat PERTANDINGAN:
--
--  1. Satu percakapan grup per pertandingan (unique per match_id), sehingga
--     chat "semua peserta" tidak pernah terduplikasi meski dua orang membuka
--     halaman chat bersamaan.
--  2. RPC `get_or_create_match_chat` — membuat percakapan grup pertandingan dan
--     memasukkan SELURUH peserta aktif (host, partner, lawan, penantang yang
--     sudah diterima) sebagai anggota. Aman dipanggil berkali-kali.
--  3. RPC `sync_match_chat_members` — menyusulkan anggota setelah host menerima
--     penantang, karena pemain yang baru diterima harus ikut percakapan.
--
-- Aplikasi tetap berjalan sebelum migrasi ini dijalankan: service chat memakai
-- jalur cadangan berbasis tabel yang sudah ada. Yang hilang tanpa migrasi ini
-- hanyalah jaminan satu-percakapan-per-pertandingan saat dua orang membuka chat
-- bersamaan (index unik) dan pembuatan anggota yang atomik (RPC).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Satu percakapan grup per pertandingan
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS ux_conversations_match_group
  ON public.conversations (match_id)
  WHERE is_group = true AND match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_members_user
  ON public.conversation_members (user_id, conversation_id);

-- ---------------------------------------------------------------------------
-- 2. Peserta aktif sebuah pertandingan
--
-- "Aktif" berarti host atau baris berstatus confirmed. Baris pending (penantang
-- yang belum diterima), invited, rejected, cancelled, dan declined bukan
-- anggota percakapan: mereka belum menjadi peserta pertandingan.
--
-- SECURITY DEFINER supaya policy conversations/conversation_members tidak
-- rekursif saat memeriksa keanggotaan.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.match_chat_user_ids(p_match_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT mp.user_id
    FROM public.match_participants mp
   WHERE mp.match_id = p_match_id
     AND mp.left_at IS NULL
     AND (
       mp.is_organizer
       OR COALESCE(mp.metadata ->> 'status', 'confirmed') = 'confirmed'
     );
$$;

REVOKE ALL ON FUNCTION public.match_chat_user_ids(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_chat_user_ids(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. get_or_create_match_chat
--
-- Pemanggil wajib peserta pertandingan. Mengembalikan conversationId yang sudah
-- ada atau baru dibuat, lalu memastikan seluruh peserta aktif menjadi anggota.
-- Idempoten.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_or_create_match_chat(p_match_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_conversation_id UUID;
  v_title TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', 'unauthorized',
      'message', 'Anda harus masuk untuk membuka chat pertandingan.');
  END IF;

  SELECT title INTO v_title FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'not_found',
      'message', 'Pertandingan tidak ditemukan.');
  END IF;

  -- Hanya peserta aktif yang boleh membuka chat pertandingan.
  IF NOT EXISTS (
    SELECT 1 FROM public.match_chat_user_ids(p_match_id) AS uid WHERE uid = v_uid
  ) THEN
    RETURN jsonb_build_object('success', false, 'reason', 'forbidden',
      'message', 'Hanya peserta pertandingan yang dapat membuka chat ini.');
  END IF;

  SELECT id INTO v_conversation_id
    FROM public.conversations
   WHERE match_id = p_match_id
     AND is_group = true
   LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO public.conversations (created_by, is_group, title, match_id)
    VALUES (v_uid, true, v_title, p_match_id)
    RETURNING id INTO v_conversation_id;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role)
  SELECT v_conversation_id, uid, 'member'
    FROM public.match_chat_user_ids(p_match_id) AS uid
  ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true, 'conversationId', v_conversation_id);
EXCEPTION
  WHEN unique_violation THEN
    -- Dua permintaan bersamaan: pakai percakapan yang sudah menang balapan.
    SELECT id INTO v_conversation_id
      FROM public.conversations
     WHERE match_id = p_match_id AND is_group = true
     LIMIT 1;

    IF v_conversation_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'reason', 'conflict',
        'message', 'Gagal membuka chat pertandingan. Coba lagi.');
    END IF;

    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    SELECT v_conversation_id, uid, 'member'
      FROM public.match_chat_user_ids(p_match_id) AS uid
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object('success', true, 'conversationId', v_conversation_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_match_chat(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_or_create_match_chat(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. sync_match_chat_members
--
-- Dipanggil setelah host menerima penantang supaya pemain yang baru diterima
-- langsung masuk percakapan. Tidak membuat percakapan baru bila belum ada
-- (chat belum dibuka siapa pun), jadi tidak ada percakapan kosong.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_match_chat_members(p_match_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation_id UUID;
  v_added INTEGER := 0;
BEGIN
  SELECT id INTO v_conversation_id
    FROM public.conversations
   WHERE match_id = p_match_id
     AND is_group = true
   LIMIT 1;

  IF v_conversation_id IS NULL THEN
    RETURN 0;
  END IF;

  WITH inserted AS (
    INSERT INTO public.conversation_members (conversation_id, user_id, role)
    SELECT v_conversation_id, uid, 'member'
      FROM public.match_chat_user_ids(p_match_id) AS uid
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_added FROM inserted;

  RETURN COALESCE(v_added, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.sync_match_chat_members(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_match_chat_members(UUID) TO authenticated, service_role;

COMMIT;