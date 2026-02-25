-- 042_calendar_events.sql
-- Minimal calendar events table for dashboard scheduling + ICS export

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  location text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT calendar_events_end_after_start CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_user_id ON public.calendar_events(user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_starts_at ON public.calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_calendar_events_deleted_at ON public.calendar_events(deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "calendar_events_select_own" ON public.calendar_events;
CREATE POLICY "calendar_events_select_own"
  ON public.calendar_events
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "calendar_events_insert_own" ON public.calendar_events;
CREATE POLICY "calendar_events_insert_own"
  ON public.calendar_events
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "calendar_events_update_own" ON public.calendar_events;
CREATE POLICY "calendar_events_update_own"
  ON public.calendar_events
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "calendar_events_delete_own" ON public.calendar_events;
CREATE POLICY "calendar_events_delete_own"
  ON public.calendar_events
  FOR DELETE
  USING (user_id = auth.uid());
