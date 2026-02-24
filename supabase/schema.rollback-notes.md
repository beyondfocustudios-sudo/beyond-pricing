# Rollback Notes — Beyond Pricing Schema Deploy

**File**: `supabase/schema.deploy.sql`
**Deploy Date**: February 24, 2026
**Total Migrations**: 19
**Tables Created**: 28 tables + 5 functions + multiple RLS policies

---

## ⚠️ Important: Read Before Deploying

This document describes what changes the schema deploy will make and how to identify issues.

**DO NOT attempt to manually rollback individual tables.** Instead:
1. If deployment fails mid-way, stop and check error
2. Most migrations use `IF NOT EXISTS` so re-running is safe
3. Contact support if tables are corrupted

---

## What Gets Created (High Level)

### Core Tables (Foundation)
- `rates` - User pricing configuration
- `preferences` - User settings (IVA, overhead, margins)
- `projects` - Main project data + location/travel fields

### Project Structure
- `checklists`, `checklist_items` - Project checklists
- `templates`, `template_items` - Preset templates
- `project_members` - Project access control

### CRM System
- `crm_contacts`, `crm_deals`, `crm_companies`, `crm_stages`, `crm_activities`

### User Data
- `journal_entries` - User journal
- `tasks` - Task management
- `team_members` - Organization membership

### Client Management
- `clients`, `client_users` - Client org structure

### Portal & Messaging
- `portal_pages`, `portal_briefs`, `portal_deliverables` - Portal features
- `conversations`, `messages`, `message_reads` - Messaging
- `audit_log` - Activity tracking

### Project Delivery
- `call_sheets`, `call_sheet_people`, `call_sheet_schedule` - Call sheets
- `deliverable_files` - File management
- `project_dropbox` - Dropbox integration

### Business Data
- `logistics_routes` - Route tracking
- `catalog_items` - Item catalog
- `packing_lists`, `guardrails`, `scenarios`, `budget_versions`, `rates` - Premium features

### Admin & Cache
- `notifications` - User notifications
- `email_outbox` - Email queue
- `weather_cache` - API caching
- `org_settings` - Organization configuration
- `dropbox_connections`, `sync_log`, `file_associations` - Dropbox metadata

---

## Deployment Checkpoints

### ✅ Checkpoint 1: Migration 001 Success
**What it creates**: 13 core tables (rates, preferences, projects, checklists, etc.)

**Verify**:
```sql
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Should show: 13+
```

**If fails**:
- Check for "permission denied" → need service role
- Check for "already exists" → already deployed, safe to continue
- Other errors → stop, investigate

---

### ✅ Checkpoint 2: Migration 008 Success (Soft Delete)
**What it does**: Adds `deleted_at` columns to critical tables

**Verify**:
```sql
SELECT column_name FROM information_schema.columns
WHERE table_name = 'projects' AND column_name = 'deleted_at';
-- Should show: deleted_at (timestamptz)
```

---

### ✅ Checkpoint 3: Migration 018 Success (Logistics)
**What it adds to projects table**:
- `location_text` (text)
- `location_lat` (numeric)
- `location_lng` (numeric)
- `location_address` (text)
- `travel_km` (numeric)
- `travel_minutes` (integer)
- `logistics_start_date` (date)
- `logistics_end_date` (date)

**Verify**:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'projects' AND column_name LIKE 'location%'
OR column_name LIKE 'travel%' OR column_name LIKE 'logistics%'
ORDER BY ordinal_position;
-- Should show: 8 location/travel/logistics columns
```

---

### ✅ Checkpoint 4: Final Verification
**After all 19 migrations complete**:

```sql
-- Count all tables
SELECT COUNT(*) as table_count FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Should show: 28

-- Check projects columns
SELECT COUNT(*) as column_count FROM information_schema.columns
WHERE table_name = 'projects';
-- Should show: 14+

