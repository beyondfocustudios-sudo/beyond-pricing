-- 023_fix_recursive_policies_core_tables.sql
-- Hard reset of core RLS policies to eliminate 42P17 recursion loops.

-- -------------------------------------------------------------------------
-- SECURITY DEFINER helpers (bypass recursive policy chains safely)
-- -------------------------------------------------------------------------
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

-- -------------------------------------------------------------------------
-- Drop all policies for affected tables to avoid hidden duplicates
-- -------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  p text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'projects',
    'project_members',
    'checklists',
    'checklist_items',
    'clients',
    'client_users',
    'conversations',
    'messages'
  ]
  LOOP
    FOR p IN
      SELECT policyname
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', p, t);
    END LOOP;
  END LOOP;
END$$;

-- -------------------------------------------------------------------------
-- projects
-- -------------------------------------------------------------------------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY projects_update ON projects
  FOR UPDATE
  USING (app_can_write_project(id))
  WITH CHECK (app_can_write_project(id));

CREATE POLICY projects_delete ON projects
  FOR DELETE
  USING (app_can_write_project(id));

-- -------------------------------------------------------------------------
-- project_members
-- -------------------------------------------------------------------------
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY project_members_select ON project_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR app_is_org_admin()
    OR app_can_read_project(project_id)
  );

CREATE POLICY project_members_insert ON project_members
  FOR INSERT
  WITH CHECK (
    app_is_org_admin()
    OR app_can_write_project(project_id)
  );

CREATE POLICY project_members_update ON project_members
  FOR UPDATE
  USING (app_is_org_admin() OR app_can_write_project(project_id))
  WITH CHECK (app_is_org_admin() OR app_can_write_project(project_id));

CREATE POLICY project_members_delete ON project_members
  FOR DELETE
  USING (app_is_org_admin() OR app_can_write_project(project_id));

-- -------------------------------------------------------------------------
-- checklists
-- -------------------------------------------------------------------------
ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklists_select ON checklists
  FOR SELECT
  USING (
    (deleted_at IS NULL)
    AND (
      is_template = true
      OR user_id = auth.uid()
      OR (project_id IS NOT NULL AND app_can_read_project(project_id))
      OR app_is_org_admin()
    )
  );

CREATE POLICY checklists_insert ON checklists
  FOR INSERT
  WITH CHECK (
    (
      is_template = true
      AND app_is_org_admin()
    )
    OR
    (
      is_template = false
      AND user_id = auth.uid()
      AND (project_id IS NULL OR app_can_write_project(project_id))
    )
  );

CREATE POLICY checklists_update ON checklists
  FOR UPDATE
  USING (
    app_is_org_admin()
    OR user_id = auth.uid()
    OR (project_id IS NOT NULL AND app_can_write_project(project_id))
  )
  WITH CHECK (
    app_is_org_admin()
    OR user_id = auth.uid()
    OR (project_id IS NOT NULL AND app_can_write_project(project_id))
  );

CREATE POLICY checklists_delete ON checklists
  FOR DELETE
  USING (
    app_is_org_admin()
    OR user_id = auth.uid()
    OR (project_id IS NOT NULL AND app_can_write_project(project_id))
  );

-- -------------------------------------------------------------------------
-- checklist_items
-- -------------------------------------------------------------------------
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY checklist_items_select ON checklist_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM checklists c
      WHERE c.id = checklist_items.checklist_id
        AND c.deleted_at IS NULL
        AND (
          c.is_template = true
          OR c.user_id = auth.uid()
          OR (c.project_id IS NOT NULL AND app_can_read_project(c.project_id))
          OR app_is_org_admin()
        )
    )
  );

CREATE POLICY checklist_items_insert ON checklist_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM checklists c
      WHERE c.id = checklist_items.checklist_id
        AND (
          app_is_org_admin()
          OR c.user_id = auth.uid()
          OR (c.project_id IS NOT NULL AND app_can_write_project(c.project_id))
        )
    )
  );

CREATE POLICY checklist_items_update ON checklist_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM checklists c
      WHERE c.id = checklist_items.checklist_id
        AND (
          app_is_org_admin()
          OR c.user_id = auth.uid()
          OR (c.project_id IS NOT NULL AND app_can_write_project(c.project_id))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM checklists c
      WHERE c.id = checklist_items.checklist_id
        AND (
          app_is_org_admin()
          OR c.user_id = auth.uid()
          OR (c.project_id IS NOT NULL AND app_can_write_project(c.project_id))
        )
    )
  );

CREATE POLICY checklist_items_delete ON checklist_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM checklists c
      WHERE c.id = checklist_items.checklist_id
        AND (
          app_is_org_admin()
          OR c.user_id = auth.uid()
          OR (c.project_id IS NOT NULL AND app_can_write_project(c.project_id))
        )
    )
  );

-- -------------------------------------------------------------------------
-- clients
-- -------------------------------------------------------------------------
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_select ON clients
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      app_is_org_admin()
      OR EXISTS (
        SELECT 1
        FROM projects p
        WHERE p.client_id = clients.id
          AND app_can_read_project(p.id)
      )
    )
  );

CREATE POLICY clients_insert ON clients
  FOR INSERT
  WITH CHECK (app_is_org_admin());

CREATE POLICY clients_update ON clients
  FOR UPDATE
  USING (app_is_org_admin())
  WITH CHECK (app_is_org_admin());

CREATE POLICY clients_delete ON clients
  FOR DELETE
  USING (app_is_org_admin());

-- -------------------------------------------------------------------------
-- client_users
-- -------------------------------------------------------------------------
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY client_users_select ON client_users
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR app_is_org_admin()
  );

CREATE POLICY client_users_insert ON client_users
  FOR INSERT
  WITH CHECK (app_is_org_admin());

CREATE POLICY client_users_update ON client_users
  FOR UPDATE
  USING (app_is_org_admin())
  WITH CHECK (app_is_org_admin());

CREATE POLICY client_users_delete ON client_users
  FOR DELETE
  USING (app_is_org_admin());

-- -------------------------------------------------------------------------
-- conversations
-- -------------------------------------------------------------------------
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversations_select ON conversations
  FOR SELECT
  USING (app_can_read_project(project_id));

CREATE POLICY conversations_insert ON conversations
  FOR INSERT
  WITH CHECK (app_can_write_project(project_id));

-- -------------------------------------------------------------------------
-- messages
-- -------------------------------------------------------------------------
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND app_can_read_project(c.project_id)
    )
  );

CREATE POLICY messages_insert ON messages
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM conversations c
      WHERE c.id = messages.conversation_id
        AND (
          (messages.sender_type::text = 'team' AND app_can_write_project(c.project_id))
          OR
          (messages.sender_type::text = 'client' AND app_is_project_client(c.project_id))
        )
    )
  );
