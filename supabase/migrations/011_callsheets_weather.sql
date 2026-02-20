-- 011_callsheets_weather.sql
-- Call sheets + weather snapshots + logistics enhancements

-- call_sheets: ensure all needed columns
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS general_call_time time;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS location_name text;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS location_address text;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS location_lat numeric;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS location_lng numeric;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS weather_snapshot jsonb;
ALTER TABLE call_sheets ADD COLUMN IF NOT EXISTS pdf_url text;

-- call_sheet_people: ensure columns
ALTER TABLE call_sheet_people ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE call_sheet_people ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE call_sheet_people ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE call_sheet_people ADD COLUMN IF NOT EXISTS call_time time;
ALTER TABLE call_sheet_people ADD COLUMN IF NOT EXISTS notes text;

-- call_sheet_schedule: ensure columns  
ALTER TABLE call_sheet_schedule ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE call_sheet_schedule ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE call_sheet_schedule ADD COLUMN IF NOT EXISTS duration_minutes int DEFAULT 0;

-- weather_cache: enhancements
ALTER TABLE weather_cache ADD COLUMN IF NOT EXISTS location_name text;
ALTER TABLE weather_cache ADD COLUMN IF NOT EXISTS daily_data jsonb;

-- logistics_routes: enhancements
ALTER TABLE logistics_routes ADD COLUMN IF NOT EXISTS fuel_price_per_liter numeric DEFAULT 1.70;
ALTER TABLE logistics_routes ADD COLUMN IF NOT EXISTS consumption_per_100km numeric DEFAULT 7.0;
ALTER TABLE logistics_routes ADD COLUMN IF NOT EXISTS fuel_cost numeric;
ALTER TABLE logistics_routes ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE logistics_routes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_call_sheets_project ON call_sheets(project_id, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_call_sheet_people_sheet ON call_sheet_people(call_sheet_id);
CREATE INDEX IF NOT EXISTS idx_call_sheet_schedule_sheet ON call_sheet_schedule(call_sheet_id, start_time);
