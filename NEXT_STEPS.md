# 🎯 Next Steps: DB Alignment & CRUD Stabilization

**Current Status**: Analysis complete, ready for implementation
**Branch**: `fix/stabilize-core-crud-ui`
**Recent Commits**:
- ✅ Build error fixed (geoData reference)
- ✅ Migration 019 added (soft delete validation)
- ✅ Schema audit complete (28 tables identified)
- ✅ Refetch loops analyzed (8+ files need fixes)

---

## Phase 1: Schema Verification (This Week)

### Step 1: Run Schema Audit
```bash
cd /Users/dolho/beyond-pricing/app
npx tsx scripts/audit-schema-gaps.ts
```

**Expected Output**:
```
✅ projects (45 cols)
✅ checklists (12 cols)
...
⚠️ COLUMNS MISSING in org_settings:
   - diesel_price_per_liter
   - petrol_price_per_liter
...
❌ TABLE MISSING: some_table
```

### Step 2: Generate Missing Migrations
Based on audit output, create migrations:

```bash
# Example: If columns missing
# Create: supabase/migrations/020_add_org_settings_fuel.sql
# Create: supabase/migrations/021_add_missing_columns.sql
# etc.
```

### Step 3: Apply to Supabase
```bash
cd /Users/dolho/beyond-pricing/app
npx supabase db push
```

**Verify**: Check Supabase dashboard → All tables present

---

## Phase 2: Fix Refetch Loops (This Week)

### Files to Fix (in priority order):

1. **`/app/app/projects/page.tsx`**
   - Pattern: Basic fetch once
   - Status: Check if `loadProjects` in deps

2. **`/app/app/checklists/page.tsx`**
   - Pattern: Basic fetch once
   - Status: Similar issue

3. **`/app/app/templates/page.tsx`**
   - Pattern: Basic fetch once
   - Status: Similar issue

4. **`/app/app/clients/page.tsx`**
   - Pattern: Fetch role FIRST, then data
   - Status: Needs careful sequencing
   - RBAC: Must check `org_role` not `project_role`

5. **`/app/app/journal/page.tsx`**
   - Pattern: Basic fetch once
   - Status: User-only access

6. **`/app/app/tasks/page.tsx`** (if exists)
   - Pattern: Basic fetch once

7. **`/app/app/crm/page.tsx`**
   - Pattern: Basic fetch once
   - Status: Multiple sub-entities

8. **`/app/app/callsheets/page.tsx`**
   - Pattern: Basic fetch once
   - Status: Similar issue

### How to Fix Each File:

**Template to follow** (from `REFETCH_LOOPS_FIX.md`):

```typescript
// ❌ WRONG
const loadData = useCallback(async () => {...}, []);
useEffect(() => { loadData(); }, [loadData]); // LOOP!

// ✅ CORRECT
useEffect(() => {
  (async () => {...})();
}, []); // Fetch once

// Error handling
if (error) return <ErrorState onRetry={loadData} />;
```

### Verification:
- [ ] Open page
- [ ] Network tab: only 1 initial request
- [ ] No repeated fetches after 5 seconds
- [ ] Error state works + retry button functions

---

## Phase 3: RBAC & Access Control (This Week)

### Clients Page (`/app/app/clients`)
**Current**: May have wrong access checks
**Fix**:
```typescript
// Check org role, NOT project role
const orgRole = await fetch("/api/admin/org-role");
if (!orgRole.isAdmin && !orgRole.isOwner) {
  return <AccessDenied />;
}
```

### Journal (`/app/app/journal/page.tsx`)
**Current**: Likely OK (user-only)
**Verify**: RLS policy `user_id = auth.uid()`

### CRM (`/app/app/crm/page.tsx`)
**Current**: Likely OK (org-level)
**Verify**: RLS allows org members

### Check in Supabase:
```sql
-- Verify RLS policies exist
SELECT * FROM pg_policies WHERE tablename IN (
  'projects', 'checklists', 'clients', 'journal_entries', 'tasks', 'crm_contacts'
);
```

---

## Phase 4: CRUD Testing (This Week)

### Test Each Feature:

