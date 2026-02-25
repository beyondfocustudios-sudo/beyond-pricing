-- 045_calendar_external_sync.sql
-- External calendar sync foundations (Google/Microsoft 2-way + ICS hardening)

ALTER TABLE public.calendar_integrations
  ADD COLUMN IF NOT EXISTS access_token_enc text,
  ADD COLUMN IF NOT EXISTS refresh_token_enc text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sync_error text,
  ADD COLUMN IF NOT EXISTS last_sync_status text NOT NULL DEFAULT 'idle'
    CHECK (last_sync_status IN ('idle', 'running', 'success', 'error'));

CREATE TABLE IF NOT EXISTS public.external_calendar_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES public.calendar_integrations(id) ON DELETE CASCADE,
  external_calendar_id text NOT NULL,
  label text NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  last_sync_token text,
  last_delta_link text,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_calendar_id)
);

CREATE TABLE IF NOT EXISTS public.external_event_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.calendar_events(id) ON DELETE CASCADE,
  integration_id uuid NOT NULL REFERENCES public.calendar_integrations(id) ON DELETE CASCADE,
  external_event_id text NOT NULL,
  external_calendar_id text,
  etag text,
  source_hash text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (integration_id, external_event_id),
  UNIQUE (integration_id, event_id)
);

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS external_source text
    CHECK (external_source IN ('google', 'microsoft')),
  ADD COLUMN IF NOT EXISTS external_calendar_id text,
  ADD COLUMN IF NOT EXISTS external_event_id text,
  ADD COLUMN IF NOT EXISTS external_etag text;

CREATE INDEX IF NOT EXISTS idx_external_calendar_maps_integration_id
  ON public.external_calendar_maps(integration_id);

CREATE INDEX IF NOT EXISTS idx_external_event_maps_integration_id
  ON public.external_event_maps(integration_id);

CREATE INDEX IF NOT EXISTS idx_external_event_maps_event_id
  ON public.external_event_maps(event_id);

CREATE INDEX IF NOT EXISTS idx_calendar_events_external_source_id
  ON public.calendar_events(external_source, external_event_id)
  WHERE external_source IS NOT NULL AND external_event_id IS NOT NULL;

ALTER TABLE public.external_calendar_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_event_maps ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'calendar_integrations' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.calendar_integrations', p.policyname);
  END LOOP;

  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'external_calendar_maps' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.external_calendar_maps', p.policyname);
  END LOOP;

  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'external_event_maps' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.external_event_maps', p.policyname);
  END LOOP;
END$$;

CREATE POLICY calendar_integrations_own_all
  ON public.calendar_integrations
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY external_calendar_maps_own_all
  ON public.external_calendar_maps
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.calendar_integrations ci
      WHERE ci.id = external_calendar_maps.integration_id
        AND ci.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.calendar_integrations ci
      WHERE ci.id = external_calendar_maps.integration_id
        AND ci.user_id = auth.uid()
    )
  );

CREATE POLICY external_event_maps_own_all
  ON public.external_event_maps
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.calendar_integrations ci
      WHERE ci.id = external_event_maps.integration_id
        AND ci.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.calendar_integrations ci
      WHERE ci.id = external_event_maps.integration_id
        AND ci.user_id = auth.uid()
    )
  );

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS calendar_integrations_updated_at ON public.calendar_integrations;
    CREATE TRIGGER calendar_integrations_updated_at
      BEFORE UPDATE ON public.calendar_integrations
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS external_calendar_maps_updated_at ON public.external_calendar_maps;
    CREATE TRIGGER external_calendar_maps_updated_at
      BEFORE UPDATE ON public.external_calendar_maps
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS external_event_maps_updated_at ON public.external_event_maps;
    CREATE TRIGGER external_event_maps_updated_at
      BEFORE UPDATE ON public.external_event_maps
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at();
  ELSIF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS calendar_integrations_updated_at ON public.calendar_integrations;
    CREATE TRIGGER calendar_integrations_updated_at
      BEFORE UPDATE ON public.calendar_integrations
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS external_calendar_maps_updated_at ON public.external_calendar_maps;
    CREATE TRIGGER external_calendar_maps_updated_at
      BEFORE UPDATE ON public.external_calendar_maps
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS external_event_maps_updated_at ON public.external_event_maps;
    CREATE TRIGGER external_event_maps_updated_at
      BEFORE UPDATE ON public.external_event_maps
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;
