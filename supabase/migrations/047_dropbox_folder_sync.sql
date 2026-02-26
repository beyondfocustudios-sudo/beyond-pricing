-- 047_dropbox_folder_sync.sql
-- Dropbox folder structure sync (org root + client/project paths + archive metadata)

ALTER TABLE IF EXISTS public.org_settings
  ADD COLUMN IF NOT EXISTS dropbox_root_path text;

UPDATE public.org_settings
SET dropbox_root_path = '/Clientes'
WHERE dropbox_root_path IS NULL
   OR btrim(dropbox_root_path) = '';

ALTER TABLE IF EXISTS public.clients
  ADD COLUMN IF NOT EXISTS dropbox_folder_path text;

ALTER TABLE IF EXISTS public.project_dropbox
  ADD COLUMN IF NOT EXISTS folder_path text,
  ADD COLUMN IF NOT EXISTS deliveries_path text,
  ADD COLUMN IF NOT EXISTS deliveries_url text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.project_dropbox
SET folder_path = COALESCE(folder_path, root_path)
WHERE folder_path IS NULL
  AND root_path IS NOT NULL;

UPDATE public.project_dropbox
SET root_path = COALESCE(root_path, folder_path)
WHERE root_path IS NULL
  AND folder_path IS NOT NULL;

UPDATE public.project_dropbox
SET deliveries_path = CONCAT(
  regexp_replace(COALESCE(folder_path, root_path), '/+$', ''),
  '/01_Entregas'
)
WHERE deliveries_path IS NULL
  AND COALESCE(folder_path, root_path) IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clients_dropbox_folder_path
  ON public.clients(dropbox_folder_path)
  WHERE dropbox_folder_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_dropbox_folder_path
  ON public.project_dropbox(folder_path)
  WHERE folder_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_dropbox_deliveries_path
  ON public.project_dropbox(deliveries_path)
  WHERE deliveries_path IS NOT NULL;
