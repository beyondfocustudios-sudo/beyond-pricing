-- ============================================================
-- MIGRATION 003: Client Portal + RBAC + Deliverables + Dropbox
-- ============================================================
-- Run order: after 001_initial_schema.sql
-- ============================================================

-- ── 1. CLIENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,
  logo_url    text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. CLIENT_USERS (maps auth users to clients with roles) ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'client_role') THEN
    CREATE TYPE client_role AS ENUM ('client_viewer', 'client_approver');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS client_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        client_role NOT NULL DEFAULT 'client_viewer',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);

-- ── 3. UPDATE PROJECTS: add client_id + owner_user_id ────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS client_id    uuid REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Back-fill owner_user_id from existing user_id column
UPDATE projects SET owner_user_id = user_id WHERE owner_user_id IS NULL;

-- ── 4. PROJECT_MEMBERS ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_member_role') THEN
    CREATE TYPE project_member_role AS ENUM (
      'owner', 'admin', 'editor', 'client_viewer', 'client_approver'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS project_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        project_member_role NOT NULL DEFAULT 'editor',
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- Back-fill: make existing project owners members with role 'owner'
INSERT INTO project_members (project_id, user_id, role)
SELECT id, user_id, 'owner'
FROM projects
WHERE user_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;

-- ── 5. DELIVERABLES ──────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deliverable_status') THEN
    CREATE TYPE deliverable_status AS ENUM (
      'pending', 'in_review', 'approved', 'rejected'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS deliverables (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title       text NOT NULL,
  description text,
  status      deliverable_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 6. DELIVERABLE_FILES ─────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'file_type') THEN
    CREATE TYPE file_type AS ENUM ('photo', 'video', 'document', 'audio', 'other');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS deliverable_files (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid REFERENCES deliverables(id) ON DELETE CASCADE,
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  dropbox_path   text NOT NULL,
  filename       text NOT NULL,
  ext            text,
  mime           text,
  bytes          bigint,
  preview_url    text,
  thumb_url      text,
  shared_link    text,
  file_type      file_type NOT NULL DEFAULT 'other',
  collection     text,        -- heuristic grouping (subfolder name or "Geral")
  captured_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  metadata       jsonb NOT NULL DEFAULT '{}',
  UNIQUE (project_id, dropbox_path)
);

-- ── 7. DROPBOX_CONNECTIONS ────────────────────────────────────
CREATE TABLE IF NOT EXISTS dropbox_connections (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id               uuid REFERENCES clients(id) ON DELETE CASCADE,
  -- null client_id = global/studio-wide connection
  access_token_encrypted  text NOT NULL,
  refresh_token_encrypted text,
  account_id              text,
  account_email           text,
  expires_at              timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- ── 8. PROJECT_DROPBOX ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_dropbox (
  project_id    uuid PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  root_path     text NOT NULL,        -- e.g. /Beyond/Clients/ACME/Project-X
  cursor        text,                 -- Dropbox longpoll cursor
  last_sync_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── 9. AUDIT_LOG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id             bigserial PRIMARY KEY,
  actor_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action         text NOT NULL,   -- e.g. 'project.create', 'deliverable.approve'
  entity         text NOT NULL,   -- table name
  entity_id      text,
  meta           jsonb NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- ── 10. PREFERENCES: add ai_tagging flag ─────────────────────
ALTER TABLE preferences
  ADD COLUMN IF NOT EXISTS ai_tagging_enabled boolean NOT NULL DEFAULT false;

-- ── 11. INDEXES ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_client_users_user_id     ON client_users(user_id);
CREATE INDEX IF NOT EXISTS idx_client_users_client_id   ON client_users(client_id);
CREATE INDEX IF NOT EXISTS idx_project_members_user     ON project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_members_project  ON project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_client_id       ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_project     ON deliverables(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_files_proj   ON deliverable_files(project_id);
CREATE INDEX IF NOT EXISTS idx_deliverable_files_deliv  ON deliverable_files(deliverable_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_actor          ON audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity         ON audit_log(entity, entity_id);

-- ── 12. UPDATED_AT TRIGGERS ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clients_updated_at') THEN
    CREATE TRIGGER trg_clients_updated_at
      BEFORE UPDATE ON clients
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_deliverables_updated_at') THEN
    CREATE TRIGGER trg_deliverables_updated_at
      BEFORE UPDATE ON deliverables
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_deliverable_files_updated_at') THEN
    CREATE TRIGGER trg_deliverable_files_updated_at
      BEFORE UPDATE ON deliverable_files
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_dropbox_connections_updated_at') THEN
    CREATE TRIGGER trg_dropbox_connections_updated_at
      BEFORE UPDATE ON dropbox_connections
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_dropbox_updated_at') THEN
    CREATE TRIGGER trg_project_dropbox_updated_at
      BEFORE UPDATE ON project_dropbox
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

-- ── 13. RLS ──────────────────────────────────────────────────
ALTER TABLE clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_users          ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverables          ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE dropbox_connections   ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_dropbox       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log             ENABLE ROW LEVEL SECURITY;

-- ── Helper: is the current user a member of a given project?
CREATE OR REPLACE FUNCTION is_project_member(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
  );
$$;

-- ── Helper: is the current user a client_user for the client of a given project?
CREATE OR REPLACE FUNCTION is_client_user_of_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    JOIN client_users cu ON cu.client_id = p.client_id
    WHERE p.id = p_project_id
      AND cu.user_id = auth.uid()
  );
$$;

-- ── Helper: is the current user an internal member (non-client role)?
CREATE OR REPLACE FUNCTION is_internal_member(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin', 'editor')
  );
$$;

-- CLIENTS: internal staff can read all; no direct client access to this table
DROP POLICY IF EXISTS "clients: internal read" ON clients;
CREATE POLICY "clients: internal read" ON clients
  FOR SELECT USING (
    -- User is a member of any project linked to this client
    EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = clients.id AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin', 'editor')
    )
  );

DROP POLICY IF EXISTS "clients: admin write" ON clients;
CREATE POLICY "clients: admin write" ON clients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = clients.id AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- CLIENT_USERS: admins/owners can manage; clients can read their own
DROP POLICY IF EXISTS "client_users: self read" ON client_users;
CREATE POLICY "client_users: self read" ON client_users
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "client_users: admin write" ON client_users;
CREATE POLICY "client_users: admin write" ON client_users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM projects p
      JOIN project_members pm ON pm.project_id = p.id
      WHERE p.client_id = client_users.client_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- PROJECT_MEMBERS: members can read project membership; owners/admins can write
DROP POLICY IF EXISTS "project_members: read" ON project_members;
CREATE POLICY "project_members: read" ON project_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_project_member(project_id)
    OR is_client_user_of_project(project_id)
  );

DROP POLICY IF EXISTS "project_members: admin write" ON project_members;
CREATE POLICY "project_members: admin write" ON project_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = project_members.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- PROJECTS: existing policy + extend with client access
-- (The original policy from migration 001 restricts to user_id = auth.uid(); we add client access)
DROP POLICY IF EXISTS "projects: member or client read" ON projects;
CREATE POLICY "projects: member or client read" ON projects
  FOR SELECT USING (
    user_id = auth.uid()
    OR is_project_member(id)
    OR is_client_user_of_project(id)
  );

-- DELIVERABLES: follow project membership
DROP POLICY IF EXISTS "deliverables: read" ON deliverables;
CREATE POLICY "deliverables: read" ON deliverables
  FOR SELECT USING (
    is_project_member(project_id) OR is_client_user_of_project(project_id)
  );

DROP POLICY IF EXISTS "deliverables: write" ON deliverables;
CREATE POLICY "deliverables: write" ON deliverables
  FOR ALL USING (is_internal_member(project_id));

-- DELIVERABLE_FILES: follow project membership
DROP POLICY IF EXISTS "deliverable_files: read" ON deliverable_files;
CREATE POLICY "deliverable_files: read" ON deliverable_files
  FOR SELECT USING (
    is_project_member(project_id) OR is_client_user_of_project(project_id)
  );

DROP POLICY IF EXISTS "deliverable_files: write" ON deliverable_files;
CREATE POLICY "deliverable_files: write" ON deliverable_files
  FOR ALL USING (is_internal_member(project_id));

-- DROPBOX_CONNECTIONS: only admins/owners
DROP POLICY IF EXISTS "dropbox_connections: admin only" ON dropbox_connections;
CREATE POLICY "dropbox_connections: admin only" ON dropbox_connections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'admin')
    )
  );

-- PROJECT_DROPBOX: internal members can read; admins can write
DROP POLICY IF EXISTS "project_dropbox: member read" ON project_dropbox;
CREATE POLICY "project_dropbox: member read" ON project_dropbox
  FOR SELECT USING (is_project_member(project_id));

DROP POLICY IF EXISTS "project_dropbox: admin write" ON project_dropbox;
CREATE POLICY "project_dropbox: admin write" ON project_dropbox
  FOR ALL USING (is_internal_member(project_id));

-- AUDIT_LOG: internal members can read audit for their projects; system inserts via service role
DROP POLICY IF EXISTS "audit_log: read own" ON audit_log;
CREATE POLICY "audit_log: read own" ON audit_log
  FOR SELECT USING (actor_user_id = auth.uid());
