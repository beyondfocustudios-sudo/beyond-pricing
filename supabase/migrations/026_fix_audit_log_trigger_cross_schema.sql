-- 026_fix_audit_log_trigger_cross_schema.sql
-- Make log_audit compatible with both audit_log schemas used in this project.

ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='actor_user_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='user_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='entity'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN entity text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='entity_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN entity_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='meta'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN meta jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='table_name'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN table_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='record_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN record_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='old_data'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN old_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='audit_log' AND column_name='new_data'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN new_data jsonb;
  END IF;
END$$;

CREATE OR REPLACE FUNCTION log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record_id uuid;
BEGIN
  v_record_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  INSERT INTO audit_log (
    actor_user_id,
    user_id,
    action,
    entity,
    entity_id,
    table_name,
    record_id,
    old_data,
    new_data,
    meta
  ) VALUES (
    auth.uid(),
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    v_record_id::text,
    TG_TABLE_NAME,
    v_record_id,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
    jsonb_build_object('op', TG_OP, 'table', TG_TABLE_NAME)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_projects ON projects;
CREATE TRIGGER audit_projects
  AFTER INSERT OR UPDATE OR DELETE ON projects
  FOR EACH ROW EXECUTE FUNCTION log_audit();

DROP TRIGGER IF EXISTS audit_clients ON clients;
CREATE TRIGGER audit_clients
  AFTER INSERT OR UPDATE OR DELETE ON clients
  FOR EACH ROW EXECUTE FUNCTION log_audit();

DROP TRIGGER IF EXISTS audit_approvals ON approvals;
CREATE TRIGGER audit_approvals
  AFTER INSERT OR UPDATE OR DELETE ON approvals
  FOR EACH ROW EXECUTE FUNCTION log_audit();
