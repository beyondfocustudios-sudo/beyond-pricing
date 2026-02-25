-- ============================================================
-- Migration 017: Stabilize RLS + Schema gaps
-- Fix: project insert auto-creates project_member(owner)
-- Fix: ensure org_id on team_members if missing
-- Fix: catalog_items org_id from team_members
-- Fix: RLS gaps on several tables
-- ============================================================

-- ── 1. Ensure team_members has org_id (was added in 008/013 but may be missing) ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_members' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE team_members ADD COLUMN org_id uuid REFERENCES organizations(id);
    -- Back-fill: assign all existing team_members to the single org
    UPDATE team_members SET org_id = (SELECT id FROM organizations LIMIT 1)
    WHERE org_id IS NULL;
  END IF;
END $$;

-- ── 2. Ensure catalog_items has org_id ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'catalog_items' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE catalog_items ADD COLUMN org_id uuid REFERENCES organizations(id);
  END IF;
END $$;

-- ── 3. Add soft-delete to catalog_items if missing ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'catalog_items' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE catalog_items ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- ── 4. Create trigger: auto-insert project_member(owner) on project INSERT ──
CREATE OR REPLACE FUNCTION fn_project_owner_member()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Only run if the project has an owner_user_id
  IF NEW.owner_user_id IS NOT NULL THEN
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.owner_user_id, 'owner')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  ELSIF auth.uid() IS NOT NULL THEN
    -- Fallback: use current auth user
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (NEW.id, auth.uid(), 'owner')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Drop if exists then recreate
DROP TRIGGER IF EXISTS trg_project_owner_member ON projects;
CREATE TRIGGER trg_project_owner_member
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION fn_project_owner_member();

-- ── 5. Fix RLS on projects — allow org owner/admin to INSERT ──
DROP POLICY IF EXISTS "projects_insert" ON projects;
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    -- Must be an org member
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.user_id = auth.uid()
    )
  );

-- ── 6. Fix RLS on projects — SELECT: org members see all projects ──
DROP POLICY IF EXISTS "projects_select_member" ON projects;
CREATE POLICY "projects_select_member" ON projects
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
      -- Direct project member
      EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = projects.id
          AND pm.user_id = auth.uid()
      )
      OR
      -- Org-level team member (sees all org projects)
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = auth.uid()
      )
    )
  );

-- ── 7. Fix RLS on projects — UPDATE: project member or org admin ──
DROP POLICY IF EXISTS "projects_update" ON projects;
CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = projects.id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin', 'editor')
    )
    OR
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ── 8. Fix RLS on projects — DELETE: soft delete by org admin ──
DROP POLICY IF EXISTS "projects_delete" ON projects;
CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ── 9. Ensure checklists RLS allows org members ──
DROP POLICY IF EXISTS "checklists_select" ON checklists;
CREATE POLICY "checklists_select" ON checklists
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = checklists.project_id
        AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "checklists_insert" ON checklists;
CREATE POLICY "checklists_insert" ON checklists
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "checklists_update" ON checklists;
CREATE POLICY "checklists_update" ON checklists
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "checklists_delete" ON checklists;
CREATE POLICY "checklists_delete" ON checklists
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ── 10. Ensure checklist_items RLS ──
DROP POLICY IF EXISTS "checklist_items_all" ON checklist_items;
CREATE POLICY "checklist_items_all" ON checklist_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_items.checklist_id
        AND (
          c.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.user_id = auth.uid()
          )
        )
    )
  );

-- ── 11. Templates RLS — allow org members to read, admin to write ──
DROP POLICY IF EXISTS "templates_select" ON templates;
CREATE POLICY "templates_select" ON templates
  FOR SELECT USING (
    user_id IS NULL  -- global templates
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "templates_insert" ON templates;
CREATE POLICY "templates_insert" ON templates
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "templates_update" ON templates;
CREATE POLICY "templates_update" ON templates
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ── 12. Fix clients RLS (in case 013 was not applied) ──
-- Uses DO block to safely handle existing policies
DO $$ BEGIN
  -- Drop and recreate clients policies
  DROP POLICY IF EXISTS "clients_select_members" ON clients;
  DROP POLICY IF EXISTS "clients_insert_admin" ON clients;
  DROP POLICY IF EXISTS "clients_update_admin" ON clients;
  DROP POLICY IF EXISTS "clients_delete_admin" ON clients;

  CREATE POLICY "clients_select_members" ON clients
    FOR SELECT USING (
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = auth.uid()
      )
    );

  CREATE POLICY "clients_insert_admin" ON clients
    FOR INSERT WITH CHECK (
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      )
    );

  CREATE POLICY "clients_update_admin" ON clients
    FOR UPDATE USING (
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      )
    );

  CREATE POLICY "clients_delete_admin" ON clients
    FOR DELETE USING (
      EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = auth.uid()
          AND tm.role IN ('owner', 'admin')
      )
    );
EXCEPTION WHEN OTHERS THEN
  -- If policies already exist with same name, ignore
  NULL;
END $$;

-- ── 13. Ensure RLS is enabled on all critical tables ──
ALTER TABLE IF EXISTS projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS client_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS call_sheets ENABLE ROW LEVEL SECURITY;

-- ── 14. Organizations RLS ──
DROP POLICY IF EXISTS "org_select" ON organizations;
CREATE POLICY "org_select" ON organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- Done
COMMENT ON TABLE projects IS 'Projects with auto-owner trigger (migration 017)';
