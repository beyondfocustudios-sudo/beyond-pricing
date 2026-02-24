-- 014_project_geo_weather.sql
-- Add geo + weather fields to projects + org_settings

-- ── org_settings: base location (Beyond = Setúbal) ────────────────────────
CREATE TABLE IF NOT EXISTS org_settings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key          text UNIQUE NOT NULL,
  value        jsonb NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE org_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_settings_read" ON org_settings FOR SELECT
  USING (true); -- public read for base coordinates
CREATE POLICY "org_settings_write" ON org_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner','admin')
    )
  );

-- Seed: Beyond Focus base = Setúbal, Portugal
INSERT INTO org_settings (key, value) VALUES
  ('base_location', '{
    "name": "Setúbal, Portugal",
    "lat": 38.5243,
    "lng": -8.8926,
    "city": "Setúbal",
    "country": "PT"
  }'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ── Add geo + weather columns to projects ────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS location_text      text,
  ADD COLUMN IF NOT EXISTS location_lat       numeric,
  ADD COLUMN IF NOT EXISTS location_lng       numeric,
  ADD COLUMN IF NOT EXISTS travel_km          numeric,
  ADD COLUMN IF NOT EXISTS travel_minutes     int,
  ADD COLUMN IF NOT EXISTS travel_mode        text DEFAULT 'driving',
  ADD COLUMN IF NOT EXISTS weather_snapshot   jsonb,
  ADD COLUMN IF NOT EXISTS weather_last_synced_at timestamptz,
  ADD COLUMN IF NOT EXISTS shoot_date_start   date,
  ADD COLUMN IF NOT EXISTS shoot_date_end     date;

-- Index for geo queries
CREATE INDEX IF NOT EXISTS idx_projects_location ON projects(location_lat, location_lng)
  WHERE location_lat IS NOT NULL;
