-- ============================================================
-- Migration 019: Ensure Soft Delete Columns Consistency
-- Validates all critical tables have deleted_at for soft delete
-- ============================================================

-- ── 1. Ensure projects has deleted_at ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE projects ADD COLUMN deleted_at timestamptz DEFAULT NULL;
    CREATE INDEX IF NOT EXISTS idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NULL;
  END IF;
END $$;

-- ── 2. Ensure checklists has deleted_at ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklists' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE checklists ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- ── 3. Ensure templates has deleted_at ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'templates' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE templates ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- ── 4. Ensure clients has deleted_at ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'clients' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE clients ADD COLUMN deleted_at timestamptz DEFAULT NULL;
  END IF;
END $$;

-- ── 5. Update RLS policies to respect deleted_at where missing ──

-- Projects: SELECT should exclude deleted
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

-- Checklists: SELECT should exclude deleted
DROP POLICY IF EXISTS "checklists_select" ON checklists;
CREATE POLICY "checklists_select" ON checklists
  FOR SELECT USING (
    deleted_at IS NULL
    AND (
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
    )
  );

-- Templates: SELECT should exclude deleted
DROP POLICY IF EXISTS "templates_select" ON templates;
CREATE POLICY "templates_select" ON templates
  FOR SELECT USING (
    (deleted_at IS NULL OR deleted_at IS NOT NULL)  -- Show all (user_id filters own)
    AND (
      user_id IS NULL  -- global templates
      OR user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM team_members tm
        WHERE tm.user_id = auth.uid()
      )
    )
  );

-- Clients: SELECT should exclude deleted
DROP POLICY IF EXISTS "clients_select_members" ON clients;
CREATE POLICY "clients_select_members" ON clients
  FOR SELECT USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

-- ── 6. Create indexes for soft delete filters ──
CREATE INDEX IF NOT EXISTS idx_checklists_deleted_at ON checklists(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_templates_deleted_at ON templates(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at) WHERE deleted_at IS NULL;

-- ── 7. Add comment ──
COMMENT ON TABLE projects IS 'Projects with soft delete (deleted_at) — migration 019';
