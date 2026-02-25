-- 035_plugins_cache_hardening.sql
-- Harden plugin cache and diagnostics tables for weather/fuel/route/ics

CREATE TABLE IF NOT EXISTS fuel_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country text NOT NULL DEFAULT 'PT',
  fuel_type text NOT NULL CHECK (fuel_type IN ('diesel', 'gasoline')),
  price_per_liter numeric(8,3) NOT NULL,
  source text NOT NULL DEFAULT 'fallback',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (country, fuel_type)
);

CREATE TABLE IF NOT EXISTS route_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_key text NOT NULL,
  destination_key text NOT NULL,
  travel_km numeric(8,2) NOT NULL,
  travel_minutes integer NOT NULL,
  source text NOT NULL DEFAULT 'osrm',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (origin_key, destination_key)
);

CREATE TABLE IF NOT EXISTS plugin_status (
  plugin_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  ttl_minutes integer,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plugin_runs (
  id bigserial PRIMARY KEY,
  plugin_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'error')),
  cache_hit boolean NOT NULL DEFAULT false,
  error text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fuel_cache_expires ON fuel_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_route_cache_expires ON route_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_plugin_runs_key_created ON plugin_runs(plugin_key, created_at DESC);

ALTER TABLE fuel_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_runs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  p text;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'fuel_cache' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON fuel_cache', p);
  END LOOP;

  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'route_cache' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON route_cache', p);
  END LOOP;

  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plugin_status' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON plugin_status', p);
  END LOOP;

  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'plugin_runs' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON plugin_runs', p);
  END LOOP;
END
$$;

CREATE POLICY fuel_cache_select ON fuel_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY fuel_cache_write ON fuel_cache
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY route_cache_select ON route_cache
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY route_cache_write ON route_cache
  FOR ALL USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY plugin_status_select ON plugin_status
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY plugin_status_write ON plugin_status
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role::text IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role::text IN ('owner', 'admin')
    )
  );

CREATE POLICY plugin_runs_select ON plugin_runs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY plugin_runs_write ON plugin_runs
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role::text IN ('owner', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role::text IN ('owner', 'admin')
    )
  );
