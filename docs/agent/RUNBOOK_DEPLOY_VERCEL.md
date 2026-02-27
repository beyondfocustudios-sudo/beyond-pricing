# 🚀 Vercel Deployment & Anti-Old-Versions

**How to ensure production always runs the correct version from origin/main.**

---

## Golden Rules

1. **Vercel production alias ONLY pulls from origin/main**
2. **Never manually deploy from feature branches**
3. **/api/version is the source of truth** (not Vercel UI)
4. **Auto-deploy from main is ALWAYS active**

---

## Vercel Deployment Flow

```
origin/main (push) → Vercel auto-detect → Build → Deploy to production alias
                      ↓
                   Check /api/version
                      ↓
                   Confirm branch=main, sha correct
```

**Duration**: ~1-2 minutes from push to live

---

## Prevention: How We Avoid Old Versions

### Problem We Solve

Historically, we sometimes had:
- Preview builds from old branches showing as "production"
- Vercel aliases pointing to wrong branch
- /api/version showing branch != "main" in production
- Confusion about which version was actually live

### Solution

1. **main is ONLY branch → production**
   - No manual override
   - No point-in-time deployments
   - Always automatic from main

2. **/api/version endpoint returns truth**
   - Runtime-fetched values (VERCEL_GIT_COMMIT_SHA, etc.)
   - Not from build-time constants
   - Cacheless: Cache-Control: no-store, max-age=0

3. **VersionBadge in UI shows env•branch•sha**
   - Footer visible to users/support
   - Red warning if branch != main in production
   - Copy button for debugging

4. **Pre-push git hook blocks main**
   - Prevents accidental direct pushes to main
   - Forces feature branch → PR → merge workflow

---

## Vercel Configuration (Ensure This)

### Check Vercel Settings

1. Go to Vercel dashboard
2. Select "beyond-pricing" project
3. Settings → Git → Deploy Hooks
4. Confirm:
   - **Production branch**: `main`
   - **Auto-deploy**: Enabled
   - No other branches auto-deploy

### Aliases

1. Go to Domains
2. Find production alias (e.g., `beyond-pricing.vercel.app`)
3. Confirm it points to:
   - **Production** deployment
   - **From main branch**
   - Not from preview or staging

### Environment Variables

1. Settings → Environment Variables
2. Ensure these are set for **Production**:
   - `VERCEL_ENV=production`
   - Any secrets for auth
   - Database connection strings

---

## Deployment Checklist (Post-Merge)

