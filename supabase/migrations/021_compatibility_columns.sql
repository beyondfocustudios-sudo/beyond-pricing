-- 021_compatibility_columns.sql
-- Backward-compatible aliases for legacy/english column names.

ALTER TABLE checklists
  ADD COLUMN IF NOT EXISTS name text;

UPDATE checklists
SET name = nome
WHERE name IS NULL;

CREATE OR REPLACE FUNCTION sync_checklists_name_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.nome := COALESCE(NEW.nome, NEW.name, 'Nova Checklist');
  NEW.name := COALESCE(NEW.name, NEW.nome);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_checklists_name_columns ON checklists;
CREATE TRIGGER trg_sync_checklists_name_columns
BEFORE INSERT OR UPDATE ON checklists
FOR EACH ROW EXECUTE FUNCTION sync_checklists_name_columns();

ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS text text,
  ADD COLUMN IF NOT EXISTS completed boolean;

UPDATE checklist_items
SET text = texto
WHERE text IS NULL;

UPDATE checklist_items
SET completed = concluido
WHERE completed IS NULL;

CREATE OR REPLACE FUNCTION sync_checklist_items_alias_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.texto := COALESCE(NEW.texto, NEW.text, '');
  NEW.text := COALESCE(NEW.text, NEW.texto);
  NEW.concluido := COALESCE(NEW.concluido, NEW.completed, false);
  NEW.completed := COALESCE(NEW.completed, NEW.concluido, false);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_checklist_items_alias_columns ON checklist_items;
CREATE TRIGGER trg_sync_checklist_items_alias_columns
BEFORE INSERT OR UPDATE ON checklist_items
FOR EACH ROW EXECUTE FUNCTION sync_checklist_items_alias_columns();

ALTER TABLE crm_stages
  ADD COLUMN IF NOT EXISTS "order" int DEFAULT 0;
