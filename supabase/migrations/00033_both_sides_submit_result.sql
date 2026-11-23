-- ============================================================================
-- MATCHPOIN — Migration 00033: kedua pihak boleh submit skor
-- Run in: Supabase Dashboard -> SQL Editor (after 00032).
-- Idempotent.
--
-- Sebelumnya hanya host yang boleh mengirim hasil. Sekarang host DAN lawan
-- terkonfirmasi boleh mengirim skor; pengirim pertama menjadi hasil "pending"
-- dan pihak lain mengonfirmasi atau menyanggahnya.
--
-- Policy lama di 00022 hanya mengizinkan baris `match_participants`. Host yang
-- membuat pertandingan untuk orang lain belum tentu punya baris itu, sehingga
-- insert/update hasilnya gagal di RLS. Policy di bawah menambahkan jalur
-- organizer_id.
-- ============================================================================

DO $do$
BEGIN
  IF to_regclass('public.match_results') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "participants can submit results" ON public.match_results';
    EXECUTE 'CREATE POLICY "participants can submit results"
             ON public.match_results
             FOR INSERT
             WITH CHECK (
               submitted_by = (select auth.uid())
               AND (
                 EXISTS (
                   SELECT 1 FROM public.match_participants mp
                   WHERE mp.match_id = match_results.match_id
                     AND mp.user_id = (select auth.uid())
                 )
                 OR EXISTS (
                   SELECT 1 FROM public.matches m
                   WHERE m.id = match_results.match_id
                     AND m.organizer_id = (select auth.uid())
                 )
               )
             )';

    EXECUTE 'DROP POLICY IF EXISTS "participants can update results" ON public.match_results';
    EXECUTE 'CREATE POLICY "participants can update results"
             ON public.match_results
             FOR UPDATE
             USING (
               EXISTS (
                 SELECT 1 FROM public.match_participants mp
                 WHERE mp.match_id = match_results.match_id
                   AND mp.user_id = (select auth.uid())
               )
               OR EXISTS (
                 SELECT 1 FROM public.matches m
                 WHERE m.id = match_results.match_id
                   AND m.organizer_id = (select auth.uid())
               )
             )
             WITH CHECK (
               EXISTS (
                 SELECT 1 FROM public.match_participants mp
                 WHERE mp.match_id = match_results.match_id
                   AND mp.user_id = (select auth.uid())
               )
               OR EXISTS (
                 SELECT 1 FROM public.matches m
                 WHERE m.id = match_results.match_id
                   AND m.organizer_id = (select auth.uid())
               )
             )';
  END IF;
END
$do$;