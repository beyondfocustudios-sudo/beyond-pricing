-- 030_projects_select_policy_allow_deleted_rows.sql
-- Fix soft-delete UPDATE failing because SELECT policy hid NEW row (deleted_at not null).

DROP POLICY IF EXISTS projects_select ON projects;

CREATE POLICY projects_select ON projects
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR app_is_project_member(id)
      OR app_is_project_client(id)
      OR COALESCE(owner_user_id, user_id) = auth.uid()
    )
  );
