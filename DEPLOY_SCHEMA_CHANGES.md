# 📊 Schema Deploy — Complete Change List

**Deploy File**: `supabase/schema.deploy.sql`
**Total Migrations**: 19
**Total Tables**: 28 new tables
**Total Columns**: 150+ across all tables
**Total Functions**: 5 (admin helpers, triggers)
**Total Policies**: 50+ RLS policies

---

## Tables Created (28 Total)

### Core (3)
- `rates` - User/org pricing configuration
- `preferences` - User settings (IVA regime, margins, language)
- `organizations` - Organization/company

### Projects (5)
- `projects` - Main project data + location/travel/logistics fields
- `project_members` - Project access control (auto-populated via trigger)
- `checklists` - Project checklists
- `checklist_items` - Items in checklists
- `templates` - Preset templates (institutional, shortform, etc.)

### Templates (1)
- `template_items` - Items in templates

### CRM (5)
- `crm_contacts` - Contact database
- `crm_deals` - Sales pipeline deals
- `crm_companies` - Company data
- `crm_stages` - Pipeline stages
- `crm_activities` - Activity tracking (emails, calls, notes)

### User Data (4)
- `journal_entries` - User journal (private, user-only)
- `tasks` - Task management
- `team_members` - Organization membership + roles
- `client_users` - Portal user access

### Clients (2)
- `clients` - Client organization
- `organizations` - Linked to client_users

### Portal (5)
- `portal_pages` - Portal pages
- `portal_briefs` - Project briefs
- `portal_deliverables` - Deliverable tracking
- `portal_approvals` - Approval workflow
- `portal_requests` - Client requests

### Messaging (4)
- `conversations` - Client conversations/threads
- `messages` - Individual messages
- `message_reads` - Message read tracking
- `audit_log` - Activity log

### Project Delivery (5)
- `call_sheets` - Call sheet management
- `call_sheet_people` - People in call sheets
- `call_sheet_schedule` - Schedule/timeline
- `deliverable_files` - File management
- `project_dropbox` - Dropbox integration metadata

### Integration (3)
- `dropbox_connections` - Dropbox connection config
- `sync_log` - Sync history
- `file_associations` - File/project associations

### Data & Premium (8)
- `logistics_routes` - Route tracking
- `catalog_items` - Item catalog + presets
- `packing_lists` - Premium packing lists
- `guardrails` - Budget guardrails
- `scenarios` - What-if scenarios
- `budget_versions` - Budget snapshots
- `weather_cache` - API response caching
- `org_settings` - Organization settings (fuel prices, work location, etc.)

### Admin (2)
- `notifications` - User notifications
- `email_outbox` - Email queue

---

## Critical Column Additions to Projects Table

### Before Deploy
```
projects (6 columns):
  - id (uuid)
  - user_id (uuid)
  - project_name (text)
  - client_name (text)
  - status (text)
  - inputs (jsonb)
  - calc (jsonb)
```

### After Deploy
```
projects (14+ columns):
  - id (uuid)
  - user_id (uuid)
  - project_name (text)
  - client_name (text)
  - status (text)
  - inputs (jsonb)
  - calc (jsonb)
  - created_at (timestamptz)          ← NEW
  - updated_at (timestamptz)          ← NEW
  - owner_user_id (uuid)              ← NEW (critical for ownership)
  - deleted_at (timestamptz)          ← NEW (soft delete)
  - location_text (text)              ← NEW (address)
  - location_lat (numeric)            ← NEW (latitude)
  - location_lng (numeric)            ← NEW (longitude)
  - location_address (text)           ← NEW (full address)
  - travel_km (numeric)               ← NEW (distance)
  - travel_minutes (integer)          ← NEW (duration)
  - logistics_start_date (date)       ← NEW
  - logistics_end_date (date)         ← NEW
```

---

## Soft Delete Pattern Applied

### Tables with deleted_at Column
All critical tables get soft delete support:
- projects
- checklists
- templates
- clients
- journal_entries
- tasks
- crm_contacts
- crm_deals
- call_sheets
- catalog_items
- portal_deliverables
- portal_requests

### Soft Delete Behavior
```sql
-- When deleted_at is set, record is "deleted" but data persists
-- RLS policies automatically filter: WHERE deleted_at IS NULL
-- To soft-delete a record:
UPDATE projects SET deleted_at = NOW() WHERE id = ...

-- To restore:
UPDATE projects SET deleted_at = NULL WHERE id = ...

-- To permanently delete (if needed):
DELETE FROM projects WHERE deleted_at < NOW() - INTERVAL '90 days'
```

---

## RLS Policies Implemented

### By Access Level

#### User-Level Access (personal data)
- `preferences` - User can only see/edit their own
- `rates` - User can only see/edit their own
- `journal_entries` - User can only see/edit their own
- `tasks` - User can only see/edit their own
- `notifications` - User can only see/edit their own

#### Project-Level Access
- `projects` - User can see/edit if user_id matches OR member of project
- `checklists` - User can see if member of project
- `checklist_items` - User can see/edit if member of project's checklist
- `templates` - User can see if user_id matches or is NULL (public)
- `template_items` - User can see if template accessible
- `call_sheets` - User can see if member of project
- `logistics_routes` - User can see if project member
- `deliverable_files` - User can see if project member

#### Organization-Level Access
- `clients` - User must be org owner/admin
- `team_members` - User can see org members if member of org
- `org_settings` - User can edit if org owner/admin
- `catalog_items` - User can edit if org owner/admin

