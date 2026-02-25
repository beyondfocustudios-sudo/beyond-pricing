-- 027_debug_policy_introspection.sql
-- Temporary introspection helper for RLS policy debugging.

CREATE OR REPLACE FUNCTION app_debug_policies(p_tablename text)
RETURNS TABLE (
  policyname text,
  permissive text,
  roles name[],
  cmd text,
  qual text,
  with_check text
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    p.policyname::text,
    p.permissive::text,
    p.roles,
    p.cmd::text,
    p.qual::text,
    p.with_check::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = p_tablename
  ORDER BY p.policyname;
$$;

GRANT EXECUTE ON FUNCTION app_debug_policies(text) TO authenticated, anon, service_role;
