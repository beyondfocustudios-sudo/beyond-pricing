-- 048_portal_deliveries_views_and_paths.sql
-- Hardening for portal deliveries previews + "new" badge state.

ALTER TABLE public.deliverable_files
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS modified_at timestamptz,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

UPDATE public.deliverable_files
SET path = COALESCE(path, dropbox_path)
WHERE path IS NULL AND dropbox_path IS NOT NULL;

UPDATE public.deliverable_files
SET name = COALESCE(name, filename)
WHERE name IS NULL AND filename IS NOT NULL;

UPDATE public.deliverable_files
SET size_bytes = COALESCE(size_bytes, file_size, bytes)
WHERE size_bytes IS NULL;

UPDATE public.deliverable_files
SET modified_at = COALESCE(modified_at, captured_at, created_at)
WHERE modified_at IS NULL;

CREATE TABLE IF NOT EXISTS public.portal_file_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id uuid NOT NULL REFERENCES public.client_users(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_id uuid NOT NULL REFERENCES public.deliverable_files(id) ON DELETE CASCADE,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_user_id, file_id)
);

CREATE INDEX IF NOT EXISTS idx_portal_file_views_project
  ON public.portal_file_views(project_id, last_seen_at DESC);

ALTER TABLE public.portal_file_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "portal_file_views_select_own" ON public.portal_file_views;
CREATE POLICY "portal_file_views_select_own"
  ON public.portal_file_views
  FOR SELECT
  USING (
    client_user_id IN (
      SELECT cu.id
      FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portal_file_views_upsert_own" ON public.portal_file_views;
CREATE POLICY "portal_file_views_upsert_own"
  ON public.portal_file_views
  FOR INSERT
  WITH CHECK (
    client_user_id IN (
      SELECT cu.id
      FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portal_file_views_update_own" ON public.portal_file_views;
CREATE POLICY "portal_file_views_update_own"
  ON public.portal_file_views
  FOR UPDATE
  USING (
    client_user_id IN (
      SELECT cu.id
      FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_user_id IN (
      SELECT cu.id
      FROM public.client_users cu
      WHERE cu.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portal_file_views_admin_all" ON public.portal_file_views;
CREATE POLICY "portal_file_views_admin_all"
  ON public.portal_file_views
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_portal_file_views_updated_at'
  ) THEN
    CREATE TRIGGER trg_portal_file_views_updated_at
      BEFORE UPDATE ON public.portal_file_views
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_deliverable_files_project_path
  ON public.deliverable_files(project_id, path);