-- Check RLS is enabled
SELECT tablename FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('projects', 'clients', 'crm_contacts');
-- Then verify each has policies:
SELECT COUNT(*) FROM pg_policies
WHERE tablename IN ('projects', 'clients', 'crm_contacts');
-- Should show: 3+ policies
```

---

## What If Deployment Fails?

### Scenario 1: "relation already exists"
**Cause**: Migration already partially applied
**Solution**:
- Safe to ignore (uses IF NOT EXISTS)
- Continue running remaining migrations
- Or restart from beginning (safe)

### Scenario 2: "permission denied"
**Cause**: Not using service role key
**Solution**:
- Refresh Supabase page
- Verify you're logged in with correct org
- Supabase UI uses service role automatically

### Scenario 3: "column does not exist"
**Cause**: Running migration out of order OR previous migration failed
**Solution**:
- Check if it's a seed migration (002, 006, 007)
- Seeds depend on 001 succeeding
- Verify checkpoint 1 before continuing

### Scenario 4: Query hangs or times out
**Cause**: Large migration taking time
**Solution**:
- Wait up to 5 minutes
- Do NOT refresh page
- If still hanging after 5 min, reload page and check if it actually applied

---

## Partial Deployment (What To Do If You Stop Partway)

**Safe to stop after**:
- Migration 001 (core schema exists, app won't crash)
- Migration 008 (soft delete pattern in place)
- Any migration (IF NOT EXISTS makes it idempotent)

**NOT safe to stop after** (partial data inconsistency):
- None — all migrations are designed to be safe stopping points

**If you stop partway**:
1. Run audit script: `npx tsx scripts/audit-schema-gaps-standalone.ts`
2. See which tables are missing
3. Find migration that creates those tables
4. Run from that migration onward

---

## How to Identify What Changed After Deploy

### Method 1: Use Audit Script (Easiest)
```bash
npx tsx scripts/audit-schema-gaps-standalone.ts
```

Expected after full deploy:
```
✅ READY (0 missing tables, 0 missing columns)
```

### Method 2: Check Specific Tables
```sql
-- List all public tables
SELECT tablename FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Count tables
SELECT COUNT(*) FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
-- Should show: 28
```

### Method 3: Check projects Table Structure
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'projects'
ORDER BY ordinal_position;

-- Should include all of these:
-- id (uuid)
-- user_id (uuid)
-- project_name (text)
-- client_name (text)
-- owner_user_id (uuid) — NEW
-- deleted_at (timestamptz) — NEW
-- location_text (text) — NEW
-- location_lat (numeric) — NEW
-- location_lng (numeric) — NEW
-- location_address (text) — NEW
-- travel_km (numeric) — NEW
-- travel_minutes (integer) — NEW
-- ... (others)
```

---

## Critical Changes for App Code

### Tables Now Available (Were Missing Before)
- checklists, checklist_items → Code can now save checklists
- clients, client_users → Code can now manage org clients
- crm_contacts, crm_deals, crm_companies → CRM features now work
- journal_entries → User journal now works
- tasks → Task management now works
- call_sheets, call_sheet_people, call_sheet_schedule → Call sheets now work
- org_settings → Org preferences now work

### Columns Now Added to projects
- owner_user_id → Track project ownership
- deleted_at → Soft delete support
- location_*, travel_* → Logistics data
- logistics_start_date, logistics_end_date → Travel dates

### RLS Policies Now Enforced
- user_id checks on personal data (journal, tasks, preferences, rates)
- project_id checks on project features (checklists, templates, call_sheets)
- org_id checks on org features (clients, team_members)
- owner_user_id checks on projects themselves

---

## What to Do If You Need to Rollback

**⚠️ WARNING**: Supabase does not have easy "rollback" for schema changes.

**Options**:

### Option 1: Drop All & Restart (Nuclear)
```sql
-- Only do this if deploy is completely corrupted
-- WARNING: This deletes ALL data

DROP TABLE IF EXISTS audit_log CASCADE;
DROP TABLE IF EXISTS email_outbox CASCADE;
-- ... (continue for all 28 tables)

-- Then re-run schema.deploy.sql
```

### Option 2: Restore from Backup (Recommended)
- Go to Supabase dashboard → Backups
- Restore to pre-deployment point
- Then re-run deploy

### Option 3: Fix Individual Tables
Most issues can be fixed without full rollback:
```sql
-- Add missing column
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Enable RLS on table
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Re-run audit to check status
```

---

## Post-Deployment Checklist

After deployment completes successfully:

- [ ] Run audit script → shows ✅ READY
- [ ] Check table count: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`  (expect 28)
- [ ] Check projects columns: 14+ columns including location/travel/deleted_at
- [ ] In Supabase dashboard Table Inspector, see all 28 tables listed
- [ ] Next: Run `npx tsx scripts/audit-schema-gaps-standalone.ts` one more time
- [ ] Then proceed to code fixes (refetch loops, RBAC)

---

## Files Reference

- **Deploy file**: `supabase/schema.deploy.sql`
- **Audit tool**: `scripts/audit-schema-gaps-standalone.ts`
- **Migration sources**: `supabase/migrations/001-019_*.sql`
- **Deployment guide**: `DEPLOY_MIGRATIONS_GUIDE.md`

---

## Timeline

- Deploy time: 30-40 minutes
- Verify time: 2 minutes
- Total: ~45 minutes to confirm schema ready

After schema confirmed ready, proceed to code fixes (REFETCH_LOOPS_FIX.md).

---

**Status**: Ready to deploy
**Safety**: High (IF NOT EXISTS guardrails throughout)
**Risk**: Low (uses safe migration patterns)
**Rollback**: Possible via Supabase backups
