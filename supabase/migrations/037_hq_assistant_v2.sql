-- ============================================================
-- Migration 037: HQ Assistant v2 (flags, usage, support tickets)
-- ============================================================

ALTER TABLE IF EXISTS public.org_settings
  ADD COLUMN IF NOT EXISTS enable_hq_assistant boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_ai_assistant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_weekly_limit integer NOT NULL DEFAULT 50;

CREATE TABLE IF NOT EXISTS public.assistant_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  usage_count integer NOT NULL DEFAULT 0,
  tokens_estimated integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start)
);

CREATE INDEX IF NOT EXISTS idx_assistant_usage_user_week
  ON public.assistant_usage(user_id, week_start DESC);

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  route text,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_severity_check CHECK (severity IN ('low','medium','high','critical')),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open','in_progress','resolved','closed'))
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at
  ON public.support_tickets(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON public.support_tickets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_ticket_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_logs_ticket
  ON public.support_ticket_logs(ticket_id, created_at DESC);

ALTER TABLE public.assistant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at') THEN
    DROP TRIGGER IF EXISTS trg_assistant_usage_updated_at ON public.assistant_usage;
    CREATE TRIGGER trg_assistant_usage_updated_at
      BEFORE UPDATE ON public.assistant_usage
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at();

    DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
    CREATE TRIGGER trg_support_tickets_updated_at
      BEFORE UPDATE ON public.support_tickets
      FOR EACH ROW
      EXECUTE FUNCTION public.update_updated_at();
  END IF;
END$$;

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assistant_usage'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.assistant_usage', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_tickets'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.support_tickets', p.policyname);
  END LOOP;

  FOR p IN
    SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'support_ticket_logs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.support_ticket_logs', p.policyname);
  END LOOP;
END$$;

CREATE POLICY assistant_usage_owner_all ON public.assistant_usage
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY support_tickets_read_owner_or_admin ON public.support_tickets
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY support_tickets_insert_self ON public.support_tickets
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY support_tickets_update_admin ON public.support_tickets
  FOR UPDATE
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

CREATE POLICY support_ticket_logs_read_owner_or_admin ON public.support_ticket_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = support_ticket_logs.ticket_id
        AND (
          st.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
          )
        )
    )
  );

CREATE POLICY support_ticket_logs_insert_owner_or_admin ON public.support_ticket_logs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.support_tickets st
      WHERE st.id = support_ticket_logs.ticket_id
        AND (
          st.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
          )
        )
    )
  );
