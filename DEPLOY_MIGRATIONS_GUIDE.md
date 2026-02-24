# 🚀 Deploy Migrations to Supabase — Step-by-Step Guide

**Status**: 🔴 CRITICAL — No migrations applied yet
**Supabase Project**: wjzcutnjnzxylzqysneg
**Action**: Follow this guide to apply all 19 migrations

---

## Quick Start (Estimated Time: 30-90 minutes)

### Step 1: Go to Supabase Dashboard
```
https://app.supabase.com/project/wjzcutnjnzxylzqysneg
```

### Step 2: Open SQL Editor
```
Left sidebar → SQL Editor → New Query
```

### Step 3: Run Migrations in Order

Copy each migration file content and execute:

```
migrations/
  001_initial_schema.sql          ← START HERE
  002_seed_templates.sql          ← Run after 001
  003_client_portal_rbac.sql      ← Run after 002
  004_portal_messaging.sql        ← Run after 003
  ... (continue through 019)
  019_ensure_soft_delete_columns.sql ← LAST
```

---

## Detailed Steps

### Migration 1: Initial Schema (Foundation)

**File**: `supabase/migrations/001_initial_schema.sql`

1. In Supabase SQL Editor, create new query
2. Click "📄 Open file" or copy entire file content
3. Paste all of `001_initial_schema.sql`
4. Click "RUN" (top right)
5. Wait for success message (should show "Query succeeded")
6. ✅ Should create: rates, preferences, projects, templates, checklists, checklist_items, clients, client_users, crm_contacts, crm_deals, crm_companies, crm_activities, crm_stages

**Expected Output**:
```
Query succeeded (12 rows affected)
```

**Verify**: In Table Inspector (left sidebar), you should now see:
- ✅ projects
- ✅ templates
- ✅ checklists
- ... (13 total tables)

---

### Migration 2: Seed Templates (Data Population)

**File**: `supabase/migrations/002_seed_templates.sql`

1. Create new query
2. Paste entire `002_seed_templates.sql`
3. Run
4. ✅ Populates default templates

**Expected Output**:
```
Query succeeded
```

---

### Migrations 3-19: Repeat Pattern

For each migration file (003 through 019):

1. **Open** `supabase/migrations/NNN_*.sql`
2. **Copy all content**
3. **In Supabase SQL Editor**: New Query → Paste → Run
4. **Wait** for "Query succeeded"
5. **Move to next** migration

**Order is important** — migrations build on each other:
- 003 depends on 001
- 004 depends on 003
- 005 depends on 004
- ... etc.

---

## Key Migrations

### Critical for Full App Function

| # | File | Purpose | Tables Created | Time |
|---|------|---------|-----------------|------|
| 001 | initial_schema | **FOUNDATION** | 13 tables | 2 min |
| 002 | seed_templates | Template data | — | 1 min |
| 003 | client_portal_rbac | Portal features | 5 tables | 2 min |
| 004 | portal_messaging | Messaging | 3 tables | 2 min |
| 005 | premium_features | Premium tier | 5 tables | 2 min |
| 008 | rbac_soft_delete | **SOFT DELETE** | — | 2 min |
| 010 | dropbox_sync | Dropbox integration | 3 tables | 2 min |
| 011 | callsheets_weather | Call sheets | 4 tables | 2 min |
| 012 | crm_deals_pipeline | **CRM CORE** | 4 tables | 2 min |
| 013 | org_clients_rbac | Org-level access | — | 1 min |
| 014 | project_geo_weather | Location/weather | 2 tables | 2 min |
| 017 | stabilize_rls_schema | **RLS HARDENING** | — | 2 min |
| 018 | weather_logistics_refactor | **LOGISTICS** | — | 2 min |
| 019 | ensure_soft_delete_columns | Soft delete validation | — | 1 min |

**Total time**: ~30 minutes if done sequentially

---

## How to Access Migration Files

### Option A: From File System (Recommended)
```bash
# Navigate to project
cd /Users/dolho/beyond-pricing/app

# View migration
cat supabase/migrations/001_initial_schema.sql

# Copy entire file
cat supabase/migrations/001_initial_schema.sql | pbcopy  # macOS
# Or on Linux: | xclip -selection clipboard
```

