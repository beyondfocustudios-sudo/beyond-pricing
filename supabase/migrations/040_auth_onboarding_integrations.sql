-- ============================================================
-- Migration 040: Auth onboarding + integrations hub foundation
-- ============================================================

ALTER TABLE IF EXISTS public.org_settings
  ADD COLUMN IF NOT EXISTS force_onboarding boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.onboarding_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('team', 'collaborator', 'client')),
  current_step integer NOT NULL DEFAULT 1,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope)
);

CREATE TABLE IF NOT EXISTS public.onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('team', 'collaborator', 'client')),
  steps jsonb NOT NULL DEFAULT '{}'::jsonb,
  values_seen jsonb NOT NULL DEFAULT '[]'::jsonb,
  policies_seen jsonb NOT NULL DEFAULT '[]'::jsonb,
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, scope)
);

CREATE INDEX IF NOT EXISTS idx_onboarding_sessions_user_scope
  ON public.onboarding_sessions(user_id, scope);

CREATE INDEX IF NOT EXISTS idx_onboarding_progress_user_scope
  ON public.onboarding_progress(user_id, scope);

CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'connected', 'error')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  connected_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE TABLE IF NOT EXISTS public.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  secret_key text NOT NULL,
  secret_value text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(integration_id, secret_key)
);

CREATE TABLE IF NOT EXISTS public.integration_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'success', 'error')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integrations_org_provider
  ON public.integrations(org_id, provider);

CREATE INDEX IF NOT EXISTS idx_integration_runs_integration
  ON public.integration_runs(integration_id, created_at DESC);

ALTER TABLE public.onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'onboarding_sessions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.onboarding_sessions', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'onboarding_progress'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.onboarding_progress', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'integrations'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.integrations', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'integration_secrets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.integration_secrets', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'integration_runs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.integration_runs', p.policyname);
  END LOOP;
END$$;

CREATE POLICY onboarding_sessions_owner_all ON public.onboarding_sessions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY onboarding_sessions_admin_read ON public.onboarding_sessions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY onboarding_progress_owner_all ON public.onboarding_progress
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY onboarding_progress_admin_read ON public.onboarding_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY integrations_owner_admin_all ON public.integrations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND (integrations.org_id IS NULL OR tm.org_id = integrations.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
        AND (integrations.org_id IS NULL OR tm.org_id = integrations.org_id)
    )
  );

CREATE POLICY integration_secrets_owner_admin_all ON public.integration_secrets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.integrations i
      JOIN public.team_members tm
        ON tm.org_id = i.org_id
      WHERE i.id = integration_secrets.integration_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.integrations i
      JOIN public.team_members tm
        ON tm.org_id = i.org_id
      WHERE i.id = integration_secrets.integration_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY integration_runs_owner_admin_all ON public.integration_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.integrations i
      JOIN public.team_members tm
        ON tm.org_id = i.org_id
      WHERE i.id = integration_runs.integration_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.integrations i
      JOIN public.team_members tm
        ON tm.org_id = i.org_id
      WHERE i.id = integration_runs.integration_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

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

    DROP TRIGGER IF EXISTS integrations_updated_at ON public.integrations;
    CREATE TRIGGER integrations_updated_at
      BEFORE UPDATE ON public.integrations
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

    DROP TRIGGER IF EXISTS integrations_updated_at ON public.integrations;
    CREATE TRIGGER integrations_updated_at
      BEFORE UPDATE ON public.integrations
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;
