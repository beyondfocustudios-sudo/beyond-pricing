-- 044_crm_contacts_user_id_backfill.sql
-- Ensure crm_contacts.user_id exists for app compatibility/audit script.

ALTER TABLE public.crm_contacts
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

UPDATE public.crm_contacts
SET user_id = owner_user_id
WHERE user_id IS NULL
  AND owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_id ON public.crm_contacts(user_id);
