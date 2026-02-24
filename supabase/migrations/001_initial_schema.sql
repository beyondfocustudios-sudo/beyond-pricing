-- ============================================================
-- Beyond Pricing — Supabase Schema + RLS
-- Migration 001: Initial schema
-- ============================================================

-- Enable uuid extension (usually already enabled)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Supabase projects can miss uuid-ossp runtime function even if extension metadata exists.
-- Keep migration idempotent by providing a compatible fallback.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.proname = 'uuid_generate_v4'
      AND n.nspname = 'public'
      AND p.pronargs = 0
  ) THEN
    CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
    RETURNS uuid
    LANGUAGE sql
    AS $fn$SELECT gen_random_uuid();$fn$;
  END IF;
END$$;

-- ── Rates (tarifas base do utilizador) ─────────────────────────
CREATE TABLE IF NOT EXISTS rates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL CHECK (category IN ('crew', 'equipamento', 'pos_producao', 'despesas', 'outro')),
  name        TEXT NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'dia',
  base_rate   NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_rate    NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rates: owner full access" ON rates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Preferences ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS preferences (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  iva_regime        TEXT NOT NULL DEFAULT 'continental_23'
                      CHECK (iva_regime IN ('continental_23', 'madeira_22', 'acores_16', 'isento')),
  overhead_pct      NUMERIC(5,2) NOT NULL DEFAULT 15,
  contingencia_pct  NUMERIC(5,2) NOT NULL DEFAULT 10,
  margem_alvo_pct   NUMERIC(5,2) NOT NULL DEFAULT 30,
  margem_minima_pct NUMERIC(5,2) NOT NULL DEFAULT 15,
  investimento_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  moeda             TEXT NOT NULL DEFAULT 'EUR',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "preferences: owner full access" ON preferences
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_name  TEXT NOT NULL DEFAULT 'Novo Projeto',
  client_name   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'rascunho'
                  CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'cancelado', 'arquivado')),
  inputs        JSONB NOT NULL DEFAULT '{
    "itens": [],
    "overhead_pct": 15,
    "contingencia_pct": 10,
    "margem_alvo_pct": 30,
    "margem_minima_pct": 15,
    "investimento_pct": 0,
    "iva_regime": "continental_23"
  }'::JSONB,
  calc          JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects: owner full access" ON projects
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER preferences_updated_at
  BEFORE UPDATE ON preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = preset global
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'custom'
                CHECK (type IN ('institutional', 'shortform', 'documentary', 'event', 'custom')),
  defaults    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- Users see their own templates + global presets (user_id IS NULL)
CREATE POLICY "templates: read own + global" ON templates
  FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);

-- Allow insert of own templates; preset inserts (user_id IS NULL) done outside RLS via seed
CREATE POLICY "templates: write own" ON templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates: update own" ON templates
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "templates: delete own" ON templates
  FOR DELETE USING (auth.uid() = user_id);

-- ── Template Items (itens pré-definidos de templates) ────────
CREATE TABLE IF NOT EXISTS template_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id     UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  categoria       TEXT NOT NULL CHECK (categoria IN ('crew', 'equipamento', 'pos_producao', 'despesas', 'outro')),
  nome            TEXT NOT NULL,
  unidade         TEXT NOT NULL DEFAULT 'dia',
  quantidade      NUMERIC(10,2) NOT NULL DEFAULT 1,
  preco_unitario  NUMERIC(10,2) NOT NULL DEFAULT 0,
  ordem           INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE template_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "template_items: read via template" ON template_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM templates t
      WHERE t.id = template_id
        AND (t.user_id IS NULL OR t.user_id = auth.uid())
    )
  );

CREATE POLICY "template_items: write own template" ON template_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM templates t
      WHERE t.id = template_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "template_items: update own template" ON template_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM templates t
      WHERE t.id = template_id AND t.user_id = auth.uid()
    )
  );

CREATE POLICY "template_items: delete own template" ON template_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM templates t
      WHERE t.id = template_id AND t.user_id = auth.uid()
    )
  );

-- ── Checklists ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  nome        TEXT NOT NULL DEFAULT 'Nova Checklist',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklists: owner full access" ON checklists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Checklist Items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS checklist_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checklist_id  UUID NOT NULL REFERENCES checklists(id) ON DELETE CASCADE,
  fase          TEXT NOT NULL DEFAULT 'pre_producao'
                  CHECK (fase IN ('pre_producao', 'rodagem', 'pos_producao')),
  texto         TEXT NOT NULL,
  concluido     BOOLEAN NOT NULL DEFAULT FALSE,
  ordem         INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "checklist_items: via checklist owner" ON checklist_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_id AND c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM checklists c
      WHERE c.id = checklist_id AND c.user_id = auth.uid()
    )
  );

