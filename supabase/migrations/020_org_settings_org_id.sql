-- 020_org_settings_org_id.sql
-- Ensure org_settings has org_id for org-scoped settings access

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Beyond Focus', 'beyond-focus')
ON CONFLICT DO NOTHING;

ALTER TABLE org_settings
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id) ON DELETE CASCADE;

UPDATE org_settings
SET org_id = '00000000-0000-0000-0000-000000000001'
WHERE org_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_settings_org_id ON org_settings(org_id);
