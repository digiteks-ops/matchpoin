-- ============================================================================
-- MATCHPOIN — Migration 00020: Explain tool for performance measurements
-- Run in: Supabase Dashboard -> SQL Editor (after 00019).
-- Safe: read-only SELECT/EXPLAIN helper restricted to the service role.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.admin_explain(p_sql TEXT, p_analyze BOOLEAN DEFAULT TRUE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan JSONB;
BEGIN
  IF p_sql IS NULL OR btrim(p_sql) = '' THEN
    RAISE EXCEPTION 'Query kosong.';
  END IF;
  IF p_sql LIKE '%;%' THEN
    RAISE EXCEPTION 'Hanya satu statement, tanpa titik koma.';
  END IF;
  IF p_sql !~* '^\s*select\b' THEN
    RAISE EXCEPTION 'Hanya SELECT yang diizinkan.';
  END IF;

  IF p_analyze THEN
    EXECUTE 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' || p_sql INTO v_plan;
  ELSE
    EXECUTE 'EXPLAIN (FORMAT JSON) ' || p_sql INTO v_plan;
  END IF;

  RETURN v_plan;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_explain(TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_explain(TEXT, BOOLEAN) TO service_role;
