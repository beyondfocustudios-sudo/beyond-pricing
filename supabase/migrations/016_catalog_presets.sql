-- Migration 016: Catalog presets (item library)
-- catalog_items: org-wide + global presets for common crew/equipment/etc.

CREATE TABLE IF NOT EXISTS catalog_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  categoria   TEXT NOT NULL CHECK (categoria IN ('crew','equipamento','pos_producao','despesas','outro')),
  nome        TEXT NOT NULL,
  unidade     TEXT NOT NULL DEFAULT 'dia',
  preco_base  NUMERIC(10,2) DEFAULT 0,
  ativo       BOOLEAN NOT NULL DEFAULT true,
  ordem       INT NOT NULL DEFAULT 0,
  is_global   BOOLEAN NOT NULL DEFAULT false, -- true = shipped preset, false = org custom
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Global presets are readable by everyone; org items are org-scoped
ALTER TABLE catalog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "catalog_select" ON catalog_items FOR SELECT USING (
  is_global = true
  OR org_id IN (
    SELECT o.id FROM organizations o
    JOIN team_members tm ON tm.org_id = o.id
    WHERE tm.user_id = auth.uid()
  )
);

CREATE POLICY "catalog_insert" ON catalog_items FOR INSERT WITH CHECK (
  org_id IN (
    SELECT o.id FROM organizations o
    JOIN team_members tm ON tm.org_id = o.id
    WHERE tm.user_id = auth.uid()
  )
);

CREATE POLICY "catalog_update" ON catalog_items FOR UPDATE USING (
  user_id = auth.uid()
  OR org_id IN (
    SELECT o.id FROM organizations o
    JOIN team_members tm ON tm.org_id = o.id
    WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
  )
);

CREATE POLICY "catalog_delete" ON catalog_items FOR DELETE USING (
  user_id = auth.uid()
  OR org_id IN (
    SELECT o.id FROM organizations o
    JOIN team_members tm ON tm.org_id = o.id
    WHERE tm.user_id = auth.uid() AND tm.role IN ('owner', 'admin')
  )
);

-- ── Global presets seed ──────────────────────────────────────
INSERT INTO catalog_items (categoria, nome, unidade, preco_base, is_global, ordem) VALUES
  -- CREW
  ('crew', '🎬 Realizador', 'dia', 800, true, 10),
  ('crew', '🎥 Diretor de Fotografia (DOP)', 'dia', 700, true, 20),
  ('crew', '🎥 1ª Assistente de Câmara (1AC)', 'dia', 300, true, 30),
  ('crew', '🎥 2ª Assistente de Câmara (2AC)', 'dia', 200, true, 40),
  ('crew', '💡 Gaffer (Chefe de Elétrica)', 'dia', 350, true, 50),
  ('crew', '💡 Best Boy Elétrico', 'dia', 250, true, 60),
  ('crew', '🎤 Técnico de Som Direto', 'dia', 350, true, 70),
  ('crew', '🎭 Diretor de Arte', 'dia', 400, true, 80),
  ('crew', '📦 Maquinista / Grip', 'dia', 280, true, 90),
  ('crew', '🎞️ Continuista (Script Supervisor)', 'dia', 300, true, 100),
  ('crew', '📷 Fotógrafo de Cena', 'dia', 350, true, 110),
  ('crew', '💄 Maquilhadora / Cabelos', 'dia', 300, true, 120),
  ('crew', '🎬 Assistente de Realização', 'dia', 250, true, 130),
  ('crew', '🚗 Driver / Runner', 'dia', 150, true, 140),

  -- EQUIPAMENTO
  ('equipamento', '📷 Câmara Sony FX3 + acessórios', 'dia', 250, true, 10),
  ('equipamento', '📷 Câmara Sony FX6', 'dia', 400, true, 20),
  ('equipamento', '📷 Câmara ARRI Alexa Mini LF', 'dia', 1200, true, 30),
  ('equipamento', '📷 Câmara RED V-RAPTOR', 'dia', 900, true, 40),
  ('equipamento', '🔭 Objetivas Prime Set (5x)', 'dia', 350, true, 50),
  ('equipamento', '🔭 Objetiva Zoom 24-70mm', 'dia', 120, true, 60),
  ('equipamento', '🎙️ Microfone Boom + Zeppelin', 'dia', 80, true, 70),
  ('equipamento', '🎙️ Gravador Zoom F8n', 'dia', 60, true, 80),
  ('equipamento', '🎙️ Lavalier sem fios (2x Sennheiser)', 'dia', 100, true, 90),
  ('equipamento', '💡 Kit LED (4x ARRI Skypanel S30)', 'dia', 400, true, 100),
  ('equipamento', '💡 HMI 1.2kW', 'dia', 200, true, 110),
  ('equipamento', '🎮 DJI RS3 Pro (Gimbal)', 'dia', 80, true, 120),
  ('equipamento', '🚁 Drone DJI Mavic 3 Pro', 'dia', 300, true, 130),
  ('equipamento', '🎬 Dolly + Rails (10m)', 'dia', 200, true, 140),
  ('equipamento', '📺 Monitor Atomos Shogun', 'dia', 80, true, 150),

  -- PÓS-PRODUÇÃO
  ('pos_producao', '✂️ Edição de Vídeo', 'hora', 60, true, 10),
  ('pos_producao', '🎨 Colorização (Color Grading)', 'hora', 80, true, 20),
  ('pos_producao', '🎵 Mistura de Som / Audio Mix', 'hora', 70, true, 30),
  ('pos_producao', '✨ VFX / Motion Graphics', 'hora', 90, true, 40),
  ('pos_producao', '📝 Legendagem', 'minuto', 3, true, 50),
  ('pos_producao', '🗣️ Voice-over', 'minuto', 25, true, 60),
  ('pos_producao', '💾 Entrega + DCP / H264', 'unidade', 150, true, 70),

  -- DESPESAS
  ('despesas', '🚗 Quilometragem (por km)', 'km', 0.36, true, 10),
  ('despesas', '🏨 Alojamento por noite', 'noite', 80, true, 20),
  ('despesas', '🍽️ Catering (por pessoa/dia)', 'pessoa', 25, true, 30),
  ('despesas', '✈️ Voo (estimativa)', 'unidade', 200, true, 40),
  ('despesas', '🚚 Transporte de Equipamento', 'dia', 120, true, 50),
  ('despesas', '📦 Material de Arte / Adereços', 'unidade', 0, true, 60),
  ('despesas', '🎫 Licenças de Locação', 'unidade', 0, true, 70),
  ('despesas', '🔒 Seguro de Produção', 'dia', 50, true, 80);
