-- ============================================================
-- MIGRATION 006: Seed Checklist Templates (Pre/Shoot/Post)
-- Global presets (user_id = NULL)
-- Run as service_role (RLS bypassed)
-- ============================================================

ALTER TABLE checklists      DISABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items DISABLE ROW LEVEL SECURITY;

ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

ALTER TABLE checklists
  ALTER COLUMN user_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'checklists'
      AND c.conname = 'checklists_user_required_unless_template_chk'
  ) THEN
    ALTER TABLE checklists
      ADD CONSTRAINT checklists_user_required_unless_template_chk
      CHECK (is_template OR user_id IS NOT NULL);
  END IF;
END$$;

-- ── Template IDs (stable UUIDs for idempotency) ───────────────
-- T1: Vídeo Institucional
-- T2: Documentário
-- T3: Short-Form / Social Media
-- T4: Evento

-- ── T1: Vídeo Institucional ───────────────────────────────────
INSERT INTO checklists (id, user_id, project_id, nome, is_template) VALUES
  ('10000000-0000-0000-0000-000000000001', NULL, NULL, '[Template] Vídeo Institucional — Pré-Produção', true),
  ('10000000-0000-0000-0000-000000000002', NULL, NULL, '[Template] Vídeo Institucional — Rodagem', true),
  ('10000000-0000-0000-0000-000000000003', NULL, NULL, '[Template] Vídeo Institucional — Pós-Produção', true)
ON CONFLICT DO NOTHING;

INSERT INTO checklist_items (checklist_id, fase, texto, concluido, ordem) VALUES
  -- Pré-Produção
  ('10000000-0000-0000-0000-000000000001','pre_producao','Brief criativo aprovado pelo cliente',false,1),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Orçamento enviado e aprovado',false,2),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Contrato assinado',false,3),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Reconhecimento de locais (sopralluogo)',false,4),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Autorizações de filmagem obtidas',false,5),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Guião / Roteiro aprovado',false,6),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Storyboard / Shot list criado',false,7),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Equipa contratada e confirmada',false,8),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Equipamento reservado / confirmado',false,9),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Call sheet enviada (D-1)',false,10),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Transporte e alojamento confirmados',false,11),
  ('10000000-0000-0000-0000-000000000001','pre_producao','Seguro de produção ativo',false,12),
  -- Rodagem
  ('10000000-0000-0000-0000-000000000002','rodagem','Equipamento testado antes de sair',false,1),
  ('10000000-0000-0000-0000-000000000002','rodagem','Cartões e baterias carregados',false,2),
  ('10000000-0000-0000-0000-000000000002','rodagem','Chegada ao local com margem de tempo',false,3),
  ('10000000-0000-0000-0000-000000000002','rodagem','Light check e WB definidos',false,4),
  ('10000000-0000-0000-0000-000000000002','rodagem','Som testado (nível, ruído ambiente)',false,5),
  ('10000000-0000-0000-0000-000000000002','rodagem','Shot list cumprida (marcar planos)',false,6),
  ('10000000-0000-0000-0000-000000000002','rodagem','Backup em campo (2ª card ou disco)',false,7),
  ('10000000-0000-0000-0000-000000000002','rodagem','Entrevistas/Talking heads gravadas',false,8),
  ('10000000-0000-0000-0000-000000000002','rodagem','B-roll suficiente (mín. 3× cobertura)',false,9),
  ('10000000-0000-0000-0000-000000000002','rodagem','Produto / logo gravado em pormenor',false,10),
  ('10000000-0000-0000-0000-000000000002','rodagem','Relatório de rodagem preenchido',false,11),
  ('10000000-0000-0000-0000-000000000002','rodagem','Equipamento devolvido / inventariado',false,12),
  -- Pós-Produção
  ('10000000-0000-0000-0000-000000000003','pos_producao','Footage ingested e organizada (pastas)',false,1),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Backup (3-2-1 rule)',false,2),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Selecção de takes',false,3),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Rough cut enviado ao cliente',false,4),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Feedback incorporado (revisão 1)',false,5),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Color grading finalizado',false,6),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Mix de som / música licenciada',false,7),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Legendas / motion graphics',false,8),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Versões finais exportadas (formatos acordados)',false,9),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Entrega ao cliente via portal/Dropbox',false,10),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Aprovação final do cliente registada',false,11),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Fatura emitida',false,12),
  ('10000000-0000-0000-0000-000000000003','pos_producao','Arquivar projeto (pasta local + cloud)',false,13)
