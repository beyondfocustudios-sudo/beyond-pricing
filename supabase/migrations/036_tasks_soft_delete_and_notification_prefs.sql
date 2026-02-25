-- ============================================================
-- Migration 036: tasks soft-delete + user notification prefs
-- ============================================================

ALTER TABLE IF EXISTS public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tasks_user_deleted
  ON public.tasks(user_id, deleted_at, created_at DESC);

ALTER TABLE IF EXISTS public.user_preferences
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"in_app": true, "email": true, "new_comments": true, "new_versions": true, "approvals": true}'::jsonb;
