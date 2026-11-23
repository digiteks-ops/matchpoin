-- ============================================================================
-- MATCHPOIN — Migration 00031: DTR tanpa batas bawah 1000
-- Run in: Supabase Dashboard -> SQL Editor (after 00030).
-- Idempotent and safe for existing rows.
--
-- DTR masih memakai skala 1000+ untuk rating AWAL (Beginner 1000, Intermediate
-- 1500, Advanced 2000, Expert 2500), tetapi pemain yang kalah sekarang boleh
-- turun di bawah 1000.
--
-- Yang dihapus di sini hanyalah lantai (floor) 1000 milik skala lama:
--   chk_player_ratings_current / chk_player_ratings_peak
--   chk_rating_history_old / chk_rating_history_new / chk_rating_history_opponent
--   guard p_new_rating < 1000 di dalam apply_match_rating_change()
--
-- Kategori tetap: <1500 Beginner, 1500–1999 Intermediate, 2000–2499 Advanced,
-- >=2500 Expert.
-- ============================================================================

-- 1) player_ratings: izinkan rating di bawah 1000 ----------------------------
DO $do$
BEGIN
  IF to_regclass('public.player_ratings') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.player_ratings DROP CONSTRAINT IF EXISTS chk_player_ratings_current';
    EXECUTE 'ALTER TABLE public.player_ratings DROP CONSTRAINT IF EXISTS chk_player_ratings_peak';

    EXECUTE 'ALTER TABLE public.player_ratings
             ADD CONSTRAINT chk_player_ratings_current CHECK (current_rating >= 1)';
    EXECUTE 'ALTER TABLE public.player_ratings
             ADD CONSTRAINT chk_player_ratings_peak CHECK (peak_rating >= 1)';
    EXECUTE 'ALTER TABLE public.player_ratings DROP CONSTRAINT IF EXISTS chk_player_ratings_counts';
    EXECUTE 'ALTER TABLE public.player_ratings
             ADD CONSTRAINT chk_player_ratings_counts
             CHECK (matches_played >= 0 AND wins >= 0 AND losses >= 0 AND draws >= 0)';
  END IF;
END
$do$;

-- 2) rating_history: izinkan riwayat di bawah 1000 ---------------------------
DO $do$
BEGIN
  IF to_regclass('public.rating_history') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.rating_history DROP CONSTRAINT IF EXISTS chk_rating_history_old';
    EXECUTE 'ALTER TABLE public.rating_history DROP CONSTRAINT IF EXISTS chk_rating_history_new';
    EXECUTE 'ALTER TABLE public.rating_history DROP CONSTRAINT IF EXISTS chk_rating_history_opponent';

    EXECUTE 'ALTER TABLE public.rating_history
             ADD CONSTRAINT chk_rating_history_old CHECK (old_rating >= 1)';
    EXECUTE 'ALTER TABLE public.rating_history
             ADD CONSTRAINT chk_rating_history_new CHECK (new_rating >= 1)';
    EXECUTE 'ALTER TABLE public.rating_history
             ADD CONSTRAINT chk_rating_history_opponent
             CHECK (opponent_rating IS NULL OR opponent_rating >= 1)';
    EXECUTE 'ALTER TABLE public.rating_history DROP CONSTRAINT IF EXISTS chk_rating_history_result';
    EXECUTE 'ALTER TABLE public.rating_history
             ADD CONSTRAINT chk_rating_history_result
             CHECK (match_result IN (''win'', ''loss'', ''draw''))';
  END IF;
END
$do$;

-- 3) apply_match_rating_change: hanya batas atas -----------------------------
CREATE OR REPLACE FUNCTION public.apply_match_rating_change(
  p_user_id UUID,
  p_match_id UUID,
  p_old_rating NUMERIC,
  p_new_rating NUMERIC,
  p_rating_change NUMERIC,
  p_change_reason TEXT,
  p_match_result TEXT,
  p_opponent_id UUID,
  p_opponent_rating NUMERIC,
  p_matches_played INTEGER,
  p_wins INTEGER,
  p_losses INTEGER,
  p_draws INTEGER,
  p_peak_rating NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Tidak ada lantai 1000: kekalahan boleh menurunkan rating melewati 1000.
  IF p_old_rating IS NULL OR p_new_rating IS NULL OR p_new_rating > 99999 THEN
    RAISE EXCEPTION 'DTR rating tidak valid (maksimal 99999)';
  END IF;

  -- rating_change is generated; do not write it explicitly.
  INSERT INTO public.rating_history (
    user_id,
    match_id,
    old_rating,
    new_rating,
    change_reason,
    match_result,
    opponent_id,
    opponent_rating,
    algorithm_version
  ) VALUES (
    p_user_id,
    p_match_id,
    p_old_rating,
    p_new_rating,
    p_change_reason,
    p_match_result,
    p_opponent_id,
    p_opponent_rating,
    2
  )
  ON CONFLICT (match_id, user_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.player_ratings
  SET current_rating = p_new_rating,
      peak_rating = GREATEST(peak_rating, p_peak_rating, p_new_rating),
      matches_played = p_matches_played,
      wins = p_wins,
      losses = p_losses,
      draws = p_draws,
      last_match_at = now(),
      last_rating_change_at = now(),
      updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player rating row not found for %', p_user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_match_rating_change(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_match_rating_change(UUID, UUID, NUMERIC, NUMERIC, NUMERIC, TEXT, TEXT, UUID, NUMERIC, INTEGER, INTEGER, INTEGER, INTEGER, NUMERIC) TO authenticated;