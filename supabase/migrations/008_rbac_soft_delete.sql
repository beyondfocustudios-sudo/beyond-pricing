-- 008_rbac_soft_delete.sql
-- RBAC hardening + soft delete support

-- ── Org (single-tenant "Beyond Focus") ────────────────────────────────────
CREATE TABLE IF NOT EXISTS organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL DEFAULT 'Beyond Focus',
  slug        text UNIQUE NOT NULL DEFAULT 'beyond-focus',
  created_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO organizations (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Beyond Focus', 'beyond-focus')
ON CONFLICT DO NOTHING;

-- ── Soft-delete columns ────────────────────────────────────────────────────
ALTER TABLE projects  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE clients   ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE tasks     ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- ── team_members ensure columns ─────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_members' AND column_name='invited_by') THEN
    ALTER TABLE team_members ADD COLUMN invited_by uuid REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_members' AND column_name='invited_at') THEN
    ALTER TABLE team_members ADD COLUMN invited_at timestamptz DEFAULT now();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='team_members' AND column_name='accepted_at') THEN
    ALTER TABLE team_members ADD COLUMN accepted_at timestamptz;
  END IF;
END $$;

-- ── Audit log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text NOT NULL,
  table_name  text,
  record_id   uuid,
  old_data    jsonb,
  new_data    jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log_admin_only" ON audit_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner','admin')
    )
  );

-- ── Soft-delete aware RLS views ───────────────────────────────────────────
-- projects: exclude deleted rows for non-admins
DROP POLICY IF EXISTS "project_members_select_projects" ON projects;
CREATE POLICY "project_members_select_projects" ON projects FOR SELECT
  USING (
    deleted_at IS NULL AND (
      auth.uid() = user_id
      OR EXISTS (
        SELECT 1 FROM project_members pm
        WHERE pm.project_id = id AND pm.user_id = auth.uid()
      )
    )
  );

-- ── Helper: log_audit() trigger function ──────────────────────────────────
CREATE OR REPLACE FUNCTION log_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- ── Audit triggers for critical tables ────────────────────────────────────
DROP TRIGGER IF EXISTS audit_projects ON projects;
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION log_audit();

DROP TRIGGER IF EXISTS audit_clients ON clients;
CREATE TRIGGER audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_audit();

DROP TRIGGER IF EXISTS audit_approvals ON approvals;
CREATE TRIGGER audit_approvals
  AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION log_audit();

-- ── RBAC: requireOrgRole helper (SQL) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION is_org_role(roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND role = ANY(roles)
  );
$$;

-- ── Owner bootstrap: ensure env OWNER_EMAIL gets owner role ───────────────
-- This is a no-op if already done; real bootstrap via API on first login