ON CONFLICT DO NOTHING;

-- ── T2: Documentário ──────────────────────────────────────────
INSERT INTO checklists (id, user_id, project_id, nome, is_template) VALUES
  ('10000000-0000-0000-0000-000000000004', NULL, NULL, '[Template] Documentário — Pré-Produção', true),
  ('10000000-0000-0000-0000-000000000005', NULL, NULL, '[Template] Documentário — Rodagem', true),
  ('10000000-0000-0000-0000-000000000006', NULL, NULL, '[Template] Documentário — Pós-Produção', true)
ON CONFLICT DO NOTHING;

INSERT INTO checklist_items (checklist_id, fase, texto, concluido, ordem) VALUES
  ('10000000-0000-0000-0000-000000000004','pre_producao','Investigação e pesquisa concluída',false,1),
  ('10000000-0000-0000-0000-000000000004','pre_producao','Entrevistados confirmados',false,2),
  ('10000000-0000-0000-0000-000000000004','pre_producao','Autorizações de imagem assinadas',false,3),
  ('10000000-0000-0000-0000-000000000004','pre_producao','Perguntas de entrevista preparadas',false,4),
  ('10000000-0000-0000-0000-000000000004','pre_producao','Locais scouted e autorizados',false,5),
  ('10000000-0000-0000-0000-000000000004','pre_producao','Timeline editorial definida',false,6),
  ('10000000-0000-0000-0000-000000000005','rodagem','Entrevistas gravadas (áudio redundante)',false,1),
  ('10000000-0000-0000-0000-000000000005','rodagem','B-roll de apoio às entrevistas',false,2),
  ('10000000-0000-0000-0000-000000000005','rodagem','Imagens de arquivo / fotos digitalizadas',false,3),
  ('10000000-0000-0000-0000-000000000005','rodagem','Voz-off gravada (se aplicável)',false,4),
  ('10000000-0000-0000-0000-000000000006','pos_producao','Transcrição de entrevistas',false,1),
  ('10000000-0000-0000-0000-000000000006','pos_producao','Paper edit / estrutura narrativa',false,2),
  ('10000000-0000-0000-0000-000000000006','pos_producao','Assemblagem e rough cut',false,3),
  ('10000000-0000-0000-0000-000000000006','pos_producao','Música e arquivos licenciados',false,4),
  ('10000000-0000-0000-0000-000000000006','pos_producao','Color + mix finalizado',false,5),
  ('10000000-0000-0000-0000-000000000006','pos_producao','Versões para festival / broadcast / web',false,6)
ON CONFLICT DO NOTHING;

-- ── T3: Short-Form / Social Media ────────────────────────────
INSERT INTO checklists (id, user_id, project_id, nome, is_template) VALUES
  ('10000000-0000-0000-0000-000000000007', NULL, NULL, '[Template] Short-Form Social — Pré-Produção', true),
  ('10000000-0000-0000-0000-000000000008', NULL, NULL, '[Template] Short-Form Social — Rodagem', true),
  ('10000000-0000-0000-0000-000000000009', NULL, NULL, '[Template] Short-Form Social — Pós-Produção', true)
ON CONFLICT DO NOTHING;

