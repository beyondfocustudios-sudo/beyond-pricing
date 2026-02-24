# 🗂️ Database Migration Guide

## Overview

The Beyond Pricing app uses Supabase with automatic migrations managed via the CLI. This guide explains the migration structure and how to apply them.

## Migration Order & Purposes

| # | Migration | Purpose | Key Changes |
|---|-----------|---------|-------------|
| 001 | `initial_schema` | Foundation tables | orgs, users, projects, checklists, templates, clients, CRM, messaging |
| 002 | `seed_templates` | Initial data | Premium template seeds |
| 003 | `client_portal_rbac` | Portal features | Portal pages, briefs, deliverables, approvals, requests |
| 004 | `portal_messaging` | Portal messaging | Conversations, messages, message_reads, audit_log |
| 005 | `premium_features` | Premium tier | Packing lists, guardrails, scenarios, budget versions, rates, preferences |
| 006 | `seed_checklist_templates` | Seed data | Initial checklist templates |
| 007 | `admin_bootstrap` | Bootstrap helper | Bootstrap function for initial setup |
| 008 | `rbac_soft_delete` | Soft delete pattern | Audit log triggers, soft delete on tables |
| 009 | `portal_enhancements` | Portal UI | Portal enhancements and refinements |
| 010 | `dropbox_sync` | Dropbox integration | Dropbox connections, sync log, file associations |
| 011 | `callsheets_weather` | Call sheets & weather | Call sheets, people, schedule; weather_cache |
| 012 | `crm_deals_pipeline` | CRM pipeline | CRM stages, deals, activities, commercial terms |
| 013 | `org_clients_rbac` | Org-level clients | Client org association, RLS fixes |
| 014 | `project_geo_weather` | Geo & weather | Projects location fields, logistics_routes table |
| 015 | `fix_conversations_rls` | RLS fix | Conversations/messages RLS improvements |
| 016 | `catalog_presets` | Catalog items | Catalog presets for item templates |
| 017 | `stabilize_rls_schema` | Core stabilization | Project auto-member trigger, RLS hardening |
| 018 | `weather_logistics_refactor` | Weather & logistics | Location fields, org fuel settings, weather caching |
| 019 | `ensure_soft_delete_columns` | Soft delete validation | Ensures all tables have deleted_at, updates RLS policies |

## Applying Migrations to Supabase

### Automatic (Recommended)

1. **Push pending migrations**:
   ```bash
   cd app
   npx supabase db push
   ```
   This pushes any migrations in `supabase/migrations/` that haven't been applied yet.

2. **Verify in Supabase dashboard**:
   - Go to https://supabase.com → your project
   - SQL Editor → Look for applied migrations in public schema
   - Check that latest migration version is 019

### Manual (if needed)

If automatic push fails, you can manually run migrations:

1. Copy SQL from `supabase/migrations/019_ensure_soft_delete_columns.sql` (the latest)
2. In Supabase SQL Editor, paste and run the entire script
3. Verify no errors appear
4. If migration 019 fails, try 018 first, then 019

## Troubleshooting

### "Table not found" error in diagnostics

**Cause**: Migrations not applied to your Supabase instance.

**Fix**:
```bash
npx supabase db push
```

### "Permission denied" or "violates RLS policy"

**Cause**: RLS policies don't match user's role/org membership.

**Fix**:
1. Ensure user has a `team_members` row with their org
2. Check `/app/diagnostics` for org role status
3. If "No org role", run bootstrap:
   ```bash
   curl -X POST https://your-app.vercel.app/api/admin/bootstrap \
     -H "Authorization: Bearer YOUR_JWT_TOKEN"
   ```

### "Cannot insert NULL into..."

**Cause**: Required fields missing (often `org_id` or `owner_user_id`).

**Fix**: Check the code - when inserting, ensure all required fields are populated:
- Projects: `owner_user_id` (will trigger auto-member creation)
- Templates/Checklists/etc: user/org context set
- Clients: org_id set from current org

## Deployment Checklist

- [ ] All migrations pushed: `npx supabase db push`
- [ ] Diagnostics page shows all tables green: `/app/diagnostics`
- [ ] Org role visible in diagnostics (not "No role")
- [ ] Can create a test project → verify it shows in list
- [ ] Can edit project → save → verify RLS allows update
- [ ] Can soft-delete project → verify deleted_at is set (check DB)

## Notes

- **Soft delete**: Projects/checklists/etc use `deleted_at` column, not hard DELETE
- **RLS pattern**: `team_members` = org membership; `project_members` = project access
- **Trigger**: Inserting a project auto-creates a `project_members` row with the `owner_user_id`
- **Bootstrap**: New users need a `team_members` row to see/create org content (run bootstrap via API)

## File Locations

- Migrations: `supabase/migrations/*.sql`
- Schema checks: `/app/src/app/diagnostics/page.tsx` (table test list)
- RLS policies: Last section of each migration file (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`)
