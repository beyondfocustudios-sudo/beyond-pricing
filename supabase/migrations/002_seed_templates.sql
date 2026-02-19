-- ============================================================
-- Beyond Pricing — Seed: Global Templates (presets)
-- Migration 002: Preset template library
--
-- NOTE: Preset templates have user_id = NULL (global/system).
-- RLS policies only allow authenticated users to write their own rows.
-- This seed must run as superuser (service_role) or with RLS disabled.
-- If running in Supabase SQL Editor as admin: RLS is bypassed automatically.
-- If using `supabase db push` via CLI with service_role: also bypassed.
-- ============================================================

-- Temporarily disable RLS so seed data can be inserted as system presets
ALTER TABLE templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE template_items DISABLE ROW LEVEL SECURITY;

-- Institutional Video template
INSERT INTO templates (id, user_id, name, type, defaults) VALUES
  ('00000000-0000-0000-0000-000000000001', NULL, 'Vídeo Institucional', 'institutional',
   '{"overhead_pct": 20, "contingencia_pct": 10, "margem_alvo_pct": 35, "margem_minima_pct": 20}')
ON CONFLICT DO NOTHING;

INSERT INTO template_items (template_id, categoria, nome, unidade, quantidade, preco_unitario, ordem) VALUES
  ('00000000-0000-0000-0000-000000000001', 'crew', 'Diretor/Realizador', 'dia', 2, 400, 1),
  ('00000000-0000-0000-0000-000000000001', 'crew', 'Diretor de Fotografia', 'dia', 2, 350, 2),
  ('00000000-0000-0000-0000-000000000001', 'crew', 'Operador de Câmara', 'dia', 2, 250, 3),
  ('00000000-0000-0000-0000-000000000001', 'crew', 'Assistente de Câmara', 'dia', 2, 150, 4),
  ('00000000-0000-0000-0000-000000000001', 'crew', 'Técnico de Som', 'dia', 2, 200, 5),
  ('00000000-0000-0000-0000-000000000001', 'equipamento', 'Câmara Sony FX6', 'dia', 2, 180, 6),
  ('00000000-0000-0000-0000-000000000001', 'equipamento', 'Objetivas (kit)', 'dia', 2, 120, 7),
  ('00000000-0000-0000-0000-000000000001', 'equipamento', 'Kit Iluminação LED', 'dia', 2, 150, 8),
  ('00000000-0000-0000-0000-000000000001', 'equipamento', 'Gravador Som Zoom F6', 'dia', 2, 80, 9),
  ('00000000-0000-0000-0000-000000000001', 'pos_producao', 'Edição e Montagem', 'hora', 20, 60, 10),
  ('00000000-0000-0000-0000-000000000001', 'pos_producao', 'Color Grading', 'hora', 8, 80, 11),
  ('00000000-0000-0000-0000-000000000001', 'pos_producao', 'Mix de Som / Masterização', 'hora', 6, 70, 12),
  ('00000000-0000-0000-0000-000000000001', 'despesas', 'Transporte / Deslocações', 'dia', 2, 80, 13),
  ('00000000-0000-0000-0000-000000000001', 'despesas', 'Alimentação equipa', 'dia', 2, 60, 14)
ON CONFLICT DO NOTHING;

-- Short-form Content template
INSERT INTO templates (id, user_id, name, type, defaults) VALUES
  ('00000000-0000-0000-0000-000000000002', NULL, 'Conteúdo Short-Form', 'shortform',
   '{"overhead_pct": 15, "contingencia_pct": 5, "margem_alvo_pct": 40, "margem_minima_pct": 25}')
ON CONFLICT DO NOTHING;

INSERT INTO template_items (template_id, categoria, nome, unidade, quantidade, preco_unitario, ordem) VALUES
  ('00000000-0000-0000-0000-000000000002', 'crew', 'Criador de Conteúdo / Realizador', 'dia', 1, 350, 1),
  ('00000000-0000-0000-0000-000000000002', 'crew', 'Operador de Câmara', 'dia', 1, 200, 2),
  ('00000000-0000-0000-0000-000000000002', 'equipamento', 'Câmara Sony A7IV', 'dia', 1, 100, 3),
  ('00000000-0000-0000-0000-000000000002', 'equipamento', 'Gimbal / Estabilizador', 'dia', 1, 60, 4),
  ('00000000-0000-0000-0000-000000000002', 'equipamento', 'Microfone Lapela / Rode', 'dia', 1, 40, 5),
  ('00000000-0000-0000-0000-000000000002', 'pos_producao', 'Edição (3 versões)', 'hora', 8, 55, 6),
  ('00000000-0000-0000-0000-000000000002', 'despesas', 'Transporte', 'viagem', 1, 50, 7)
