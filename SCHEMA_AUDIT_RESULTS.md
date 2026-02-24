# 📊 Schema Audit Results — CRITICAL FINDINGS

**Date**: February 24, 2026
**Audit Tool**: `scripts/audit-schema-gaps-standalone.ts`
**Status**: 🔴 **CRITICAL — Database Schema Empty, No Migrations Applied**

---

## Executive Summary

**The Beyond Pricing database is effectively empty.** Of 28 tables checked:
- ✅ **2 tables exist**: projects, templates
- ❌ **27 tables missing**: conversations, messages, CRM tables, checklists, journal, tasks, clients, org settings, and 19 others
- ⚠️ **8 columns missing from projects table**: All logistics, ownership, and soft-delete fields

**Root Cause**: All 19 migration files exist locally (001-019) but have **never been applied** to the actual Supabase database.

**Action Required**: Apply all migrations to Supabase immediately before proceeding with any feature work.

---

## Detailed Audit Findings

### ✅ Tables That Exist (2/28)
```
✅ projects (has: id, project_name, client_name, status, inputs, calc)
   ⚠️ MISSING: deleted_at, owner_user_id, location_text, location_lat,
              location_lng, location_address, travel_km, travel_minutes

✅ templates (table exists, no sample rows)
   Status: Can accept data once RLS policies applied
```

### ❌ Tables That Are Missing (27/28)

**Portal & Messaging (6)**
- conversations
- messages
- message_reads
- Portal pages, briefs, deliverables, requests (from migrations 003, 009)

**CRM (4)**
- crm_contacts
- crm_deals
- crm_companies
- crm_stages
- crm_activities

**Project Structure (4)**
- checklists
- checklist_items
- template_items
- project_members

**User Data (4)**
- journal_entries
- tasks
- preferences
- team_members

**Client Management (4)**
- clients
- client_users
- organizations
- (org has some settings but org_settings table missing)

**Project Delivery (5)**
- deliverable_files
- project_dropbox
- call_sheets
- call_sheet_people
- call_sheet_schedule

**Data (3)**
- logistics_routes
- catalog_items
- (weather_cache exists for caching but main cache missing)

**Admin (3)**
- notifications
- email_outbox
- audit_log

---

## What This Means for the App

### Current State
```
❌ Cannot create checklists (checklists table missing)
❌ Cannot store journal entries (journal_entries table missing)
❌ Cannot access CRM features (all CRM tables missing)
❌ Cannot manage clients org-wide (clients table missing)
❌ Cannot use call sheets (call_sheets* tables missing)
❌ Cannot save location/travel data (columns missing from projects)
❌ Cannot track ownership (owner_user_id column missing)
❌ Cannot soft-delete anything (deleted_at column missing)
❌ Cannot use org settings (org_settings table missing)
✅ Can create projects (but missing location/ownership data)
✅ Can fetch templates (but templates isolated from other features)
```

### Why Code Runs But Errors Appear
The app was built to use all 28 tables, but:
1. **Queries fail silently** on missing tables (RLS denies access)
2. **CRUD operations error** with "table not found" in Supabase logs
3. **No data persists** across page refreshes
4. **Diagnostic page shows errors** (tables found in code but not in schema cache)

---

## Migration Order & What Each Adds

| # | Migration | Tables Created | Key Fields |
|---|-----------|-----------------|------------|
| 001 | initial_schema | 17 tables | projects, checklists, templates, clients, CRM, messaging foundations |
| 002 | seed_templates | — | Populate default templates (depends on 001) |
| 003 | client_portal_rbac | 5 tables | Portal pages, briefs, deliverables, approvals, requests |
| 004 | portal_messaging | 3 tables | conversations, messages, message_reads, audit_log |
| 005 | premium_features | 5 tables | packing_lists, guardrails, scenarios, budget_versions, rates |
| 006 | seed_checklist_templates | — | Populate checklist templates |
| 007 | admin_bootstrap | Function | Bootstrap helper for new org setup |
| 008 | rbac_soft_delete | — | Soft delete pattern (triggers, deleted_at columns) |
| 009 | portal_enhancements | — | RLS fixes, enhancements |
| 010 | dropbox_sync | 2 tables | dropbox_connections, sync_log, file_associations |
| 011 | callsheets_weather | 4 tables | call_sheets, people, schedule; weather_cache |
| 012 | crm_deals_pipeline | 4 tables | crm_stages, deals, activities, commercial_terms |
| 013 | org_clients_rbac | — | org_id on clients, RLS org-level |
| 014 | project_geo_weather | 2 tables | logistics_routes; projects: location fields |
| 015 | fix_conversations_rls | — | RLS policy fixes |
| 016 | catalog_presets | 1 table | catalog_presets for item templates |
| 017 | stabilize_rls_schema | — | RLS hardening, project auto-member trigger |
| 018 | weather_logistics_refactor | — | projects: travel fields; org_settings: fuel prices |
| 019 | ensure_soft_delete_columns | — | Validates soft delete on all tables, RLS policies |

---

## How to Apply Migrations