INSERT INTO checklist_items (checklist_id, fase, texto, concluido, ordem) VALUES
  ('10000000-0000-0000-0000-000000000007','pre_producao','Briefing de conteúdo e canais definidos',false,1),
  ('10000000-0000-0000-0000-000000000007','pre_producao','Formatos acordados (16:9, 9:16, 1:1)',false,2),
  ('10000000-0000-0000-0000-000000000007','pre_producao','Referências visuais aprovadas',false,3),
  ('10000000-0000-0000-0000-000000000007','pre_producao','Props / produto confirmado',false,4),
  ('10000000-0000-0000-0000-000000000008','rodagem','Setup rápido (<30 min)',false,1),
  ('10000000-0000-0000-0000-000000000008','rodagem','Vertical e horizontal gravados',false,2),
  ('10000000-0000-0000-0000-000000000008','rodagem','Takes mínimos (eficiência)',false,3),
  ('10000000-0000-0000-0000-000000000008','rodagem','Foto BTS para social',false,4),
  ('10000000-0000-0000-0000-000000000009','pos_producao','Edição rápida (< 2 dias)',false,1),
  ('10000000-0000-0000-0000-000000000009','pos_producao','Captions / legendas adicionadas',false,2),
  ('10000000-0000-0000-0000-000000000009','pos_producao','3 versões exportadas (formatos)',false,3),
  ('10000000-0000-0000-0000-000000000009','pos_producao','Aprovação rápida (24h SLA)',false,4)
ON CONFLICT DO NOTHING;

-- ── T4: Evento ────────────────────────────────────────────────
INSERT INTO checklists (id, user_id, project_id, nome, is_template) VALUES
  ('10000000-0000-0000-0000-000000000010', NULL, NULL, '[Template] Evento — Pré-Produção', true),
  ('10000000-0000-0000-0000-000000000011', NULL, NULL, '[Template] Evento — Rodagem', true),
  ('10000000-0000-0000-0000-000000000012', NULL, NULL, '[Template] Evento — Pós-Produção', true)
ON CONFLICT DO NOTHING;

INSERT INTO checklist_items (checklist_id, fase, texto, concluido, ordem) VALUES
  ('10000000-0000-0000-0000-000000000010','pre_producao','Programa do evento recebido',false,1),
  ('10000000-0000-0000-0000-000000000010','pre_producao','Planta do espaço analisada',false,2),
  ('10000000-0000-0000-0000-000000000010','pre_producao','Posições de câmara planeadas',false,3),
  ('10000000-0000-0000-0000-000000000010','pre_producao','Coordenação com organização do evento',false,4),
  ('10000000-0000-0000-0000-000000000010','pre_producao','Credenciais / acreditação confirmadas',false,5),
  ('10000000-0000-0000-0000-000000000011','rodagem','Multi-câmara setup (se aplicável)',false,1),
  ('10000000-0000-0000-0000-000000000011','rodagem','Gravação de som mesa (direto)',false,2),
  ('10000000-0000-0000-0000-000000000011','rodagem','Cobertura de discursos e momentos-chave',false,3),
  ('10000000-0000-0000-0000-000000000011','rodagem','Depoimentos pós-evento gravados',false,4),
  ('10000000-0000-0000-0000-000000000011','rodagem','Fotografias do evento (se contratadas)',false,5),
  ('10000000-0000-0000-0000-000000000012','pos_producao','Sincronização multi-câmara',false,1),
  ('10000000-0000-0000-0000-000000000012','pos_producao','Corte do evento completo',false,2),
  ('10000000-0000-0000-0000-000000000012','pos_producao','Highlight reel (2-3 min)',false,3),
  ('10000000-0000-0000-0000-000000000012','pos_producao','Versão Instagram / Reel',false,4),
  ('10000000-0000-0000-0000-000000000012','pos_producao','Entrega ao cliente',false,5)
ON CONFLICT DO NOTHING;

-- Re-enable RLS
ALTER TABLE checklists      ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