ON CONFLICT DO NOTHING;

-- Documentary template
INSERT INTO templates (id, user_id, name, type, defaults) VALUES
  ('00000000-0000-0000-0000-000000000003', NULL, 'Documentário', 'documentary',
   '{"overhead_pct": 25, "contingencia_pct": 15, "margem_alvo_pct": 30, "margem_minima_pct": 18}')
ON CONFLICT DO NOTHING;

INSERT INTO template_items (template_id, categoria, nome, unidade, quantidade, preco_unitario, ordem) VALUES
  ('00000000-0000-0000-0000-000000000003', 'crew', 'Realizador', 'dia', 5, 500, 1),
  ('00000000-0000-0000-0000-000000000003', 'crew', 'Diretor de Fotografia', 'dia', 5, 400, 2),
  ('00000000-0000-0000-0000-000000000003', 'crew', 'Operador de Som', 'dia', 5, 250, 3),
  ('00000000-0000-0000-0000-000000000003', 'crew', 'Produtor', 'dia', 5, 350, 4),
  ('00000000-0000-0000-0000-000000000003', 'equipamento', 'Câmara Cinema', 'dia', 5, 300, 5),
  ('00000000-0000-0000-0000-000000000003', 'equipamento', 'Objetivas Cinema', 'dia', 5, 200, 6),
  ('00000000-0000-0000-0000-000000000003', 'equipamento', 'Som (boom + mix)', 'dia', 5, 120, 7),
  ('00000000-0000-0000-0000-000000000003', 'pos_producao', 'Montagem / Edição', 'hora', 60, 65, 8),
  ('00000000-0000-0000-0000-000000000003', 'pos_producao', 'Color Grade (DCP)', 'hora', 20, 90, 9),
  ('00000000-0000-0000-0000-000000000003', 'pos_producao', 'Mix Surround', 'hora', 15, 85, 10),
  ('00000000-0000-0000-0000-000000000003', 'despesas', 'Alojamento equipa', 'noite', 20, 80, 11),
  ('00000000-0000-0000-0000-000000000003', 'despesas', 'Alimentação', 'dia', 5, 80, 12),
  ('00000000-0000-0000-0000-000000000003', 'despesas', 'Transporte / Combustível', 'dia', 5, 100, 13)
ON CONFLICT DO NOTHING;

-- Event Video template
INSERT INTO templates (id, user_id, name, type, defaults) VALUES
  ('00000000-0000-0000-0000-000000000004', NULL, 'Captação de Evento', 'event',
   '{"overhead_pct": 15, "contingencia_pct": 10, "margem_alvo_pct": 35, "margem_minima_pct": 20}')
ON CONFLICT DO NOTHING;

INSERT INTO template_items (template_id, categoria, nome, unidade, quantidade, preco_unitario, ordem) VALUES
  ('00000000-0000-0000-0000-000000000004', 'crew', 'Operador Câmara Principal', 'dia', 1, 280, 1),
  ('00000000-0000-0000-0000-000000000004', 'crew', 'Operador Câmara B', 'dia', 1, 220, 2),
  ('00000000-0000-0000-0000-000000000004', 'crew', 'Técnico de Som', 'dia', 1, 200, 3),
  ('00000000-0000-0000-0000-000000000004', 'equipamento', 'Câmara A (principal)', 'dia', 1, 150, 4),
  ('00000000-0000-0000-0000-000000000004', 'equipamento', 'Câmara B (cobertura)', 'dia', 1, 100, 5),
  ('00000000-0000-0000-0000-000000000004', 'equipamento', 'Kit Iluminação', 'dia', 1, 120, 6),
  ('00000000-0000-0000-0000-000000000004', 'equipamento', 'Plataforma slider + tripé', 'dia', 1, 80, 7),
  ('00000000-0000-0000-0000-000000000004', 'pos_producao', 'Edição (highlight + full)', 'hora', 12, 60, 8),
  ('00000000-0000-0000-0000-000000000004', 'despesas', 'Transporte', 'viagem', 2, 60, 9)
ON CONFLICT DO NOTHING;

-- Re-enable RLS after seeding preset data
ALTER TABLE templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_items ENABLE ROW LEVEL SECURITY;
