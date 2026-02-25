-- 034_review_approvals_wow.sql
-- Review & Approvals WOW (threads, comments, share links, approvals compatibility)

-- ------------------------------------------------------------
-- 1) Compatibility columns for deliverable_versions
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS deliverable_versions
  ADD COLUMN IF NOT EXISTS version_number integer,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS duration numeric,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

UPDATE deliverable_versions
SET version_number = COALESCE(version_number, version, 1)
WHERE version_number IS NULL;

ALTER TABLE IF EXISTS deliverable_versions
  ALTER COLUMN version_number SET DEFAULT 1;

CREATE OR REPLACE FUNCTION fn_sync_deliverable_versions_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.version_number IS NULL THEN
    NEW.version_number := COALESCE(NEW.version, 1);
  END IF;

  IF NEW.version IS NULL THEN
    NEW.version := COALESCE(NEW.version_number, 1);
  END IF;

  IF NEW.uploaded_by IS NULL THEN
    NEW.uploaded_by := NEW.created_by;
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := NEW.uploaded_by;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_deliverable_versions_compat ON deliverable_versions;
CREATE TRIGGER trg_sync_deliverable_versions_compat
  BEFORE INSERT OR UPDATE ON deliverable_versions
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_deliverable_versions_compat();

-- ------------------------------------------------------------
-- 2) Compatibility columns for approvals
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS approvals
  ADD COLUMN IF NOT EXISTS version_id uuid REFERENCES deliverable_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS note text;

UPDATE approvals
SET
  version_id = COALESCE(version_id, deliverable_version_id),
  approved_by = COALESCE(approved_by, approver_user_id),
  approved_at = COALESCE(approved_at, created_at),
  note = COALESCE(note, comment)
WHERE
  version_id IS NULL
  OR approved_by IS NULL
  OR approved_at IS NULL
  OR note IS NULL;

CREATE OR REPLACE FUNCTION fn_sync_approvals_compat()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.version_id := COALESCE(NEW.version_id, NEW.deliverable_version_id);
  NEW.deliverable_version_id := COALESCE(NEW.deliverable_version_id, NEW.version_id);

  NEW.approved_by := COALESCE(NEW.approved_by, NEW.approver_user_id);
  NEW.approver_user_id := COALESCE(NEW.approver_user_id, NEW.approved_by);

  NEW.note := COALESCE(NEW.note, NEW.comment);
  NEW.comment := COALESCE(NEW.comment, NEW.note);

  NEW.approved_at := COALESCE(NEW.approved_at, NEW.created_at, now());
  NEW.created_at := COALESCE(NEW.created_at, NEW.approved_at, now());

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_approvals_compat ON approvals;
CREATE TRIGGER trg_sync_approvals_compat
  BEFORE INSERT OR UPDATE ON approvals
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_approvals_compat();

