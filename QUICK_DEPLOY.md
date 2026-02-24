# ⚡ Quick Deploy Instructions

**File**: `supabase/schema.deploy.sql`
**Time**: 5 min setup + 30-40 min execution
**Safety**: High (IF NOT EXISTS throughout)

---

## 3-Step Deploy

### Step 1: Copy Deploy File (1 min)

```bash
cd /Users/dolho/beyond-pricing/app
cat supabase/schema.deploy.sql | pbcopy  # macOS
# or
cat supabase/schema.deploy.sql | xclip -selection clipboard  # Linux
```

### Step 2: Paste & Run in Supabase (40 min)

```
1. Open: https://app.supabase.com/project/wjzcutnjnzxylzqysneg
2. Go to: SQL Editor → New Query
3. Paste (Cmd+V)
4. Click: RUN
5. Wait for: "Query succeeded"
```

### Step 3: Verify Success (2 min)

```bash
export $(cat .env.local | xargs) && npx tsx scripts/audit-schema-gaps-standalone.ts
```

**Expected output**:
```
✅ projects (14 cols) ✅ checklists ✅ templates ... (28 total)
Status: ✅ READY
```

---

## That's It! 🎉

After verification shows ✅ READY:

### Next: Code Fixes (~3-4 hours)
See: `NEXT_STEPS.md`
1. Fix refetch loops (8 files)
2. Fix RBAC (clients page)
3. Test CRUD operations
4. Prepare PR

---

## If Something Goes Wrong

### Error: "relation already exists"
→ Safe to ignore, continue running

### Error: "permission denied"
→ Refresh Supabase page, try again

### Query hangs
→ Wait up to 5 minutes, don't refresh

### Need rollback
→ See: `supabase/schema.rollback-notes.md`

---

## What Gets Deployed

✅ 28 tables (core, CRM, portal, user data, etc.)
✅ 150+ columns including projects: location_*, travel_*, deleted_at
✅ 50+ RLS policies (full access control)
✅ Soft delete pattern (all critical tables)
✅ 3 functions + 10+ triggers

---

## Details

- **Deploy file**: ~3000 lines SQL
- **All migrations**: 001-019 included
- **Safety**: Uses IF NOT EXISTS patterns
- **Speed**: ~30-40 minutes total
- **Idempotent**: Safe to re-run if interrupted

---

**Status**: Ready to deploy
**Start**: 1. Copy deploy file
**Time**: ~45 minutes total
**Then**: Proceed to code fixes