### Option B: From IDE
- Open VS Code/editor
- Navigate to `supabase/migrations/`
- Open each file
- Select All (Cmd+A) → Copy (Cmd+C)

### Option C: Upload via Supabase UI
- Some versions of Supabase allow direct file upload
- Check SQL Editor for "Upload" button

---

## Troubleshooting

### Error: "relation already exists"
**Cause**: Migration already partially applied
**Solution**:
- Click "Cancel"
- Check which table caused error: `CREATE TABLE IF NOT EXISTS` should prevent this
- Run migrations after failed one

### Error: "permission denied"
**Cause**: JWT not valid or insufficient permissions
**Solution**:
- Refresh page (https://app.supabase.com)
- Check you're logged in to correct org/project
- Use service role key if available

### Error: "column does not exist"
**Cause**: Running migration out of order
**Solution**:
- Verify you ran migrations 1-19 in order
- Check previous migration succeeded
- Restart from migration that failed

### Query never completes
**Cause**: Large migration taking time or connection timeout
**Solution**:
- Wait up to 5 minutes (some migrations are large)
- If still hanging: reload page, check if migration actually applied
- Run diagnostic: `SELECT COUNT(*) FROM projects;` to verify

---

## Verification After All Migrations

### Step 1: List Tables in Supabase Dashboard
```
Left sidebar → Table Inspector
Should see 28+ tables:
✅ projects
✅ checklists
✅ templates
✅ clients
✅ crm_contacts
... (all from SCHEMA_AUDIT_RESULTS.md)
```

### Step 2: Run Schema Audit
```bash
cd /Users/dolho/beyond-pricing/app
export $(cat .env.local | xargs) && npx tsx scripts/audit-schema-gaps-standalone.ts
```

**Expected Output**:
```
📊 SCHEMA GAP AUDIT

✅ projects (14 cols)
✅ checklists (5 cols)
✅ templates (5 cols)
... (all 28 tables)

📋 SUMMARY:
   Missing tables: 0
   Missing columns: 0
   Status: ✅ READY
```

### Step 3: Check Specific Table
In Supabase SQL Editor:
```sql
-- Verify projects table has new columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects'
ORDER BY ordinal_position;

-- Should include:
-- id (uuid)
-- project_name (text)
-- owner_user_id (uuid)
-- location_text (text)
-- location_lat (numeric)
-- location_lng (numeric)
-- travel_km (numeric)
-- travel_minutes (integer)
-- deleted_at (timestamptz)
-- ... others
```

---

## After Migrations Are Applied

### Next Phase: Fix Refetch Loops
Once all migrations succeed, proceed with:
1. Fix 8 files with refetch loops (REFETCH_LOOPS_FIX.md)
2. Fix RBAC issues (clients page access control)
3. Test CRUD operations
4. Prepare PR: `fix/db-schema-alignment-and-crud`

**Do not proceed to code fixes until all migrations are applied.**

---

## Alternative: Via CLI (If You Want to Link Project)

**Requires**: Supabase CLI installed locally

```bash
cd /Users/dolho/beyond-pricing/app

# Link project (interactive)
npx supabase link --project-ref wjzcutnjnzxylzqysneg

# Set environment (will ask for token)
# You'll need: SUPABASE_ACCESS_TOKEN from https://app.supabase.com/account/tokens

# After linking, push all migrations
npx supabase db push

# Verify
npx supabase migration list
```

This is faster (1 command instead of 19), but requires local setup.

---

## Summary

| Step | Action | Time | Success Indicator |
|------|--------|------|------------------|
| 1 | Open Supabase SQL Editor | 1 min | "New Query" button visible |
| 2 | Run migrations 001-019 | 30 min | All 19 queries succeed |
| 3 | Verify tables in Table Inspector | 2 min | 28 tables visible |
| 4 | Run audit script | 2 min | 0 missing tables, 0 missing columns |
| 5 | Start code fixes | — | Ready for REFETCH_LOOPS_FIX.md |

**Total time to migrate**: ~35 minutes
**Total time to verify**: ~5 minutes
**Ready for code work**: ~40 minutes from now

---

**Generated by**: Schema Audit Process
**Date**: February 24, 2026
**Next Checkpoint**: Run audit after completing all 19 migrations
**Status**: Awaiting manual deployment