-- ── Packing List (itens de equipamento para uma produção) ────
CREATE TABLE IF NOT EXISTS packing_lists (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id  UUID REFERENCES projects(id) ON DELETE SET NULL,
  nome        TEXT NOT NULL DEFAULT 'Packing List',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE packing_lists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packing_lists: owner full access" ON packing_lists
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS packing_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  packing_list_id UUID NOT NULL REFERENCES packing_lists(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  quantidade      INTEGER NOT NULL DEFAULT 1,
  categoria       TEXT NOT NULL DEFAULT 'equipamento'
                    CHECK (categoria IN ('camera', 'audio', 'iluminacao', 'acessorios', 'outro')),
  embalado        BOOLEAN NOT NULL DEFAULT FALSE,
  notas           TEXT,
  ordem           INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE packing_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "packing_items: via packing_list owner" ON packing_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM packing_lists pl
      WHERE pl.id = packing_list_id AND pl.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM packing_lists pl
      WHERE pl.id = packing_list_id AND pl.user_id = auth.uid()
    )
  );

-- ── Project Scenarios (Básico / Base / Premium) ──────────────
CREATE TABLE IF NOT EXISTS project_scenarios (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,  -- 'Básico', 'Base', 'Premium'
  descricao       TEXT,
  inputs          JSONB NOT NULL DEFAULT '{}',
  calc            JSONB,
  is_selected     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_scenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_scenarios: owner full access" ON project_scenarios
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Project Versions (histórico de revisões) ─────────────────
CREATE TABLE IF NOT EXISTS project_versions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL DEFAULT 1,
  inputs      JSONB NOT NULL,
  calc        JSONB,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "project_versions: owner full access" ON project_versions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Brief (questionário de produção) ─────────────────────────
CREATE TABLE IF NOT EXISTS briefs (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo_projeto        TEXT,
  duracao_estimada    TEXT,
  dias_rodagem        INTEGER,
  locais_rodagem      TEXT[],
  equipas_necessarias TEXT[],
  referencias         TEXT,
  observacoes         TEXT,
  data_entrega        DATE,
  orcamento_cliente   NUMERIC(10,2),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE briefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "briefs: owner full access" ON briefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER briefs_updated_at
  BEFORE UPDATE ON briefs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Commercial Terms (condições comerciais por projeto) ──────
CREATE TABLE IF NOT EXISTS commercial_terms (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id            UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pagamento_sinal_pct   NUMERIC(5,2) NOT NULL DEFAULT 50,
  pagamento_entrega_pct NUMERIC(5,2) NOT NULL DEFAULT 50,
  prazo_pagamento_dias  INTEGER NOT NULL DEFAULT 30,
  validade_proposta_dias INTEGER NOT NULL DEFAULT 30,
  inclui_iva            BOOLEAN NOT NULL DEFAULT TRUE,
  notas_pagamento       TEXT,
  clausulas_extras      TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE commercial_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commercial_terms: owner full access" ON commercial_terms
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER commercial_terms_updated_at
  BEFORE UPDATE ON commercial_terms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Guardrails Rules (regras de validação por utilizador) ────
CREATE TABLE IF NOT EXISTS guardrail_rules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('margem_minima', 'preco_minimo', 'overhead_max', 'custom')),
  parametro   TEXT NOT NULL,  -- ex: 'margem_minima_pct'
  operador    TEXT NOT NULL CHECK (operador IN ('>', '<', '>=', '<=', '==')),
  valor       NUMERIC(10,2) NOT NULL,
  mensagem    TEXT NOT NULL,
  ativo       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE guardrail_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "guardrail_rules: owner full access" ON guardrail_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Insights / Histórico de pricing ─────────────────────────
-- Vista materializada para análise histórica por tipo de projeto
CREATE TABLE IF NOT EXISTS pricing_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id      UUID REFERENCES projects(id) ON DELETE SET NULL,
  tipo_projeto    TEXT,
  preco_final     NUMERIC(10,2),
  margem_real_pct NUMERIC(5,2),
  overhead_pct    NUMERIC(5,2),
  dias_producao   INTEGER,
  aprovado        BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE pricing_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_history: owner full access" ON pricing_history
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── Indexes for performance ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklists_user_id ON checklists(user_id);
CREATE INDEX IF NOT EXISTS idx_checklists_project_id ON checklists(project_id);
CREATE INDEX IF NOT EXISTS idx_checklist_items_checklist_id ON checklist_items(checklist_id);
CREATE INDEX IF NOT EXISTS idx_rates_user_id ON rates(user_id);
CREATE INDEX IF NOT EXISTS idx_templates_user_id ON templates(user_id);
CREATE INDEX IF NOT EXISTS idx_project_scenarios_project_id ON project_scenarios(project_id);
CREATE INDEX IF NOT EXISTS idx_project_versions_project_id ON project_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_pricing_history_user_id ON pricing_history(user_id);
