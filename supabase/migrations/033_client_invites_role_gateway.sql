-- Client invite tokens for portal onboarding (single-use, expiring)

CREATE TABLE IF NOT EXISTS client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'client_viewer' CHECK (role IN ('client_viewer', 'client_approver')),
  token_hash text NOT NULL UNIQUE,
  invited_by uuid NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz NULL,
  used_by_user_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_invites_client_id ON client_invites(client_id);
CREATE INDEX IF NOT EXISTS idx_client_invites_email ON client_invites(email);
CREATE INDEX IF NOT EXISTS idx_client_invites_expires_at ON client_invites(expires_at);

ALTER TABLE client_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "client_invites_owner_admin_select" ON client_invites;
CREATE POLICY "client_invites_owner_admin_select"
ON client_invites FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM team_members tm
    WHERE tm.user_id = auth.uid()
      AND tm.role IN ('owner', 'admin')
  )
);
