-- ============================================================================
-- MATCHPOIN — Migration 00023: Align notifications.message with app code
-- Run in: Supabase Dashboard -> SQL Editor (after 00022).
-- Idempotent, safe for existing data.
--
-- The live notifications table uses `body`, while the app (and 00013) writes and
-- reads `message`. Every notification insert failed with:
--   "Could not find the 'message' column of 'notifications'".
-- This adds `message`, backfills it from `body`, and keeps both columns in sync
-- so legacy writers and the app both work.
-- ============================================================================

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS message TEXT;

UPDATE public.notifications
SET message = COALESCE(NULLIF(message, ''), body, '')
WHERE message IS NULL OR message = '';

ALTER TABLE public.notifications ALTER COLUMN message SET DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE message IS NULL) THEN
    ALTER TABLE public.notifications ALTER COLUMN message SET NOT NULL;
  END IF;
END $$;

-- `body` exists on the live project; keep it in sync for other readers.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'body'
  ) THEN
    ALTER TABLE public.notifications ALTER COLUMN body SET DEFAULT '';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sync_notification_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.message IS NULL OR NEW.message = '' THEN
    NEW.message := COALESCE(NEW.body, '');
  END IF;
  IF NEW.body IS NULL OR NEW.body = '' THEN
    BEGIN
      NEW.body := NEW.message;
    EXCEPTION WHEN undefined_column THEN
      NULL; -- fresh databases may not have the legacy body column
    END;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'body'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_sync_notification_message ON public.notifications';
    EXECUTE 'CREATE TRIGGER trg_sync_notification_message
             BEFORE INSERT OR UPDATE ON public.notifications
             FOR EACH ROW EXECUTE FUNCTION public.sync_notification_message()';
  END IF;
END $$;