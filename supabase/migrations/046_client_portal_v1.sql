-- 046_client_portal_v1.sql
-- Client Portal V1 support: client soft-delete + portal impersonation tokens

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at
  ON public.clients(deleted_at)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.portal_impersonation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_impersonation_tokens_admin
  ON public.portal_impersonation_tokens(admin_user_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_portal_impersonation_tokens_client
  ON public.portal_impersonation_tokens(client_id, expires_at DESC);

ALTER TABLE public.portal_impersonation_tokens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_impersonation_tokens'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.portal_impersonation_tokens', p.policyname);
  END LOOP;
END$$;

CREATE POLICY portal_impersonation_tokens_admin_read
  ON public.portal_impersonation_tokens
  FOR SELECT
  USING (
    admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY portal_impersonation_tokens_admin_insert
  ON public.portal_impersonation_tokens
  FOR INSERT
  WITH CHECK (
    admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY portal_impersonation_tokens_admin_update
  ON public.portal_impersonation_tokens
  FOR UPDATE
  USING (
    admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    admin_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );
