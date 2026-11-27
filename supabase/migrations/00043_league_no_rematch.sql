-- ============================================================================
-- MATCHPOIN — Migration 00043: Liga hanya boleh mempertemukan lawan yang sama 1x
--
-- Jalankan di: Supabase Dashboard -> SQL Editor (setelah 00042).
-- Idempoten: aman dijalankan berulang.
--
-- Aturan: setiap peserta liga hanya boleh bertemu lawan yang sama maksimal 1x.
-- Aplikasi sudah menolak jadwal duplikat di `createOpenMatch`
-- (`assertNewLeaguePairing`) dengan pesan yang jelas; trigger ini adalah
-- pengaman terakhir di database agar dua jadwal yang dibuat hampir bersamaan
-- tetap tidak bisa lolos.
--
-- Cakupan: hanya pertandingan yang punya `tournament_id` (liga/turnamen).
-- Pertandingan umum di luar turnamen tidak dibatasi sama sekali.
-- Pertandingan berstatus `cancelled` tidak dihitung, sehingga jadwal yang
-- dibatalkan boleh dijadwalkan ulang.
-- ============================================================================

BEGIN;

-- Sisi tim: 2 = sisi lawan, selain itu (termasuk NULL) = sisi host.
CREATE OR REPLACE FUNCTION public.league_side(p_team INTEGER)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN p_team = 2 THEN 2 ELSE 1 END;
$$;

CREATE OR REPLACE FUNCTION public.assert_league_single_pairing()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tournament UUID;
  v_match_status TEXT;
  v_player_a UUID;
  v_player_b UUID;
BEGIN
  SELECT m.tournament_id, m.status
    INTO v_tournament, v_match_status
    FROM public.matches m
   WHERE m.id = NEW.match_id;

  IF v_tournament IS NULL THEN
    RETURN NEW; -- pertandingan umum: bebas, tanpa pembatasan
  END IF;
  IF v_match_status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Cari pasangan lawan di pertandingan ini yang sudah pernah dipertemukan
  -- pada pertandingan liga lain (yang tidak dibatalkan).
  SELECT n1.user_id, n2.user_id
    INTO v_player_a, v_player_b
    FROM public.match_participants n1
    JOIN public.match_participants n2
      ON n2.match_id = n1.match_id
     AND n2.user_id <> n1.user_id
     AND public.league_side(n2.team) <> public.league_side(n1.team)
   WHERE n1.match_id = NEW.match_id
     AND n1.left_at IS NULL
     AND n2.left_at IS NULL
     AND EXISTS (
       SELECT 1
         FROM public.matches m
         JOIN public.match_participants o1
           ON o1.match_id = m.id AND o1.user_id = n1.user_id AND o1.left_at IS NULL
         JOIN public.match_participants o2
           ON o2.match_id = m.id AND o2.user_id = n2.user_id AND o2.left_at IS NULL
        WHERE m.tournament_id = v_tournament
          AND m.id <> NEW.match_id
          AND m.status <> 'cancelled'
          AND public.league_side(o1.team) <> public.league_side(o2.team)
     )
   LIMIT 1;

  IF v_player_a IS NOT NULL THEN
    RAISE EXCEPTION
      'Setiap peserta hanya boleh bertemu lawan yang sama maksimal 1x. Pasangan ini sudah pernah dijadwalkan di liga ini.'
      USING ERRCODE = 'unique_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assert_league_single_pairing ON public.match_participants;
CREATE TRIGGER trg_assert_league_single_pairing
  AFTER INSERT ON public.match_participants
  FOR EACH ROW
  EXECUTE FUNCTION public.assert_league_single_pairing();

COMMIT;
