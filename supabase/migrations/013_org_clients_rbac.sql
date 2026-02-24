-- 013_org_clients_rbac.sql
-- Fix clients RLS: org-level access via team_members
-- Bootstrap org owner from OWNER_EMAIL env

-- ── Ensure team_members has correct structure ─────────────────────────────
-- (already created in 005, just ensuring)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'team_members') THEN
    CREATE TABLE team_members (
      id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
      role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
      invited_by uuid REFERENCES auth.users(id),
      invited_at timestamptz DEFAULT now(),
      accepted_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- Drop old policies if any
DROP POLICY IF EXISTS "team_members_all" ON team_members;
DROP POLICY IF EXISTS "team_members_read" ON team_members;
DROP POLICY IF EXISTS "team_members_write" ON team_members;

-- Team members: owners/admins can manage; members can read own row
CREATE POLICY "team_members_read" ON team_members FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm2
      WHERE tm2.user_id = auth.uid() AND tm2.role IN ('owner','admin')
    )
  );

CREATE POLICY "team_members_write" ON team_members FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm2
    WHERE tm2.user_id = auth.uid() AND tm2.role IN ('owner','admin')
  )
);

CREATE POLICY "team_members_update" ON team_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm2
      WHERE tm2.user_id = auth.uid() AND tm2.role IN ('owner','admin')
    )
  );

-- ── Fix clients RLS: org owner/admin can CRUD ─────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select" ON clients;
DROP POLICY IF EXISTS "clients_insert" ON clients;
DROP POLICY IF EXISTS "clients_update" ON clients;
DROP POLICY IF EXISTS "clients_delete" ON clients;

CREATE POLICY "clients_select" ON clients FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "clients_insert" ON clients FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.role IN ('owner','admin')
  )
);

CREATE POLICY "clients_update" ON clients FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner','admin')
    )
  );

CREATE POLICY "clients_delete" ON clients FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner','admin')
    )
  );

-- ── Fix client_users RLS ──────────────────────────────────────────────────
ALTER TABLE client_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_users_select" ON client_users;
DROP POLICY IF EXISTS "client_users_insert" ON client_users;
DROP POLICY IF EXISTS "client_users_delete" ON client_users;

CREATE POLICY "client_users_select" ON client_users FOR SELECT
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm WHERE tm.user_id = auth.uid()
    )
  );

CREATE POLICY "client_users_insert" ON client_users FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM team_members tm
    WHERE tm.user_id = auth.uid() AND tm.role IN ('owner','admin')
  )
);

CREATE POLICY "client_users_delete" ON client_users FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner','admin')
    )
  );

-- ── Helper function: is_team_member_role ──────────────────────────────────
CREATE OR REPLACE FUNCTION is_team_member_role(roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE user_id = auth.uid() AND role = ANY(roles)
  )
$$;

-- ── Bootstrap: auto-grant owner to OWNER_EMAIL user ──────────────────────
-- This runs at migration time; also called via /api/admin/bootstrap
DO $$
DECLARE
  v_owner_id uuid;
BEGIN
  -- Try to find user by email if they exist
  SELECT id INTO v_owner_id
  FROM auth.users
  WHERE email = current_setting('app.owner_email', true)
  LIMIT 1;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO team_members (user_id, role)
    VALUES (v_owner_id, 'owner')
    ON CONFLICT (user_id) DO UPDATE SET role = 'owner';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- Silently skip if setting not configured
  NULL;
END $$;