#### Portal Access (Special)
- Portal users (non-auth) can see:
  - portal_pages (shared)
  - portal_briefs (shared)
  - portal_deliverables (shared)
  - portal_approvals (their approvals only)
  - portal_requests (their requests only)

---

## Triggers Created

### Automatic Timestamp Updates
```sql
-- update_updated_at trigger on:
-- - projects
-- - preferences
-- - templates
-- - clients
-- - crm_deals
-- - journal_entries
-- - tasks
-- - call_sheets
-- - team_members
-- - org_settings

-- Updates updated_at column to NOW() on every UPDATE
```

### Project Member Auto-Population
```sql
-- project_auto_add_owner trigger
-- When project created, automatically adds creator as project_member with 'owner' role

-- When: INSERT INTO projects
-- Effect: Automatically inserts into project_members with user_id and role='owner'
```

### Soft Delete Validation
```sql
-- Ensures deleted_at columns exist and indexes exist for performance
-- Validates RLS policies check deleted_at IS NULL
```

---

## Functions Created

### Admin Bootstrap Function
```sql
-- bootstrap_owner_for_org(owner_email text, org_name text)
-- Creates or updates organization with owner
-- Used during initial setup via OWNER_EMAIL environment variable
```

### Soft Delete Trigger Functions
```sql
-- update_updated_at()
-- Automatically updates updated_at timestamp on record change
```

---

## Indexes Created

### Performance Indexes
- `projects(user_id)` - Fast lookup by user
- `projects(deleted_at)` - Fast filtering of deleted records
- `checklists(project_id)` - Fast lookup by project
- `checklists(deleted_at)` - Fast filtering
- `journal_entries(user_id)` - Fast lookup by user
- `journal_entries(deleted_at)` - Fast filtering
- `tasks(user_id)` - Fast lookup by user
- `tasks(deleted_at)` - Fast filtering
- `crm_contacts(user_id)` - Fast lookup by user
- `crm_deals(user_id)` - Fast lookup by user
- `clients(deleted_at)` - Fast filtering
- `team_members(org_id)` - Fast lookup by org
- `team_members(user_id)` - Fast lookup by user
- `project_members(project_id)` - Fast lookup by project
- `project_members(user_id)` - Fast lookup by user
- `catalog_items(org_id)` - Fast lookup by org
- `catalog_items(deleted_at)` - Fast filtering

---

## Breaking Changes for Code

### What Works Now (Was Broken Before)
- ✅ Create/read checklists → table exists, RLS enforced
- ✅ Manage clients org-wide → clients table exists, org_role enforced
- ✅ Use CRM → all 5 tables exist with RLS
- ✅ Write journal → journal_entries table exists, user-only access
- ✅ Track tasks → tasks table exists, user-only access
- ✅ Organize call sheets → call_sheets tables exist
- ✅ Save location/travel data → projects.location_* columns exist
- ✅ Track project ownership → owner_user_id column exists
- ✅ Soft delete → deleted_at columns exist + RLS filters

### What Requires Code Updates
- `project_members` auto-populated: code no longer needs to manually add owner
- RLS policies now enforced: code must not bypass them
- Soft delete: code must use `deleted_at` for deletion, not hard DELETE
- Org access control: clients page now requires org_role, not project_role

---

## Verification Checklist

After deployment, verify:

- [ ] Table count: `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'` → 28
- [ ] Projects columns: 14+ including location_*, travel_*, deleted_at, owner_user_id
- [ ] RLS policies: `SELECT COUNT(*) FROM pg_policies WHERE tablename IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public')` → 50+
- [ ] Soft delete indexes: `SELECT * FROM pg_indexes WHERE indexname LIKE '%deleted_at%'`
- [ ] Audit script: `npx tsx scripts/audit-schema-gaps-standalone.ts` → ✅ READY
- [ ] Can create project with location: project saved with location_text, location_lat, location_lng
- [ ] Soft delete works: UPDATE project SET deleted_at = NOW(), verify RLS filters it out
- [ ] CRM accessible: can create crm_contacts, crm_deals
- [ ] Journal accessible: can create journal_entries (user-only)
- [ ] RLS enforced: query from different user should not see another user's data

---

## Summary of Impact

### Database Before Deploy
```
Tables: 2 (projects, templates)
Columns in projects: 6
RLS: Not enforced
Soft delete: Not supported
Ownership tracking: Not supported
Location data: Not supported
```

### Database After Deploy
```
Tables: 28
Columns in projects: 14+
RLS: Fully enforced (50+ policies)
Soft delete: Supported (all critical tables)
Ownership tracking: owner_user_id column
Location data: location_*, travel_* columns
Functions: 3 (bootstrap, update_at, soft_delete)
Triggers: 10+ (auto-update, auto-member, etc.)
```

### Code Impact
```
🟢 Now works: Checklists, clients, CRM, journal, tasks, logistics
🟡 Needs updates: RBAC fixes (org_role), refetch loop fixes
🔴 Breaking: Hard DELETE no longer works (use soft delete)
```

---

## Rollback Notes

**See**: `supabase/schema.rollback-notes.md`

For rollback instructions, checkpoints, and troubleshooting.

---

## Files
- **Deploy**: `supabase/schema.deploy.sql`
- **Rollback Notes**: `supabase/schema.rollback-notes.md`
- **Deployment Guide**: `DEPLOY_MIGRATIONS_GUIDE.md`
- **Audit Script**: `scripts/audit-schema-gaps-standalone.ts`
- **Original Migrations**: `supabase/migrations/001-019_*.sql`
