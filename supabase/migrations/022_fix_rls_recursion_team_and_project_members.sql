-- 022_fix_rls_recursion_team_and_project_members.sql
-- Fixes ERROR 42P17 (infinite recursion) on team_members/project_members RLS.

-- Ensure helper functions are SECURITY DEFINER and stable.
CREATE OR REPLACE FUNCTION is_team_member_role(roles text[])
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
      AND tm.role::text = ANY(roles)
  );
$$;

CREATE OR REPLACE FUNCTION is_org_role(roles text[])
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
      AND tm.role::text = ANY(roles)
  );
$$;

CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
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

CREATE OR REPLACE FUNCTION is_internal_member(p_project_id uuid)
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

-- -------------------------------------------------------------------------
-- team_members: remove recursive policies
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS team_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_members_all" ON team_members;
DROP POLICY IF EXISTS "team_members_select" ON team_members;
DROP POLICY IF EXISTS "team_members_read" ON team_members;
DROP POLICY IF EXISTS "team_members_write" ON team_members;
DROP POLICY IF EXISTS "team_members_update" ON team_members;
DROP POLICY IF EXISTS "team_members_insert" ON team_members;
DROP POLICY IF EXISTS "team_members_delete" ON team_members;
DROP POLICY IF EXISTS "team_members_select_self" ON team_members;

CREATE POLICY "team_members_select_self" ON team_members
  FOR SELECT
  USING (user_id = auth.uid() OR is_team_member_role(ARRAY['owner', 'admin']));

-- Writes are intentionally restricted to service role / admin APIs.

-- -------------------------------------------------------------------------
-- project_members: remove recursive self-reference policies
-- -------------------------------------------------------------------------
ALTER TABLE IF EXISTS project_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_members: read" ON project_members;
DROP POLICY IF EXISTS "project_members: admin write" ON project_members;
DROP POLICY IF EXISTS "project_members_all" ON project_members;
DROP POLICY IF EXISTS "project_members_select" ON project_members;
DROP POLICY IF EXISTS "project_members_insert" ON project_members;
DROP POLICY IF EXISTS "project_members_update" ON project_members;
DROP POLICY IF EXISTS "project_members_delete" ON project_members;

CREATE POLICY "project_members_select" ON project_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR is_client_user_of_project(project_id)
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = project_members.project_id
        AND (p.owner_user_id = auth.uid() OR p.user_id = auth.uid())
    )
    OR is_team_member_role(ARRAY['owner', 'admin'])
  );

CREATE POLICY "project_members_insert" ON project_members
  FOR INSERT
  WITH CHECK (
    is_internal_member(project_id)
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = project_members.project_id
        AND (p.owner_user_id = auth.uid() OR p.user_id = auth.uid())
    )
    OR is_team_member_role(ARRAY['owner', 'admin'])
  );

CREATE POLICY "project_members_update" ON project_members
  FOR UPDATE
  USING (
    is_internal_member(project_id)
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = project_members.project_id
        AND (p.owner_user_id = auth.uid() OR p.user_id = auth.uid())
    )
    OR is_team_member_role(ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    is_internal_member(project_id)
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = project_members.project_id
        AND (p.owner_user_id = auth.uid() OR p.user_id = auth.uid())
    )
    OR is_team_member_role(ARRAY['owner', 'admin'])
  );

CREATE POLICY "project_members_delete" ON project_members
  FOR DELETE
  USING (
    is_internal_member(project_id)
    OR EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = project_members.project_id
        AND (p.owner_user_id = auth.uid() OR p.user_id = auth.uid())
    )
    OR is_team_member_role(ARRAY['owner', 'admin'])
  );
