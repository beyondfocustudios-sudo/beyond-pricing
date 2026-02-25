-- ============================================================
-- Migration 039: Motion flags for Base44 system
-- ============================================================

ALTER TABLE IF EXISTS public.org_settings
  ADD COLUMN IF NOT EXISTS enable_celebrations boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_smooth_scroll boolean NOT NULL DEFAULT false;

