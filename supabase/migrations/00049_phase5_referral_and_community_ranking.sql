-- ============================================================================
-- MATCHPOIN — Migration 00049: Phase 5 referral links + community tracking
-- Run in: Supabase Dashboard -> SQL Editor (after 00048b).
-- Idempotent and safe to re-run.
--
-- Adds:
--   * communities.referral_code: one unique code per host/community.
--   * community_referrals: records which community a registration came from.
--   * assign_signup_referral trigger: reads auth metadata `referral_code`,
--     records the referral, and joins the new player to that community.
--   * RLS: hosts can only read referrals for their own community.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Unique referral code per community (one community per host)
-- ---------------------------------------------------------------------------

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

UPDATE public.communities
SET referral_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
WHERE referral_code IS NULL;

ALTER TABLE public.communities
  ALTER COLUMN referral_code SET DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE referral_code IS NULL) THEN
    ALTER TABLE public.communities ALTER COLUMN referral_code SET NOT NULL;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_communities_referral_code
  ON public.communities (upper(referral_code))
  WHERE referral_code IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Referral registrations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.community_referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_referrals_community
  ON public.community_referrals (community_id, created_at DESC);

-- Records one referral per player and joins them to the community. The unique
-- user_id constraint makes repeated calls (e.g. email retries) safe.
CREATE OR REPLACE FUNCTION public.record_community_referral(
  p_user_id UUID,
  p_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT := upper(regexp_replace(COALESCE(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_community_id UUID;
BEGIN
  IF p_user_id IS NULL OR length(v_code) < 4 THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_community_id
  FROM public.communities
  WHERE upper(referral_code) = v_code
  LIMIT 1;

  IF v_community_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.community_referrals (community_id, user_id, referral_code)
  VALUES (v_community_id, p_user_id, v_code)
  ON CONFLICT (user_id) DO NOTHING;

  INSERT INTO public.community_members (community_id, user_id, role)
  VALUES (v_community_id, p_user_id, 'player')
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN v_community_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_signup_referral()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF to_regclass('public.community_referrals') IS NULL THEN
    RETURN NEW;
  END IF;

  v_code := NEW.raw_user_meta_data->>'referral_code';
  IF v_code IS NULL OR length(trim(v_code)) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.record_community_referral(NEW.id, v_code);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_referral ON auth.users;
CREATE TRIGGER on_auth_user_created_referral
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_signup_referral();

-- ---------------------------------------------------------------------------
-- 3. RLS: referral rows are visible to the owning host and admins
-- ---------------------------------------------------------------------------

ALTER TABLE public.community_referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS community_referrals_host_read ON public.community_referrals;
CREATE POLICY community_referrals_host_read ON public.community_referrals
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_role((select auth.uid()), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = community_referrals.community_id
        AND c.admin_id = (select auth.uid())
    )
  );