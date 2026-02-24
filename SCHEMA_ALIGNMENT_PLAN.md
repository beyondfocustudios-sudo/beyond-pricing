# 🗄️ Schema Alignment Plan

**Objective**: Ensure Supabase schema matches all code queries (28 tables, 150+ columns)
**Status**: Audit complete, ready for migration strategy
**Branch**: `fix/db-schema-alignment-and-crud`

---

## 1. Complete Table Inventory

### ✅ LIKELY EXIST (from migrations 001-019)
- projects, conversations, messages, message_reads
- crm_contacts, crm_deals, crm_companies, crm_stages, crm_activities
- checklists, checklist_items, templates, template_items
- project_members, project_dropbox, deliverable_files
- call_sheets, call_sheet_people, call_sheet_schedule
- logistics_routes, catalog_items
- team_members, organizations, org_settings, preferences
- notifications, email_outbox
- journal_entries, tasks
- clients, client_users
- weather_cache

### ⚠️ VERIFY & POTENTIALLY CREATE
- Each table above needs column verification
- RLS policies need to be validated
- Indexes for performance need to be present

---

## 2. Critical Column Additions Needed

### projects
```sql
-- Migration 018 should have added these:
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_text text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_lat numeric(10,7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_lng numeric(10,7);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_address text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS travel_km numeric(8,2);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS travel_minutes integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS logistics_start_date date;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS logistics_end_date date;
-- Migration 008 should have added:
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
-- Missing possible:
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id);
```

### org_settings
```sql
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS diesel_price_per_liter numeric(6,3) DEFAULT 1.50;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS petrol_price_per_liter numeric(6,3) DEFAULT 1.65;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS avg_fuel_consumption_l_per_100km numeric(5,2) DEFAULT 7.5;
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS default_work_location_lat numeric(10,7);
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS default_work_location_lng numeric(10,7);
ALTER TABLE org_settings ADD COLUMN IF NOT EXISTS default_work_location_name text;
```

### Soft Delete Consistency
Migration 019 should ensure ALL tables have:
```sql
ALTER TABLE {table_name} ADD COLUMN IF NOT EXISTS deleted_at timestamptz DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_{table_name}_deleted_at ON {table_name}(deleted_at) WHERE deleted_at IS NULL;
```

---

## 3. Next Steps

### Step 1: Run Schema Audit
```bash
cd app
npx tsx scripts/audit-schema-gaps.ts
```

This will report:
- ✅ Tables that exist with all columns
- ⚠️ Tables with missing columns
- ❌ Tables completely missing

### Step 2: Generate Needed Migrations
Based on audit results, create migrations (020, 021, etc.):
- Add missing columns
- Create missing tables (if any)
- Add missing indexes
- Ensure RLS policies exist

### Step 3: Fix Loop Issues
Identify and fix infinite refetch loops in:
- `/app/projects/page.tsx` — projects list
- `/app/checklists/page.tsx` — checklists list
- `/app/templates/page.tsx` — templates
- `/app/clients/page.tsx` — clients
- `/app/inbox/page.tsx` — conversations (if exists)
- `/app/journal/page.tsx` — journal entries
- `/app/tasks/page.tsx` — tasks (if exists)
- `/app/crm/page.tsx` — CRM
- `/app/callsheets/page.tsx` — call sheets
- `/app/api/` routes — API fetches

**Pattern to fix**:
```typescript
// ❌ BEFORE: Infinite loop
useEffect(() => {
  loadData(); // This might re-run if dependency array is wrong
}, [loadData]); // loadData recreated every render

// ✅ AFTER: Fetch once, then show error state
useEffect(() => {
  loadData();
}, []); // Empty deps — fetch once on mount

// Show error state if loading fails
if (error) {
  return (
    <div>
      <p>Erro ao carregar: {error.message}</p>
      <button onClick={() => loadData()}>Tentar Novamente</button>
    </div>
  );
}
```

