-- 009_portal_enhancements.sql
-- Portal: deliverable_comments, timestamps for video, pins for image

-- Add deleted_at to project_milestones + deliverable_versions
ALTER TABLE project_milestones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE deliverable_versions ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- deliverable_comments: support video timestamps + image pins
ALTER TABLE deliverable_comments ADD COLUMN IF NOT EXISTS video_timestamp_seconds numeric;
ALTER TABLE deliverable_comments ADD COLUMN IF NOT EXISTS image_pin_x numeric;
ALTER TABLE deliverable_comments ADD COLUMN IF NOT EXISTS image_pin_y numeric;
ALTER TABLE deliverable_comments ADD COLUMN IF NOT EXISTS resolved_at timestamptz;
ALTER TABLE deliverable_comments ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users(id);

-- Reactions on comments
CREATE TABLE IF NOT EXISTS comment_reactions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id   uuid NOT NULL REFERENCES deliverable_comments(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  emoji        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(comment_id, user_id, emoji)
);
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comment_reactions_project_members" ON comment_reactions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deliverable_comments dc
      JOIN deliverables d ON d.id = dc.deliverable_id
      JOIN project_members pm ON pm.project_id = d.project_id
      WHERE dc.id = comment_reactions.comment_id AND pm.user_id = auth.uid()
    )
  );

-- Notification preferences per user
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  new_message          boolean NOT NULL DEFAULT true,
  new_deliverable      boolean NOT NULL DEFAULT true,
  approval_requested   boolean NOT NULL DEFAULT true,
  request_created      boolean NOT NULL DEFAULT true,
  milestone_reached    boolean NOT NULL DEFAULT true,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_prefs_own" ON notification_preferences FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- client_requests: add internal notes + assigned_to
ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS internal_notes text;
ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id);
ALTER TABLE client_requests ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Index for fast portal queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deliverables_project ON deliverables(project_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id, deleted_at) WHERE deleted_at IS NULL;
