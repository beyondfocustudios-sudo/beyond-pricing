-- 046_dropbox_demo_mvp.sql
-- Dropbox demo MVP hardening: global org connection + deliverable metadata aliases

ALTER TABLE public.dropbox_connections
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS refresh_token text,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS access_token_enc text,
  ADD COLUMN IF NOT EXISTS refresh_token_enc text,
  ADD COLUMN IF NOT EXISTS dropbox_account_id text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS sync_path text DEFAULT '/',
  ADD COLUMN IF NOT EXISTS cursor text,
  ADD COLUMN IF NOT EXISTS last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Legacy compatibility backfill.
UPDATE public.dropbox_connections
SET access_token_enc = access_token_encrypted
WHERE access_token_enc IS NULL
  AND access_token_encrypted IS NOT NULL;

UPDATE public.dropbox_connections
SET refresh_token_enc = refresh_token_encrypted
WHERE refresh_token_enc IS NULL
  AND refresh_token_encrypted IS NOT NULL;

UPDATE public.dropbox_connections
SET access_token = COALESCE(access_token, access_token_encrypted)
WHERE access_token IS NULL
  AND access_token_encrypted IS NOT NULL;

UPDATE public.dropbox_connections
SET refresh_token = COALESCE(refresh_token, refresh_token_encrypted)
WHERE refresh_token IS NULL
  AND refresh_token_encrypted IS NOT NULL;

UPDATE public.dropbox_connections
SET token_expires_at = expires_at
WHERE token_expires_at IS NULL
  AND expires_at IS NOT NULL;

UPDATE public.dropbox_connections
SET dropbox_account_id = account_id
WHERE dropbox_account_id IS NULL
  AND account_id IS NOT NULL;

ALTER TABLE public.project_dropbox
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.deliverable_files
  ADD COLUMN IF NOT EXISTS provider text DEFAULT 'dropbox',
  ADD COLUMN IF NOT EXISTS provider_id text,
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size bigint,
  ADD COLUMN IF NOT EXISTS download_url text,
  ADD COLUMN IF NOT EXISTS sha text;

UPDATE public.deliverable_files
SET provider = COALESCE(provider, 'dropbox')
WHERE provider IS NULL;

UPDATE public.deliverable_files
SET provider_id = dropbox_id
WHERE provider_id IS NULL
  AND dropbox_id IS NOT NULL;

UPDATE public.deliverable_files
SET path = dropbox_path
WHERE path IS NULL
  AND dropbox_path IS NOT NULL;

UPDATE public.deliverable_files
SET name = filename
WHERE name IS NULL
  AND filename IS NOT NULL;

UPDATE public.deliverable_files
SET size = bytes
WHERE size IS NULL
  AND bytes IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dropbox_connections_org_active
  ON public.dropbox_connections(org_id, updated_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dropbox_connections_project_active
  ON public.dropbox_connections(project_id, updated_at DESC)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_deliverable_files_provider_project
  ON public.deliverable_files(provider, project_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'dropbox_connections'
      AND policyname = 'dropbox_connections_team_admin'
  ) THEN
    CREATE POLICY dropbox_connections_team_admin
      ON public.dropbox_connections
      FOR ALL
      USING (
        EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin')
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1
          FROM public.team_members tm
          WHERE tm.user_id = auth.uid()
            AND tm.role IN ('owner', 'admin')
        )
      );
  END IF;
END
$$;
