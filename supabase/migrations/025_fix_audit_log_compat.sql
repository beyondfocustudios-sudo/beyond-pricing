-- 025_fix_audit_log_compat.sql
-- Fix audit trigger compatibility across audit_log schema variants

ALTER TABLE IF EXISTS audit_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'table_name'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN table_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'record_id'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN record_id uuid;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'old_data'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN old_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'new_data'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN new_data jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN ip_address text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_log' AND column_name = 'user_agent'
  ) THEN
    ALTER TABLE audit_log ADD COLUMN user_agent text;
  END IF;
END$$;

CREATE OR REPLACE FUNCTION log_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_log (user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    auth.uid(),
    TG_OP,
    TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END
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
