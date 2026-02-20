-- 012_crm_deals_pipeline.sql
-- CRM deals pipeline + activities + companies

CREATE TABLE IF NOT EXISTS crm_companies (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  domain       text,
  industry     text,
  country      text DEFAULT 'PT',
  notes        text,
  tags         text[] DEFAULT '{}',
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_companies_owner" ON crm_companies FOR ALL
  USING (user_id = auth.uid() OR is_org_role(ARRAY['owner','admin']))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS crm_deals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id     uuid REFERENCES crm_companies(id) ON DELETE SET NULL,
  contact_id     uuid REFERENCES crm_contacts(id) ON DELETE SET NULL,
  project_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
  title          text NOT NULL,
  stage          text NOT NULL DEFAULT 'lead',
  value          numeric DEFAULT 0,
  currency       text DEFAULT 'EUR',
  probability    int DEFAULT 50,
  expected_close date,
  lost_reason    text,
  notes          text,
  tags           text[] DEFAULT '{}',
  deleted_at     timestamptz,
  closed_at      timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_deals_owner" ON crm_deals FOR ALL
  USING (user_id = auth.uid() OR is_org_role(ARRAY['owner','admin']))
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS crm_activities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id     uuid REFERENCES crm_deals(id) ON DELETE CASCADE,
  contact_id  uuid REFERENCES crm_contacts(id) ON DELETE CASCADE,
  type        text NOT NULL DEFAULT 'note', -- note/call/email/meeting/task
  title       text NOT NULL,
  description text,
  completed   boolean DEFAULT false,
  due_date    timestamptz,
  done_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crm_activities_owner" ON crm_activities FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- CRM deals pipeline stages order helper
CREATE TABLE IF NOT EXISTS crm_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE NOT NULL,
  label       text NOT NULL,
  position    int NOT NULL,
  color       text DEFAULT '#6b7280'
);
INSERT INTO crm_stages (name, label, position, color) VALUES
  ('lead',       'Lead',          1, '#6b7280'),
  ('qualified',  'Qualificado',   2, '#3b82f6'),
  ('proposal',   'Proposta',      3, '#f59e0b'),
  ('negotiation','Negociação',    4, '#8b5cf6'),
  ('won',        'Ganho',         5, '#10b981'),
  ('lost',       'Perdido',       6, '#ef4444')
ON CONFLICT (name) DO NOTHING;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON crm_deals(stage, deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_crm_deals_user ON crm_deals(user_id, deleted_at) WHERE deleted_at IS NULL;
