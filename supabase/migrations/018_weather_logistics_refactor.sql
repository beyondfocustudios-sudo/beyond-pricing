-- ============================================================
-- Migration 018: Weather & Logistics Refactoring
-- Purpose: Prepare projects table for integrated weather/logistics,
--          enhance org_settings for geo config, improve diagnostics
-- ============================================================

-- ── 1. Add weather/geo fields to projects if missing ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'location_text'
  ) THEN
    ALTER TABLE projects ADD COLUMN location_text text DEFAULT NULL;
    ALTER TABLE projects ADD COLUMN location_lat numeric(10,7) DEFAULT NULL;
    ALTER TABLE projects ADD COLUMN location_lng numeric(10,7) DEFAULT NULL;
    ALTER TABLE projects ADD COLUMN location_address text DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'logistics_start_date'
  ) THEN
    ALTER TABLE projects ADD COLUMN logistics_start_date date DEFAULT NULL;
    ALTER TABLE projects ADD COLUMN logistics_end_date date DEFAULT NULL;
    ALTER TABLE projects ADD COLUMN travel_km numeric(8,2) DEFAULT NULL;
    ALTER TABLE projects ADD COLUMN travel_minutes integer DEFAULT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'projects' AND column_name = 'weather_snapshot'
  ) THEN
    ALTER TABLE projects ADD COLUMN weather_snapshot jsonb DEFAULT NULL;
  END IF;
END $$;

-- ── 2. Enhance org_settings for geo/fuel configuration ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_settings' AND column_name = 'diesel_price_per_liter'
  ) THEN
    ALTER TABLE org_settings ADD COLUMN diesel_price_per_liter numeric(6,3) DEFAULT 1.50;
    ALTER TABLE org_settings ADD COLUMN petrol_price_per_liter numeric(6,3) DEFAULT 1.65;
    ALTER TABLE org_settings ADD COLUMN avg_fuel_consumption_l_per_100km numeric(5,2) DEFAULT 7.5;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'org_settings' AND column_name = 'default_work_location_lat'
  ) THEN
    ALTER TABLE org_settings ADD COLUMN default_work_location_lat numeric(10,7) DEFAULT NULL;
    ALTER TABLE org_settings ADD COLUMN default_work_location_lng numeric(10,7) DEFAULT NULL;
    ALTER TABLE org_settings ADD COLUMN default_work_location_name text DEFAULT NULL;
  END IF;
END $$;

-- ── 3. Ensure weather_cache has proper structure ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weather_cache' AND column_name = 'latitude'
  ) THEN
    ALTER TABLE weather_cache ADD COLUMN latitude numeric(10,7);
    ALTER TABLE weather_cache ADD COLUMN longitude numeric(10,7);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'weather_cache' AND column_name = 'location_name'
  ) THEN
    ALTER TABLE weather_cache ADD COLUMN location_name text DEFAULT NULL;
  END IF;
END $$;

-- ── 4. Ensure logistics_routes has project reference ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logistics_routes' AND column_name = 'project_id'
  ) THEN
    ALTER TABLE logistics_routes ADD COLUMN project_id uuid REFERENCES projects(id);
  END IF;
END $$;

-- ── 5. RLS for weather_cache: all org members can read/write their own ──
DROP POLICY IF EXISTS "weather_cache_select" ON weather_cache;
CREATE POLICY "weather_cache_select" ON weather_cache
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "weather_cache_insert" ON weather_cache;
CREATE POLICY "weather_cache_insert" ON weather_cache
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "weather_cache_update" ON weather_cache;
CREATE POLICY "weather_cache_update" ON weather_cache
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ── 6. RLS for logistics_routes ──
DROP POLICY IF EXISTS "logistics_routes_select" ON logistics_routes;
CREATE POLICY "logistics_routes_select" ON logistics_routes
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM project_members pm
      WHERE pm.project_id = logistics_routes.project_id
        AND pm.user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "logistics_routes_insert" ON logistics_routes;
CREATE POLICY "logistics_routes_insert" ON logistics_routes
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id
        AND EXISTS (
          SELECT 1 FROM project_members pm
          WHERE pm.project_id = p.id
            AND pm.user_id = auth.uid()
        )
    )
  );

-- ── 7. Enable RLS on new tables if not already ──
ALTER TABLE IF EXISTS weather_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS logistics_routes ENABLE ROW LEVEL SECURITY;

-- ── 8. Remove Weather/Logistics from navigation (client-side only) ──
-- Note: This is handled in AppShell.tsx filtering, not in DB

COMMENT ON TABLE projects IS 'Projects with geo/weather/logistics fields (migration 018)';
COMMENT ON TABLE weather_cache IS 'Cached weather for locations, now with location fields (migration 018)';
COMMENT ON TABLE logistics_routes IS 'Route calculations between locations (migration 018)';
