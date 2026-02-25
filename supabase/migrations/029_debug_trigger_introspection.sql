-- 029_debug_trigger_introspection.sql

CREATE OR REPLACE FUNCTION app_debug_triggers(p_table text)
RETURNS TABLE (
  trigger_name text,
  enabled text,
  timing text,
  events text,
  function_name text,
  function_def text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    t.tgname::text AS trigger_name,
    t.tgenabled::text AS enabled,
    CASE WHEN (t.tgtype & 2) <> 0 THEN 'BEFORE' ELSE 'AFTER' END AS timing,
    concat_ws(',',
      CASE WHEN (t.tgtype & 4) <> 0 THEN 'INSERT' END,
      CASE WHEN (t.tgtype & 8) <> 0 THEN 'DELETE' END,
      CASE WHEN (t.tgtype & 16) <> 0 THEN 'UPDATE' END,
      CASE WHEN (t.tgtype & 32) <> 0 THEN 'TRUNCATE' END
    ) AS events,
    p.proname::text AS function_name,
    pg_get_functiondef(t.tgfoid)::text AS function_def
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN pg_proc p ON p.oid = t.tgfoid
  WHERE NOT t.tgisinternal
    AND n.nspname = 'public'
    AND c.relname = p_table
  ORDER BY t.tgname;
$$;

GRANT EXECUTE ON FUNCTION app_debug_triggers(text) TO authenticated, anon, service_role;
