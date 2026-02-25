-- 010_dropbox_sync.sql
-- Enhanced Dropbox sync with cursor support + smart categorization

-- dropbox_connections: add cursor + refresh_token support
ALTER TABLE dropbox_connections ADD COLUMN IF NOT EXISTS access_token text;
ALTER TABLE dropbox_connections ADD COLUMN IF NOT EXISTS refresh_token text;
ALTER TABLE dropbox_connections ADD COLUMN IF NOT EXISTS token_expires_at timestamptz;
ALTER TABLE dropbox_connections ADD COLUMN IF NOT EXISTS cursor text;
ALTER TABLE dropbox_connections ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;
ALTER TABLE dropbox_connections ADD COLUMN IF NOT EXISTS sync_path text DEFAULT '/';

-- deliverable_files: add metadata
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS file_size bigint;
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS dropbox_id text;
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS preview_url text;
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS category text; -- photo/video/doc/final/grade
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS version_label text; -- V1/V2/FINAL/EXPORT
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS folder_phase text; -- pre/shoot/post/final
ALTER TABLE deliverable_files ADD COLUMN IF NOT EXISTS is_deleted boolean DEFAULT false;

-- Index for fast file browsing
CREATE INDEX IF NOT EXISTS idx_deliverable_files_deliverable ON deliverable_files(deliverable_id, is_deleted) WHERE NOT is_deleted;
CREATE INDEX IF NOT EXISTS idx_deliverable_files_category ON deliverable_files(category, folder_phase);

-- project_dropbox: add connection per project
CREATE TABLE IF NOT EXISTS dropbox_sync_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES dropbox_connections(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending', -- pending/success/error
  files_added  int DEFAULT 0,
  files_updated int DEFAULT 0,
  files_deleted int DEFAULT 0,
  error_message text,
  started_at   timestamptz DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE dropbox_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sync_log_team_only" ON dropbox_sync_log FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = dropbox_sync_log.project_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner','admin','editor')
    )
  );