### Option 1: Via Supabase CLI (Recommended if linked)
```bash
cd /Users/dolho/beyond-pricing/app
npx supabase db push
```
This applies all pending migrations (001-019) in order.

**Status**: Requires project to be linked. Currently not linked locally.

### Option 2: Manual via Supabase Dashboard (Current Best Option)

**Steps**:
1. Go to https://supabase.com → your project (wjzcutnjnzxylzqysneg)
2. SQL Editor → New Query
3. Copy entire contents of `001_initial_schema.sql`
4. Execute (copy, paste, run in SQL editor)
5. Repeat for 002-019 in order

**Time**: ~5 minutes per migration × 19 migrations = ~95 minutes total

**Can be parallelized**: Migrations 002 and 006 are only seeding (no table dependencies), so you can run those after 001 completes.

### Option 3: Via Vercel Deployment Hook (If available)

Can set up an automatic migration deployment hook in Vercel, but would need to configure first.

---

## Post-Migration Validation

After applying all migrations, run audit again:

```bash
export $(cat .env.local | xargs) && npx tsx scripts/audit-schema-gaps-standalone.ts
```

**Expected Output**:
```
✅ projects (14 cols)    — including all logistics fields
✅ checklists (5 cols)
✅ templates (5 cols)
✅ clients (4 cols)
✅ crm_contacts (9 cols)
... (all 28 tables green)

📋 SUMMARY:
   Missing tables: 0
   Missing columns: 0
   Status: ✅ READY
```

---

## Critical Path Forward

### Phase 1: Apply Migrations (BLOCKER)
- [ ] Link Supabase locally OR apply via dashboard
- [ ] Run migrations 001-019 in order
- [ ] Verify with audit script (expect 0 errors)
- [ ] **Estimated time**: 30-120 minutes

### Phase 2: Verify RLS Policies (Depends on Phase 1)
Once migrations applied, check Supabase dashboard:
```sql
SELECT * FROM pg_policies
WHERE tablename IN ('projects', 'checklists', 'clients', 'journal_entries', 'tasks', 'crm_contacts');
```
Should see RLS policies for each table.

### Phase 3: Fix Refetch Loops (Depends on Phase 1)
With tables now in schema, refetch loop fixes will work properly.

### Phase 4: CRUD Testing (Depends on Phases 1-3)
- Create project → verify location fields save
- Create checklist → verify appears in list
- Create journal entry → verify user-only access
- Test CRM features
- etc.

---

## Technical Details

### Why Most Tables Are Missing

**Current Schema Cache Size**: ~1 table
**Expected Schema Size**: 28 tables with RLS policies

The Supabase project appears to be either:
1. **Completely new** (only projects table manually created)
2. **Migrations never pushed** (local files not applied to remote)
3. **Database corrupted/reset** (tables deleted but migrations still exist)

### Why Projects Table Exists But Incomplete

The `projects` table was likely created manually or via early partial migration, but:
- Missing logistics columns (added in migrations 014, 018)
- Missing ownership/soft-delete (added in migrations 008, 017)
- Missing RLS policies (added across 008, 013, 017)

### Why Templates Table Exists

`templates` was created in migration 001, so it exists, but likely:
- No RLS policies (need to verify)
- No data (seeding happens in migration 002)
- May not be accessible due to missing team_members org context

---

## Schema Alignment Plan Going Forward

### Immediate (Next 30-120 minutes)
- [ ] Apply migrations 001-019
- [ ] Run audit → verify 0 errors
- [ ] Check Supabase dashboard for table list

### Short-term (Next 2-4 hours after migrations)
- [ ] Fix refetch loops in 8 pages (REFETCH_LOOPS_FIX.md)
- [ ] Fix RBAC issues (org_role vs project_role)
- [ ] Test CRUD operations

### Medium-term (Next 1-2 days)
- [ ] Enhance diagnostics page with real-time schema reporting
- [ ] Update documentation with migration success
- [ ] Prepare PR: `fix/db-schema-alignment-and-crud`

---

## Files Reference

- **Migrations**: `/supabase/migrations/001-019_*.sql`
- **Audit Tool**: `/scripts/audit-schema-gaps-standalone.ts`
- **RLS Patterns**: Last section of each migration file (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
- **Documentation**:
  - `MIGRATION_GUIDE.md` — Deployment instructions
  - `SCHEMA_ALIGNMENT_PLAN.md` — Complete table inventory
  - `REFETCH_LOOPS_FIX.md` — Code patterns for infinite loop fixes

---

## Next Steps

1. **Immediately**: Apply migrations 001-019 to Supabase (via dashboard or CLI)
2. **After migrations**: Run audit again to verify success
3. **Then**: Proceed with refetch loop fixes and RBAC alignment
4. **Finally**: CRUD testing and PR

**Do not proceed with code changes until migrations are applied.** Code will continue to fail without schema.

---

**Generated by**: Schema Audit Tool
**Timestamp**: February 24, 2026
**Status**: 🔴 Awaiting migration deployment
**Next Update**: After migrations applied