### Step 4: RBAC & Access Control
**Clients page** (`/app/clients`):
- ✅ Should require `org_role` (owner/admin)
- ❌ Should NOT be accessible by project-only members
- ✅ Check: user has `team_members` row with `org_id`

**Journal** (`/app/journal`):
- ✅ Should be user-only (owner can't see others)
- ✅ `journal_entries.user_id = auth.uid()`

**Projects**:
- ✅ Team members see all org projects
- ✅ RLS: `team_members(user_id)` OR `project_members(user_id)`

---

## 4. Testing Workflow

After migrations applied, test each feature:

### Projects
```bash
1. Go to /app/projects
2. Click "Novo Projeto"
3. Fill name + client
4. Submit → Should appear in list
5. Click project → Details open
6. Edit name → Save → Name updates
7. Go to Logística tab → Enter city → Shows distance/weather
8. Go to header → Click trash → Delete modal → "Arquivar"
9. Go back to list → Project should not appear
10. Check Supabase: projects.deleted_at should be set
```

### Checklists
```bash
1. Go to /app/checklists
2. Click "+ Novo"
3. Create checklist → Should appear
4. Click to open → Add items
5. Check/uncheck items → Should persist
6. Delete item → Should be removed from list
7. Delete checklist → Should disappear from list
```

### Clients
```bash
1. Go to /app/clients
2. Should show org clients (NOT project-specific)
3. Add new client → Should be org-wide visible
4. Try to access with non-admin user → Should get "Access denied"
```

### Journal
```bash
1. Go to /app/journal
2. Create entry → Should appear
3. Edit entry → Save → Updates
4. Login as different user → Should NOT see other user's entries
```

### Tasks
```bash
1. Go to /app/tasks
2. Create task → Appears
3. Change status → Updates
4. Delete task → Removed from list
```

---

## 5. Diagnostics Page Update

Update `/app/diagnostics/page.tsx` to show:

```typescript
const SCHEMA_CHECKS = {
  // Tables
  projects: { status: "ok" | "error", columns: ["id", "name", ...] },
  checklists: { ... },
  // ... all 28 tables
};

// Show per-table results
SCHEMA_CHECKS.forEach(table => {
  if (table.status === "ok") {
    console.log(`✅ ${table.name}`);
  } else {
    console.log(`❌ ${table.name}: columns missing = ${table.missingCols.join(", ")}`);
  }
});
```

---

## 6. Deployment Order

1. **Merge PR to main**
2. **Run audit**: `npx tsx scripts/audit-schema-gaps.ts`
3. **Apply missing migrations**: `npx supabase db push`
4. **Run CRUD tests** (each feature)
5. **Check diagnostics**: All tables green
6. **Monitor Vercel logs**

---

## 7. File Changes Expected

**New/Modified**:
- `scripts/audit-schema-gaps.ts` — Schema audit tool
- `supabase/migrations/020_*.sql` — Fill gaps (if needed)
- Various page components — Remove refetch loops
- `src/app/diagnostics/page.tsx` — Enhanced reporting

**No deletions** — Only additive changes

---

## 8. Known Issues to Fix

1. **Refetch Loops**
   - Some pages may refetch continuously
   - Root cause: `useCallback` dependencies or `loadData` in deps
   - Fix: Use `useCallback` with correct deps, or move to one-time fetch

2. **Missing Columns**
   - Some expected columns may not exist in Supabase
   - Fix: Run audit → Generate migrations → Apply

3. **RLS Policies**
   - Some tables may not have policies or they may be too restrictive
   - Fix: Ensure policies allow org access + owner-only where needed

---

## References

- **Code audit**: 28 tables identified, all operations (S/I/U/D) logged
- **Migration history**: 19 migrations currently exist (001-019)
- **This document**: Complete alignment strategy
- **Audit script**: `/scripts/audit-schema-gaps.ts`

---

**Status**: 🟡 Ready to execute schema alignment
**Next**: Run audit script to identify exact gaps

