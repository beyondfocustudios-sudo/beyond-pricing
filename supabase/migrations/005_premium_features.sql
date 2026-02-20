-- ============================================================
-- MIGRATION 005: Premium Features
-- milestones · deliverable_versions · approvals · approval_comments
-- deliverable_comments · client_requests · call_sheets · budget_versions
-- ============================================================

-- ── 1. PROJECT MILESTONES ────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE milestone_status AS ENUM ('pending','in_progress','done','blocked');
  CREATE TYPE production_phase AS ENUM ('pre_producao','rodagem','pos_producao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS project_milestones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase          production_phase NOT NULL DEFAULT 'pre_producao',
  title          text NOT NULL,
  due_date       date,
  status         milestone_status NOT NULL DEFAULT 'pending',
  position       int NOT NULL DEFAULT 0,
  completed_at   timestamptz,
  assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_milestones_project_idx ON project_milestones(project_id, phase, position);

-- ── 2. DELIVERABLE VERSIONS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS deliverable_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id  uuid NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  version         int NOT NULL DEFAULT 1,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deliverable_id, version)
);
CREATE INDEX IF NOT EXISTS deliverable_versions_del_idx ON deliverable_versions(deliverable_id, version);

-- ── 3. APPROVALS ─────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE approval_decision AS ENUM ('approved','rejected','changes_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS approvals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id        uuid NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  deliverable_version_id uuid REFERENCES deliverable_versions(id) ON DELETE SET NULL,
  decision              approval_decision NOT NULL,
  approver_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  comment               text,
  created_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_deliverable_idx ON approvals(deliverable_id, created_at DESC);

-- ── 4. DELIVERABLE COMMENTS (timestamp/pin) ──────────────────
DO $$ BEGIN
  CREATE TYPE comment_type AS ENUM ('video','image','general');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS deliverable_comments (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_file_id uuid REFERENCES deliverable_files(id) ON DELETE CASCADE,
  deliverable_id      uuid REFERENCES deliverables(id) ON DELETE CASCADE,
  author_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type                comment_type NOT NULL DEFAULT 'general',
  body                text NOT NULL,
  timestamp_sec       numeric,   -- for video: seconds
  pin_x               numeric,   -- for image: 0-100 %
  pin_y               numeric,
  resolved            boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS del_comments_file_idx ON deliverable_comments(deliverable_file_id);
CREATE INDEX IF NOT EXISTS del_comments_del_idx  ON deliverable_comments(deliverable_id);

-- ── 5. CLIENT REQUESTS ───────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE request_type AS ENUM ('revision','new_deliverable','question','other');
  CREATE TYPE request_status AS ENUM ('open','in_progress','resolved','closed');
  CREATE TYPE request_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS client_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id       uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  requester_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  type            request_type NOT NULL DEFAULT 'question',
  priority        request_priority NOT NULL DEFAULT 'medium',
  status          request_status NOT NULL DEFAULT 'open',
  title           text NOT NULL,
  body            text,
  deadline        date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_requests_project_idx ON client_requests(project_id, status);
CREATE INDEX IF NOT EXISTS client_requests_client_idx  ON client_requests(client_id);

-- ── 6. CALL SHEETS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_sheets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  shoot_date      date NOT NULL,
  title           text NOT NULL,
  location        text,
  general_call    time,
  notes           text,
  weather_snapshot jsonb,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS call_sheets_project_idx ON call_sheets(project_id, shoot_date);

CREATE TABLE IF NOT EXISTS call_sheet_people (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sheet_id uuid NOT NULL REFERENCES call_sheets(id) ON DELETE CASCADE,
  name          text NOT NULL,
  role          text,
  call_time     time,
  phone         text,
  position      int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS call_sheet_schedule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_sheet_id uuid NOT NULL REFERENCES call_sheets(id) ON DELETE CASCADE,
  time_start    time,
  time_end      time,
  description   text NOT NULL,
  location      text,
  position      int NOT NULL DEFAULT 0
);

-- ── 7. BUDGET VERSIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS budget_versions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version     int NOT NULL DEFAULT 1,
  label       text,
  inputs      jsonb NOT NULL DEFAULT '{}',
  calc        jsonb NOT NULL DEFAULT '{}',
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE INDEX IF NOT EXISTS budget_versions_project_idx ON budget_versions(project_id, version DESC);

-- ── 8. GLOBAL TEAM ROLES (for admin bootstrap) ───────────────
DO $$ BEGIN
  CREATE TYPE team_role AS ENUM ('owner','admin','member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS team_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  role        team_role NOT NULL DEFAULT 'member',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 9. RLS ───────────────────────────────────────────────────
ALTER TABLE project_milestones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals             ENABLE ROW LEVEL SECURITY;
ALTER TABLE deliverable_comments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_requests       ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sheets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sheet_people     ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_sheet_schedule   ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_versions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members          ENABLE ROW LEVEL SECURITY;

-- Helper function: is user an internal project member?
CREATE OR REPLACE FUNCTION is_internal_project_member(proj_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = proj_id
      AND user_id = auth.uid()
      AND role IN ('owner','admin','editor')
  );
$$;

-- Helper function: is user a client of this project?
CREATE OR REPLACE FUNCTION is_client_of_project(proj_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM client_users cu
    JOIN projects p ON p.client_id = cu.client_id
    WHERE p.id = proj_id AND cu.user_id = auth.uid()
  );
$$;

-- Helper: is user a global team member?
CREATE OR REPLACE FUNCTION is_team_member()
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM team_members WHERE user_id = auth.uid());
$$;

-- project_milestones: internal members can CRUD; clients can read
CREATE POLICY "milestones_internal_all" ON project_milestones FOR ALL
  USING (is_internal_project_member(project_id))
  WITH CHECK (is_internal_project_member(project_id));
CREATE POLICY "milestones_client_select" ON project_milestones FOR SELECT
  USING (is_client_of_project(project_id));

-- deliverable_versions: internal CRUD; client read
CREATE POLICY "del_versions_internal_all" ON deliverable_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM deliverables d WHERE d.id = deliverable_versions.deliverable_id AND is_internal_project_member(d.project_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM deliverables d WHERE d.id = deliverable_versions.deliverable_id AND is_internal_project_member(d.project_id)));
CREATE POLICY "del_versions_client_select" ON deliverable_versions FOR SELECT
  USING (EXISTS (SELECT 1 FROM deliverables d WHERE d.id = deliverable_versions.deliverable_id AND is_client_of_project(d.project_id)));

-- approvals: clients can insert (approve/reject); internal can read
CREATE POLICY "approvals_client_insert" ON approvals FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM deliverables d WHERE d.id = approvals.deliverable_id AND is_client_of_project(d.project_id)));
CREATE POLICY "approvals_all_select" ON approvals FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM deliverables d WHERE d.id = approvals.deliverable_id
      AND (is_internal_project_member(d.project_id) OR is_client_of_project(d.project_id)))
  );

