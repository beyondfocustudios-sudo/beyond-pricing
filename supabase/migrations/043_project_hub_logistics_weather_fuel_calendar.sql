-- 043_project_hub_logistics_weather_fuel_calendar.sql
-- Project Hub hardening: statuses, logistics multi-stop, weather shoot days, fuel cache,
-- calendar core/integration tokens, dropbox project folder metadata.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Projects: status v2 + shoot days
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS shoot_days date[] NOT NULL DEFAULT '{}'::date[],
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS status_updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.projects
  ALTER COLUMN project_name SET DEFAULT 'Projeto sem nome';

UPDATE public.projects
SET status = CASE lower(coalesce(status, ''))
  WHEN 'rascunho' THEN 'draft'
  WHEN 'enviado' THEN 'sent'
  WHEN 'aprovado' THEN 'approved'
  WHEN 'cancelado' THEN 'cancelled'
  WHEN 'arquivado' THEN 'archived'
  ELSE lower(coalesce(status, 'draft'))
END
WHERE status IS NOT NULL;

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::regclass
      AND conname = 'projects_status_check_v2'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_status_check_v2
      CHECK (status IN ('draft', 'sent', 'in_review', 'approved', 'cancelled', 'archived'));
  END IF;
END$$;

ALTER TABLE public.projects
  ALTER COLUMN status SET DEFAULT 'draft';

CREATE OR REPLACE FUNCTION public.sync_projects_archive_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.status_updated_at = now();

  IF NEW.status = 'archived' AND NEW.archived_at IS NULL THEN
    NEW.archived_at = now();
  END IF;

  IF NEW.status <> 'archived' THEN
    NEW.archived_at = NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_status_archive_sync ON public.projects;
CREATE TRIGGER trg_projects_status_archive_sync
  BEFORE UPDATE OF status ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_projects_archive_columns();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Logistics routes: multi-stop shape
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.logistics_routes
  ADD COLUMN IF NOT EXISTS base_text text,
  ADD COLUMN IF NOT EXISTS roundtrip boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS km_total numeric,
  ADD COLUMN IF NOT EXISTS duration_total_min integer,
  ADD COLUMN IF NOT EXISTS fuel_cost_estimate numeric,
  ADD COLUMN IF NOT EXISTS fuel_liters numeric,
  ADD COLUMN IF NOT EXISTS fuel_price_per_l numeric,
  ADD COLUMN IF NOT EXISTS cost_per_km_fallback numeric,
  ADD COLUMN IF NOT EXISTS tolls_estimate numeric,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.logistics_routes
SET
  base_text = coalesce(base_text, origin),
  km_total = coalesce(km_total, distance_km),
  duration_total_min = coalesce(duration_total_min, round(duration_min)::integer)
WHERE true;

CREATE OR REPLACE FUNCTION public.touch_logistics_routes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_logistics_routes_updated_at ON public.logistics_routes;
CREATE TRIGGER trg_logistics_routes_updated_at
  BEFORE UPDATE ON public.logistics_routes
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_logistics_routes_updated_at();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'logistics_routes' AND column_name = 'deleted_at'
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_logistics_routes_project_active
      ON public.logistics_routes(project_id)
      WHERE project_id IS NOT NULL AND deleted_at IS NULL;
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS idx_logistics_routes_project_active
      ON public.logistics_routes(project_id)
      WHERE project_id IS NOT NULL;
  END IF;
END$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Weekly fuel cache table (explicit)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fuel_price_cache (
  fuel_type text PRIMARY KEY CHECK (fuel_type IN ('gasolina95', 'gasoleo')),
  price_per_l numeric(8,3) NOT NULL,
  source text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  manual_override boolean NOT NULL DEFAULT false
);

ALTER TABLE public.fuel_price_cache ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fuel_price_cache'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.fuel_price_cache', p.policyname);
  END LOOP;
END$$;

CREATE POLICY fuel_price_cache_select
  ON public.fuel_price_cache
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY fuel_price_cache_write_admin
  ON public.fuel_price_cache
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

INSERT INTO public.fuel_price_cache (fuel_type, price_per_l, source)
VALUES
  ('gasoleo', 1.620, 'fallback'),
  ('gasolina95', 1.770, 'fallback')
ON CONFLICT (fuel_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Dropbox project folder metadata
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.project_dropbox
  ADD COLUMN IF NOT EXISTS folder_id text,
  ADD COLUMN IF NOT EXISTS folder_url text,
  ADD COLUMN IF NOT EXISTS base_path text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Calendar core entities for internal calendar + ICS tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.calendar_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'org', 'project')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_calendars_user_id ON public.calendar_calendars(user_id);

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES public.calendar_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Europe/Lisbon',
  ADD COLUMN IF NOT EXISTS all_day boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'other' CHECK (type IN ('shoot', 'meeting', 'review', 'delivery', 'travel', 'other')),
  ADD COLUMN IF NOT EXISTS meeting_url text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'tentative', 'cancelled')),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS external_provider text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS sync_to_google boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sync_to_outlook boolean NOT NULL DEFAULT false;

UPDATE public.calendar_events
SET created_by = coalesce(created_by, user_id)
WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_calendar_id ON public.calendar_events(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_project_id ON public.calendar_events(project_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_type ON public.calendar_events(type);

CREATE OR REPLACE FUNCTION public.touch_calendar_events_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calendar_events_updated_at ON public.calendar_events;
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_calendar_events_updated_at();

CREATE TABLE IF NOT EXISTS public.calendar_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google', 'microsoft', 'ics')),
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  scopes text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id uuid REFERENCES public.calendar_calendars(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.calendar_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_calendars' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.calendar_calendars', p.policyname);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_integrations' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.calendar_integrations', p.policyname);
  END LOOP;
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_feed_tokens' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.calendar_feed_tokens', p.policyname);
  END LOOP;
END$$;

CREATE POLICY calendar_calendars_own
  ON public.calendar_calendars
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY calendar_integrations_own
  ON public.calendar_integrations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY calendar_feed_tokens_own
  ON public.calendar_feed_tokens
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
