-- ============================================================
-- Migration 041: Fix onboarding loop + resilient onboarding tables
-- ============================================================

CREATE OR REPLACE FUNCTION public.bp_generate_uuid()
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  generated uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'gen_random_uuid'
      AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE 'SELECT gen_random_uuid()' INTO generated;
    RETURN generated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'uuid_generate_v4'
      AND pg_function_is_visible(oid)
  ) THEN
    EXECUTE 'SELECT uuid_generate_v4()' INTO generated;
    RETURN generated;
  END IF;

  RETURN md5(random()::text || clock_timestamp()::text)::uuid;
END;
$$;

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT public.bp_generate_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('app_team', 'app_collab', 'portal_client')),
  current_step integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope)
);

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT public.bp_generate_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('app_team', 'app_collab', 'portal_client')),
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  values_seen jsonb NOT NULL DEFAULT '[]'::jsonb,
  policies_seen jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope)
);

ALTER TABLE public.onboarding_sessions
  ALTER COLUMN id SET DEFAULT public.bp_generate_uuid(),
  ALTER COLUMN current_step SET DEFAULT 1,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.onboarding_progress
  ALTER COLUMN id SET DEFAULT public.bp_generate_uuid(),
  ALTER COLUMN steps SET DEFAULT '{}'::jsonb,
  ALTER COLUMN values_seen SET DEFAULT '[]'::jsonb,
  ALTER COLUMN policies_seen SET DEFAULT '[]'::jsonb,
  ALTER COLUMN checklist SET DEFAULT '{}'::jsonb,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE public.onboarding_sessions
  ADD COLUMN IF NOT EXISTS current_step integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.onboarding_progress
  ADD COLUMN IF NOT EXISTS steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS values_seen jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS policies_seen jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE
  check_name text;
BEGIN
  FOR check_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'onboarding_sessions'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%scope%'
  LOOP
    EXECUTE format('ALTER TABLE public.onboarding_sessions DROP CONSTRAINT IF EXISTS %I', check_name);
  END LOOP;

  FOR check_name IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'onboarding_progress'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%scope%'
  LOOP
    EXECUTE format('ALTER TABLE public.onboarding_progress DROP CONSTRAINT IF EXISTS %I', check_name);
  END LOOP;
END$$;

UPDATE public.onboarding_sessions
SET scope = CASE scope
  WHEN 'team' THEN 'app_team'
  WHEN 'collaborator' THEN 'app_collab'
  WHEN 'client' THEN 'portal_client'
  ELSE scope
END
WHERE scope IN ('team', 'collaborator', 'client');

UPDATE public.onboarding_progress
SET scope = CASE scope
  WHEN 'team' THEN 'app_team'
  WHEN 'collaborator' THEN 'app_collab'
  WHEN 'client' THEN 'portal_client'
  ELSE scope
END
WHERE scope IN ('team', 'collaborator', 'client');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_sessions_scope_check'
      AND conrelid = 'public.onboarding_sessions'::regclass
  ) THEN
    ALTER TABLE public.onboarding_sessions
      ADD CONSTRAINT onboarding_sessions_scope_check
      CHECK (scope IN ('app_team', 'app_collab', 'portal_client'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_progress_scope_check'
      AND conrelid = 'public.onboarding_progress'::regclass
  ) THEN
    ALTER TABLE public.onboarding_progress
      ADD CONSTRAINT onboarding_progress_scope_check
      CHECK (scope IN ('app_team', 'app_collab', 'portal_client'));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_sessions_user_scope_unique'
      AND conrelid = 'public.onboarding_sessions'::regclass
  ) THEN
    ALTER TABLE public.onboarding_sessions
      ADD CONSTRAINT onboarding_sessions_user_scope_unique UNIQUE (user_id, scope);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'onboarding_progress_user_scope_unique'
      AND conrelid = 'public.onboarding_progress'::regclass
  ) THEN
    ALTER TABLE public.onboarding_progress
      ADD CONSTRAINT onboarding_progress_user_scope_unique UNIQUE (user_id, scope);
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_scope
  ON public.onboarding_sessions (user_id, scope);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_scope
  ON public.onboarding_progress (user_id, scope);

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'onboarding_sessions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.onboarding_sessions', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'onboarding_progress'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.onboarding_progress', p.policyname);
  END LOOP;
END$$;

CREATE POLICY onboarding_sessions_owner_select
  ON public.onboarding_sessions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY onboarding_sessions_owner_insert
  ON public.onboarding_sessions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY onboarding_sessions_owner_update
  ON public.onboarding_sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY onboarding_progress_owner_select
  ON public.onboarding_progress
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY onboarding_progress_owner_insert
  ON public.onboarding_progress
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY onboarding_progress_owner_update
  ON public.onboarding_progress
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS onboarding_sessions_updated_at ON public.onboarding_sessions;
    CREATE TRIGGER onboarding_sessions_updated_at
      BEFORE UPDATE ON public.onboarding_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS onboarding_progress_updated_at ON public.onboarding_progress;
    CREATE TRIGGER onboarding_progress_updated_at
      BEFORE UPDATE ON public.onboarding_progress
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at();
  ELSIF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS onboarding_sessions_updated_at ON public.onboarding_sessions;
    CREATE TRIGGER onboarding_sessions_updated_at
      BEFORE UPDATE ON public.onboarding_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS onboarding_progress_updated_at ON public.onboarding_progress;
    CREATE TRIGGER onboarding_progress_updated_at
      BEFORE UPDATE ON public.onboarding_progress
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;
