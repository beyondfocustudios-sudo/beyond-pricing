-- 024_fix_projects_soft_delete_rls.sql
-- Fix projects soft-delete failing with RLS (UPDATE setting deleted_at)

-- ------------------------------------------------------------------
-- SECURITY DEFINER helpers (safe, non-recursive checks)
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_is_org_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.role::text IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION app_is_project_member(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION app_is_project_editor(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM project_members pm
    WHERE pm.project_id = p_project_id
      AND pm.user_id = auth.uid()
      AND pm.role::text IN ('owner', 'admin', 'editor')
  );
$$;

CREATE OR REPLACE FUNCTION app_is_project_client(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM projects p
    JOIN client_users cu ON cu.client_id = p.client_id
    WHERE p.id = p_project_id
      AND cu.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION app_can_read_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR app_is_project_member(p_project_id)
      OR app_is_project_client(p_project_id)
      OR EXISTS (
        SELECT 1
        FROM projects p
        WHERE p.id = p_project_id
          AND (p.owner_user_id = auth.uid() OR p.user_id = auth.uid())
      )
    );
$$;

CREATE OR REPLACE FUNCTION app_can_write_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND (
      app_is_org_admin()
      OR app_is_project_editor(p_project_id)
      OR EXISTS (
        SELECT 1
        FROM projects p
        WHERE p.id = p_project_id
          AND (p.owner_user_id = auth.uid() OR p.user_id = auth.uid())
      )
    );
$$;

-- ------------------------------------------------------------------
-- projects policy hard-reset
-- ------------------------------------------------------------------
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
  USING (deleted_at IS NULL AND app_can_read_project(id));

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

-- Critical fix: WITH CHECK must NOT enforce deleted_at IS NULL
-- so soft-delete updates (setting deleted_at) are allowed.
CREATE POLICY projects_update ON projects
  FOR UPDATE
  USING (app_can_write_project(id))
  WITH CHECK (app_can_write_project(id));

CREATE POLICY projects_delete ON projects
  FOR DELETE
  USING (app_can_write_project(id));
