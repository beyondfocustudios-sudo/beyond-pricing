-- ============================================================
-- MIGRATION 007: Admin Bootstrap — set Daniel as global owner
-- Run via Supabase SQL editor or service_role connection.
-- Safe: uses ON CONFLICT DO UPDATE.
-- ============================================================

-- Insert/update Daniel as global team owner
-- user_id matches: daniellopes@beyondfocus.pt (b008a136-4514-4fd3-8e1e-6547b38c9e2c)
INSERT INTO team_members (user_id, role)
VALUES ('b008a136-4514-4fd3-8e1e-6547b38c9e2c', 'owner')
ON CONFLICT (user_id) DO UPDATE SET role = 'owner';

-- Also make Daniel owner on all existing projects (back-fill)
INSERT INTO project_members (project_id, user_id, role)
SELECT id, 'b008a136-4514-4fd3-8e1e-6547b38c9e2c', 'owner'
FROM projects
ON CONFLICT (project_id, user_id) DO UPDATE SET role = 'owner';

-- Future projects created by Daniel will be auto-owned via the
-- project creation flow (insert into project_members on new project save).
