-- 028_rewrite_projects_policies_no_self_query.sql
-- Remove self-query dependency from projects RLS checks (fix soft-delete UPDATE).

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p text;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'projects'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON projects', p);
  END LOOP;
END$$;

CREATE POLICY projects_select ON projects
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR app_is_project_member(id)
      OR app_is_project_client(id)
      OR COALESCE(owner_user_id, user_id) = auth.uid()
    )
  );

CREATE POLICY projects_insert ON projects
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR COALESCE(owner_user_id, user_id) = auth.uid()
      OR user_id = auth.uid()
    )
  );

CREATE POLICY projects_update ON projects
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR app_is_project_editor(id)
      OR COALESCE(owner_user_id, user_id) = auth.uid()
    )
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR app_is_project_editor(id)
      OR COALESCE(owner_user_id, user_id) = auth.uid()
    )
  );

CREATE POLICY projects_delete ON projects
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR app_is_project_editor(id)
      OR COALESCE(owner_user_id, user_id) = auth.uid()
    )
  );