#### Projects
- [ ] Create → appears in list
- [ ] Edit name → saves
- [ ] Go to Logística tab → shows weather/distance
- [ ] Delete (soft) → disappears from list
- [ ] Check DB: `deleted_at` set

#### Checklists
- [ ] Create → appears
- [ ] Add items → persist
- [ ] Check/uncheck → updates
- [ ] Delete → removed

#### Clients
- [ ] Create → appears
- [ ] Only visible to org members (not project-only)
- [ ] Non-admin can't access

#### Journal
- [ ] Create entry → appears
- [ ] Edit → saves
- [ ] Other user can't see entries

#### Tasks (if dashboard exists)
- [ ] Create → appears
- [ ] Update status → persists
- [ ] Delete → removed

#### CRM
- [ ] Create contact → appears
- [ ] Edit → saves
- [ ] Delete → removed

#### Call Sheets
- [ ] Create → appears
- [ ] Add people/schedule → persists
- [ ] Delete → removed

---

## Phase 5: Enhanced Diagnostics (End of Week)

Update `/app/app/diagnostics/page.tsx`:

```typescript
// For each of 28 tables, check:
// 1. Table exists
// 2. Expected columns present
// 3. RLS policy exists
// 4. Can SELECT (via RLS)

// Output:
// ✅ projects (35/35 columns, RLS OK, accessible)
// ⚠️ clients (32/35 columns, missing: deleted_at)
// ❌ unknown_table (TABLE NOT FOUND)
```

---

## Documentation Created

### For Developers:
1. **`SCHEMA_ALIGNMENT_PLAN.md`** - Complete schema strategy
2. **`REFETCH_LOOPS_FIX.md`** - Patterns & fixes for fetch loops
3. **`scripts/audit-schema-gaps.ts`** - Automated schema checker
4. **`MIGRATION_GUIDE.md`** - Updated with migrations 018-019
5. **`SPRINT_SUMMARY.md`** - Previous sprint recap
6. **`READY_FOR_MERGE.md`** - Merge checklist

### For This Phase:
- Run audit → identify gaps
- Generate migrations → apply to Supabase
- Fix refetch loops → one file at a time
- Test CRUD → all features
- Update diagnostics → show real status

---

## Timeline Estimate

| Task | Time | Priority |
|------|------|----------|
| Schema audit + gaps | 30 min | 🔴 HIGH |
| Generate + apply migrations | 30 min | 🔴 HIGH |
| Fix refetch loops (8 files × 20 min) | 2-3 hrs | 🟠 MEDIUM |
| RBAC verification | 30 min | 🟠 MEDIUM |
| CRUD testing (8 features × 15 min) | 2 hrs | 🔴 HIGH |
| Diagnostics enhancement | 1 hr | 🟡 LOW |
| **Total** | **~6-7 hrs** | |

---

## Git Commits Expected

1. `docs: complete schema audit and refetch loops analysis` ✅ (done)
2. `fix: resolve schema gaps (migrations 020+)`
3. `fix(refetch): remove infinite loops from 8 pages`
4. `refactor(rbac): align access controls`
5. `test(crud): verify all features work end-to-end`
6. `enhance(diagnostics): real-time schema reporting`
7. `merge: db-schema-alignment-and-crud PR`

---

## Success Criteria

All ✅ before merge:

- [ ] Schema audit shows 0 gaps (all 28 tables, all columns)
- [ ] All migrations applied successfully
- [ ] No refetch loops (DevTools shows single fetch per page)
- [ ] All CRUD operations work (C/R/U/D)
- [ ] Diagnostics page shows all tables green
- [ ] Clients page only accessible to org admins
- [ ] Journal entries user-only visible
- [ ] Build compiles with 0 errors
- [ ] No TypeScript errors
- [ ] Ready for production deployment

---

## Next Action

**Immediate** (Next 15 minutes):
1. Run schema audit
2. Paste output here
3. I'll generate needed migrations

```bash
npx tsx scripts/audit-schema-gaps.ts
```

Then we can proceed with fixes!

---

**Prepared by**: Claude
**Date**: February 24, 2026
**Branch**: fix/stabilize-core-crud-ui
**Status**: 🟡 Awaiting schema audit results

