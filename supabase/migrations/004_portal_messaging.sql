-- ============================================================
-- MIGRATION 004: Portal Messaging + Notifications + Email Outbox
-- ============================================================
-- Run order: after 003_client_portal_rbac.sql
-- ============================================================

-- ── 1. CONVERSATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS conversations_project_idx ON conversations(project_id);
CREATE INDEX IF NOT EXISTS conversations_client_idx  ON conversations(client_id);

-- ── 2. SENDER TYPE ENUM ─────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE sender_type AS ENUM ('client', 'team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 3. MESSAGES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type     sender_type NOT NULL,
  sender_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body            text NOT NULL,
  attachments     jsonb NOT NULL DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_conv_idx        ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS messages_sender_idx      ON messages(sender_user_id);

-- ── 4. MESSAGE READS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  read_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_reads_user_idx ON message_reads(user_id, message_id);

-- ── 5. NOTIFICATION TYPE ENUM ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE notification_type AS ENUM (
    'new_message', 'new_file', 'approval_requested', 'approval_done'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 6. NOTIFICATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        notification_type NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx ON notifications(user_id) WHERE read_at IS NULL;

-- ── 7. EMAIL OUTBOX STATUS ENUM ──────────────────────────────
DO $$ BEGIN
  CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed', 'skipped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 8. EMAIL OUTBOX ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_outbox (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email    text NOT NULL,
  template    text NOT NULL,
  payload     jsonb NOT NULL DEFAULT '{}',
  status      email_status NOT NULL DEFAULT 'pending',
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,
  error       text
);
CREATE INDEX IF NOT EXISTS email_outbox_pending_idx ON email_outbox(status, created_at) WHERE status = 'pending';

-- ── 9. CRM CONTACTS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  email        text,
  phone        text,
  company      text,
  notes        text,
  tags         text[] NOT NULL DEFAULT '{}',
  source       text,
  custom       jsonb NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crm_contacts_owner_idx ON crm_contacts(owner_user_id);
CREATE INDEX IF NOT EXISTS crm_contacts_email_idx ON crm_contacts(email) WHERE email IS NOT NULL;

-- ── 10. JOURNAL ENTRIES ──────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE journal_mood AS ENUM ('great', 'good', 'neutral', 'bad', 'terrible');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS journal_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
  title        text,
  body         text NOT NULL,
  mood         journal_mood,
  tags         text[] NOT NULL DEFAULT '{}',
  ai_summary   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_user_idx ON journal_entries(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS journal_project_idx ON journal_entries(project_id) WHERE project_id IS NOT NULL;

-- ── 11. TASKS ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'cancelled');
  CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tasks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  title         text NOT NULL,
  description   text,
  status        task_status NOT NULL DEFAULT 'todo',
  priority      task_priority NOT NULL DEFAULT 'medium',
  due_date      date,
  tags          text[] NOT NULL DEFAULT '{}',
  position      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tasks_user_idx    ON tasks(user_id, status, position);
CREATE INDEX IF NOT EXISTS tasks_project_idx ON tasks(project_id) WHERE project_id IS NOT NULL;

-- ── 12. LOGISTICS ROUTES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS logistics_routes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  origin        text NOT NULL,
  destination   text NOT NULL,
  waypoints     jsonb NOT NULL DEFAULT '[]',
  distance_km   numeric,
  duration_min  numeric,
  vehicle_type  text,
  notes         text,
  raw_response  jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS logistics_user_idx ON logistics_routes(user_id, created_at DESC);

-- ── 13. WEATHER CACHE ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS weather_cache (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location    text NOT NULL,
  lat         numeric,
  lon         numeric,
  date        date,
  data        jsonb NOT NULL DEFAULT '{}',
  fetched_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location, date)
);
CREATE INDEX IF NOT EXISTS weather_cache_loc_idx ON weather_cache(location, date);

-- ── 14. RLS POLICIES ─────────────────────────────────────────
ALTER TABLE conversations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads    ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_outbox     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE logistics_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE weather_cache    ENABLE ROW LEVEL SECURITY;

-- conversations: team member of project OR client_user of client
CREATE POLICY "conversations_select" ON conversations FOR SELECT USING (
  -- team member
  EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = conversations.project_id
      AND pm.user_id = auth.uid()
      AND pm.role NOT IN ('client_viewer','client_approver')
  )
  OR
  -- client user
  EXISTS (
    SELECT 1 FROM client_users cu
    WHERE cu.client_id = conversations.client_id
      AND cu.user_id = auth.uid()
  )
);

CREATE POLICY "conversations_insert" ON conversations FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM project_members pm
    WHERE pm.project_id = conversations.project_id
      AND pm.user_id = auth.uid()
      AND pm.role NOT IN ('client_viewer','client_approver')
  )
);

-- messages: can read if can read the conversation
CREATE POLICY "messages_select" ON messages FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (
        EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = c.project_id AND pm.user_id = auth.uid() AND pm.role NOT IN ('client_viewer','client_approver'))
        OR EXISTS (SELECT 1 FROM client_users cu WHERE cu.client_id = c.client_id AND cu.user_id = auth.uid())
      )
  )
);

CREATE POLICY "messages_insert" ON messages FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = messages.conversation_id
      AND (
        (
          messages.sender_type = 'team'
          AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = c.project_id AND pm.user_id = auth.uid() AND pm.role NOT IN ('client_viewer','client_approver'))
        )
        OR (
          messages.sender_type = 'client'
          AND EXISTS (SELECT 1 FROM client_users cu WHERE cu.client_id = c.client_id AND cu.user_id = auth.uid())
        )
      )
  )
);

-- message_reads: own only
CREATE POLICY "message_reads_all" ON message_reads FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- notifications: owner only
CREATE POLICY "notifications_select" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "notifications_update" ON notifications FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- email_outbox: service role only (no user-level access)
CREATE POLICY "email_outbox_none" ON email_outbox FOR ALL USING (false);

-- crm_contacts: owner
CREATE POLICY "crm_contacts_all" ON crm_contacts FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

-- journal_entries: owner
CREATE POLICY "journal_entries_all" ON journal_entries FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- tasks: owner
CREATE POLICY "tasks_all" ON tasks FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- logistics_routes: owner
CREATE POLICY "logistics_routes_all" ON logistics_routes FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- weather_cache: any authenticated user can read, service role writes
CREATE POLICY "weather_cache_select" ON weather_cache FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "weather_cache_insert" ON weather_cache FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "weather_cache_update" ON weather_cache FOR UPDATE USING (auth.uid() IS NOT NULL);

-- ── 15. UPDATED_AT TRIGGERS ──────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER crm_contacts_updated_at    BEFORE UPDATE ON crm_contacts    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER journal_entries_updated_at BEFORE UPDATE ON journal_entries FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER tasks_updated_at           BEFORE UPDATE ON tasks           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