-- deliverable_comments: both sides can read/insert
CREATE POLICY "del_comments_select" ON deliverable_comments FOR SELECT
  USING (
    (deliverable_id IS NOT NULL AND (is_internal_project_member(deliverable_id) OR is_client_of_project(deliverable_id)))
    OR (deliverable_file_id IS NOT NULL)
  );
CREATE POLICY "del_comments_insert" ON deliverable_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "del_comments_update" ON deliverable_comments FOR UPDATE
  USING (author_user_id = auth.uid()) WITH CHECK (author_user_id = auth.uid());

-- client_requests: clients can CRUD own; internal can read/update all
CREATE POLICY "client_requests_client_all" ON client_requests FOR ALL
  USING (requester_user_id = auth.uid() OR is_client_of_project(project_id))
  WITH CHECK (is_client_of_project(project_id));
CREATE POLICY "client_requests_internal_all" ON client_requests FOR ALL
  USING (is_internal_project_member(project_id))
  WITH CHECK (is_internal_project_member(project_id));

-- call_sheets: internal CRUD; clients read
CREATE POLICY "call_sheets_internal_all" ON call_sheets FOR ALL
  USING (is_internal_project_member(project_id))
  WITH CHECK (is_internal_project_member(project_id));
CREATE POLICY "call_sheets_client_select" ON call_sheets FOR SELECT
  USING (is_client_of_project(project_id));
CREATE POLICY "call_sheet_people_all" ON call_sheet_people FOR ALL USING (
  EXISTS (SELECT 1 FROM call_sheets cs WHERE cs.id = call_sheet_people.call_sheet_id AND (is_internal_project_member(cs.project_id) OR is_client_of_project(cs.project_id)))
);
CREATE POLICY "call_sheet_schedule_all" ON call_sheet_schedule FOR ALL USING (
  EXISTS (SELECT 1 FROM call_sheets cs WHERE cs.id = call_sheet_schedule.call_sheet_id AND (is_internal_project_member(cs.project_id) OR is_client_of_project(cs.project_id)))
);

-- budget_versions: internal only
CREATE POLICY "budget_versions_internal_all" ON budget_versions FOR ALL
  USING (is_internal_project_member(project_id))
  WITH CHECK (is_internal_project_member(project_id));

-- team_members: read by anyone authenticated; write by service_role only
CREATE POLICY "team_members_select" ON team_members FOR SELECT USING (auth.uid() IS NOT NULL);

-- ── 10. UPDATED_AT TRIGGERS ──────────────────────────────────
CREATE TRIGGER project_milestones_updated_at BEFORE UPDATE ON project_milestones FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER client_requests_updated_at    BEFORE UPDATE ON client_requests    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER call_sheets_updated_at        BEFORE UPDATE ON call_sheets        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