After you merge feature/* to main:

### Step 1: Wait for Vercel Build

```
GitHub: PR merged ✅
Vercel: Build starting...
(watch: https://vercel.com/projects/beyond-pricing)
```

**Wait 1-2 minutes** for build to complete.

### Step 2: Check Build Log

```
In Vercel dashboard:
1. Deployments tab
2. Latest deployment
3. Click to open build log
4. Scroll to "Build" section
5. Confirm: "Building on main branch"
6. Confirm: Shows git sha (e.g., abc1234)
```

**If build log shows wrong branch**: STOP and investigate.

### Step 3: Verify /api/version

```bash
# After build completes:
curl https://beyond-pricing.vercel.app/api/version | jq

# Expected output:
{
  "sha": "abc1234...",     # Matches your commit
  "branch": "main",        # MUST be "main"
  "env": "production",
  "buildTime": "2026-02-27T...",
  "deploymentUrl": "beyond-pricing.vercel.app"
}
```

**If branch != "main"**: ERROR. Don't proceed.

### Step 4: Check VersionBadge

```
In production (https://beyond-pricing.vercel.app):
1. Look in footer (bottom-right)
2. Should show: "production • main • abc1234 • 2026-02-27 13:15"
3. If showing red warning or branch != "main": ERROR
```

### Step 5: Smoke Test

Quick sanity check:
- [ ] App loads without errors
- [ ] Portal loads without errors
- [ ] Login flow works (or shows expected state)
- [ ] No console errors (F12 → Console)

---

## Common Issues & Fixes

### Issue: /api/version shows wrong branch

**Possible causes:**
1. Build log shows wrong branch
2. Vercel alias pointing to wrong deployment
3. Environment variable VERCEL_GIT_COMMIT_REF not set

**Fix:**
```
1. Check Vercel Build Log
2. If Branch is wrong: Check git push (maybe feature branch was deployed?)
3. If alias is wrong: Check Vercel Domains settings
4. If env var missing: Add to Vercel Project → Settings → Environment Variables
```

### Issue: Build failed on Vercel

**Common causes:**
- Missing env variables
- TypeScript errors (npm run build should catch these locally)
- Pre-render issues (see RUNBOOK_SUPABASE.md)

**Fix:**
```
1. Check build log for specific error
2. Reproduce locally: npm run build
3. If doesn't fail locally: Check Vercel env vars
4. Fix → push to feature branch → re-test → merge again
```

### Issue: Old version still in production after 2+ minutes

**Possible cause:**
- CDN cache not cleared
- Browser cache

**Fix:**
```bash
# Force refresh:
1. Open DevTools (F12)
2. Right-click refresh icon → "Empty cache and hard refresh"
3. Or open in incognito window
4. Check /api/version again

# Or purge Vercel cache:
1. Vercel dashboard → Deployments → Recent
2. Click "Redeploy" on latest
```

### Issue: Cannot push to main (blocked by git hook)

**This is working as intended!**

You must use feature branch → PR → merge workflow.

**Fix:**
```bash
# If you NEED to push directly (emergency only):
BYPASS_MAIN_GUARDRAIL=1 git push origin main
# But this is last resort. Document why.
```

---

## Vercel Preview Deployments

### How They Work

Every push to feature/* gets a preview deployment:

```
git push origin feature/xyz
        ↓
Vercel creates preview build
        ↓
Unique URL: https://beyond-pricing-xyz-abc.vercel.app
        ↓
Share with team for testing before merge
```

### Check Preview Version

```bash
# For preview deployment:
curl https://beyond-pricing-xyz-abc.vercel.app/api/version | jq

# Will show:
{
  "branch": "feature/xyz",     # Shows feature branch
  "env": "preview",            # NOT production
  ...
}
```

### Important

- Preview URL is temporary (deleted after PR closed)
- Preview is safe to test destructive changes
- Never share preview URL as "production"
- Always test in production after merge

---

## Deployment Verification Workflow

```
┌─────────────────────────────────────────┐
│ You merge feature/* to main              │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│ Vercel auto-detects push to main         │
│ (1-2 seconds)                            │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│ Vercel builds & deploys (1-2 min)        │
│ Check build log for: Branch: main        │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│ curl /api/version                        │
│ ✓ branch === "main"                      │
│ ✓ sha matches commit                     │
│ ✓ env === "production"                   │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│ VersionBadge in footer shows:            │
│ "production • main • abc1234"            │
│ (no red warning)                         │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│ Smoke test: App works ✓                  │
│ Done! ✅                                  │
└─────────────────────────────────────────┘
```

---

## Environment Parity

### Production env vars must include:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OWNER_EMAIL=daniellopes@beyondfocus.pt
VERCEL_ENV=production
```

Check in Vercel:
- Settings → Environment Variables → Filter by "Production"

---

## Rollback Procedure (Emergency Only)

If production is broken after deploy:

```bash
# Option 1: Revert the commit in main
git checkout main
git pull origin main
git revert <broken-commit-sha>
git push origin main
# Vercel auto-deploys the revert

# Option 2: Manually redeploy previous working commit
# Vercel dashboard → Deployments → Click previous "main" → "Redeploy"

# Then:
# 1. Verify /api/version shows old sha
# 2. Check VersionBadge shows correct version
# 3. Smoke test
# 4. Create issue for root cause
```

---

## Guardrails Summary

| Guarantee | How It Works |
|-----------|------------|
| Production = main | Auto-deploy only from main |
| No old versions | /api/version shows runtime truth |
| Visibility | VersionBadge in footer |
| Prevention | Git hook blocks direct main push |
| Verification | Checklist above |

---

## References

- SOURCE_OF_TRUTH_MAIN.md - Fundamental main branch rules
- RUNBOOK_BRANCHING.md - How to create & merge branches
- WORKFLOW_30S.md - Quick 30-second flow

---

**SUMMARY**: Push to feature/* → PR → merge to main → Vercel auto-deploys → check /api/version (branch=main) → smoke test → Done ✅

Never manually deploy. Let automation do it.