-- ------------------------------------------------------------
-- 3) Review enums and tables
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'review_thread_status') THEN
    CREATE TYPE review_thread_status AS ENUM ('open', 'resolved');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS review_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES deliverable_versions(id) ON DELETE CASCADE,
  timecode_seconds numeric,
  x numeric,
  y numeric,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status review_thread_status NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS review_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES review_threads(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_name text,
  guest_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS review_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deliverable_id uuid NOT NULL REFERENCES deliverables(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  password_hash text,
  require_auth boolean NOT NULL DEFAULT false,
  single_use boolean NOT NULL DEFAULT false,
  allow_guest_comments boolean NOT NULL DEFAULT true,
  use_count integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  used_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_threads_version ON review_threads(version_id, created_at);
CREATE INDEX IF NOT EXISTS idx_review_comments_thread ON review_comments(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_review_links_deliverable ON review_links(deliverable_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_links_expires ON review_links(expires_at);

-- ------------------------------------------------------------
-- 4) Access helper functions (security definer, no recursive RLS)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION app_review_project_id_from_deliverable(p_deliverable_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT d.project_id
  FROM deliverables d
  WHERE d.id = p_deliverable_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_review_project_id_from_version(p_version_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT d.project_id
  FROM deliverable_versions dv
  JOIN deliverables d ON d.id = dv.deliverable_id
  WHERE dv.id = p_version_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_review_project_id_from_thread(p_thread_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT app_review_project_id_from_version(rt.version_id)
  FROM review_threads rt
  WHERE rt.id = p_thread_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION app_review_can_read_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = p_project_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM team_members tm
            WHERE tm.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM project_members pm
            WHERE pm.project_id = p.id
              AND pm.user_id = auth.uid()
          )
          OR EXISTS (
            SELECT 1
            FROM client_users cu
            WHERE cu.client_id = p.client_id
              AND cu.user_id = auth.uid()
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION app_review_can_write_project(p_project_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM projects p
      WHERE p.id = p_project_id
        AND (
          p.user_id = auth.uid()
          OR p.owner_user_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM team_members tm
            WHERE tm.user_id = auth.uid()
              AND tm.role::text IN ('owner', 'admin')
          )
          OR EXISTS (
            SELECT 1
            FROM project_members pm
            WHERE pm.project_id = p.id
              AND pm.user_id = auth.uid()
              AND pm.role::text IN ('owner', 'admin', 'editor')
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION app_review_can_approve_version(p_version_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH proj AS (
    SELECT app_review_project_id_from_version(p_version_id) AS project_id
  )
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM proj p
      JOIN projects pr ON pr.id = p.project_id
      WHERE
        EXISTS (
          SELECT 1
          FROM team_members tm
          WHERE tm.user_id = auth.uid()
            AND tm.role::text IN ('owner', 'admin')
        )
        OR EXISTS (
          SELECT 1
          FROM project_members pm
          WHERE pm.project_id = pr.id
            AND pm.user_id = auth.uid()
            AND pm.role::text IN ('owner', 'admin', 'client_approver')
        )
        OR pr.owner_user_id = auth.uid()
    );
$$;

-- ------------------------------------------------------------
-- 5) RLS and policies
-- ------------------------------------------------------------
ALTER TABLE review_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_threads' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON review_threads', p);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_comments' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON review_comments', p);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'review_links' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON review_links', p);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'approvals' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON approvals', p);
  END LOOP;
END
$$;

CREATE POLICY review_threads_select ON review_threads
  FOR SELECT
  USING (app_review_can_read_project(app_review_project_id_from_version(version_id)));

CREATE POLICY review_threads_insert ON review_threads
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND app_review_can_read_project(app_review_project_id_from_version(version_id))
  );

CREATE POLICY review_threads_update ON review_threads
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR app_review_can_write_project(app_review_project_id_from_version(version_id))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR app_review_can_write_project(app_review_project_id_from_version(version_id))
  );

CREATE POLICY review_comments_select ON review_comments
  FOR SELECT
  USING (app_review_can_read_project(app_review_project_id_from_thread(thread_id)));

CREATE POLICY review_comments_insert ON review_comments
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND app_review_can_read_project(app_review_project_id_from_thread(thread_id))
  );

CREATE POLICY review_comments_update ON review_comments
  FOR UPDATE
  USING (
    created_by = auth.uid()
    OR app_review_can_write_project(app_review_project_id_from_thread(thread_id))
  )
  WITH CHECK (
    created_by = auth.uid()
    OR app_review_can_write_project(app_review_project_id_from_thread(thread_id))
  );

CREATE POLICY review_links_select ON review_links
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND app_review_can_write_project(app_review_project_id_from_deliverable(deliverable_id))
  );

CREATE POLICY review_links_insert ON review_links
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND app_review_can_write_project(app_review_project_id_from_deliverable(deliverable_id))
  );

CREATE POLICY review_links_update ON review_links
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND app_review_can_write_project(app_review_project_id_from_deliverable(deliverable_id))
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND app_review_can_write_project(app_review_project_id_from_deliverable(deliverable_id))
  );

CREATE POLICY review_links_delete ON review_links
  FOR DELETE
  USING (
    auth.uid() IS NOT NULL
    AND app_review_can_write_project(app_review_project_id_from_deliverable(deliverable_id))
  );

CREATE POLICY approvals_select_review ON approvals
  FOR SELECT
  USING (
    app_review_can_read_project(
      app_review_project_id_from_deliverable(deliverable_id)
    )
  );

CREATE POLICY approvals_insert_review ON approvals
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND app_review_can_approve_version(COALESCE(version_id, deliverable_version_id))
  );

-- ------------------------------------------------------------
-- 6) Audit compatibility (unify common columns used by APIs)
-- ------------------------------------------------------------
ALTER TABLE IF EXISTS audit_log
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

DO $$
DECLARE
  has_actor_user_id boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'actor_user_id'
  );
  has_user_id boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'user_id'
  );
  has_entity boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'entity'
  );
  has_table_name boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'table_name'
  );
  has_meta boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'meta'
  );
  has_new_data boolean := EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'new_data'
  );
  actor_expr text := 'actor_id';
  entity_expr text := 'entity_type';
  payload_expr text := 'payload';
BEGIN
  IF has_actor_user_id THEN actor_expr := actor_expr || ', actor_user_id'; END IF;
  IF has_user_id THEN actor_expr := actor_expr || ', user_id'; END IF;
  IF has_entity THEN entity_expr := entity_expr || ', entity'; END IF;
  IF has_table_name THEN entity_expr := entity_expr || ', table_name'; END IF;
  IF has_meta THEN payload_expr := payload_expr || ', meta'; END IF;
  IF has_new_data THEN payload_expr := payload_expr || ', new_data'; END IF;

  EXECUTE format(
    'UPDATE audit_log SET actor_id = COALESCE(%s), entity_type = COALESCE(%s), payload = COALESCE(%s, ''{}''::jsonb) WHERE actor_id IS NULL OR entity_type IS NULL OR payload IS NULL',
    actor_expr,
    entity_expr,
    payload_expr
  );
END
$$;
