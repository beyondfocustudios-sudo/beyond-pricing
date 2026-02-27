# 🐛 Known Issues & Historical Fixes

**Problems we've hit before. Avoid them.**

---

## Build & Prerender Issues

### Issue: "next build crashes during prerender-manifest"

**Symptoms**:
```
Error: Cannot find module 'next/lib/utils'
Error building prerender-manifest
BUILD FAILED
```

**Cause**: Prerender tries to run .tsx that needs env vars (Supabase client init)

**Fix**:
```tsx
// In files that get prerendered:
export const dynamic = "force-dynamic";
// OR
export const revalidate = 0;
```

**Affected Files**:
- `src/app/reset-password/page.tsx`
- `src/app/auth/set-session/page.tsx`
- Any login/auth page with Supabase client

**Prevention**: Mark auth pages `force-dynamic` always.

---

### Issue: "Tailwind classes not compiling"

**Symptoms**:
```
Warning: Class 'bg-gray-950' was not found. Did you mean...?
```

**Cause**: Tailwind v4 changed class names or config

**Fix**:
1. Check `tailwind.config.ts`
2. Use standard Tailwind v4 names
3. For custom colors: use CSS variables instead

**Example**:
```tsx
// ❌ Old (Tailwind v3)
className="bg-gray-950 text-white"

// ✅ New (Tailwind v4 + CSS vars)
style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}
```

---

## Git & Merge Issues

### Issue: "Merge conflicts after rebase"

**Symptoms**:
```
CONFLICT: content in src/app/layout.tsx
Automatic merge failed
```

**Cause**: Rebased feature branch conflicts with main

**Fix**:
```bash
# Avoid rebase. Use merge instead:
git merge origin/main
# Resolve conflicts in editor
git add .
git commit -m "merge: resolve conflicts from main"
git push origin feature/xyz
```

**Prevention**: Never rebase. Always merge origin/main into feature.

---

### Issue: "git index.lock error"

**Symptoms**:
```
fatal: unable to create '.git/index.lock'
fatal: .git/index.lock: File exists
```

**Cause**: Another git process running or interrupted operation

**Fix**:
```bash
rm -f .git/index.lock
sleep 1
git status  # Try again
```

---

## Portal UI Issues

### Issue: "Portal projects page scroll freezes"

**Symptoms**:
```
User scrolls in /portal/projects
Content stops scrolling mid-page
Very sluggish or hangs
```

**Cause**: Missing `min-h-0` on scrollable flex container

**Fix**:
```tsx
<main className="min-h-0 flex-1 overflow-y-auto">
  {/* Content here scrolls properly */}
</main>
```

**Files Affected**:
- `src/app/portal/projects/[id]/page.tsx` (FIXED ✅)
- Any portal page with scrollable content

---

### Issue: "Dark mode has 'night blocks'"

**Symptoms**:
```
In light mode: Random black rectangles appear
CSS shows: bg-gray-950, text-white hardcoded
```

**Cause**: Hardcoded dark mode colors that don't adapt to theme

**Fix**:
```tsx
// ❌ Bad (always dark, ignores theme)
<div className="bg-gray-950 text-white">

// ✅ Good (respects theme)
<div style={{ backgroundColor: "var(--bg)", color: "var(--text)" }}>
```

**Affected Files**: Portal components (FIXED ✅ in commit 4283c29)

---

### Issue: "DeliverablePreviewDrawer doesn't show files"

**Symptoms**:
```
User clicks "Preview" button
Drawer opens empty
No error in console
```

**Cause**: `/api/portal/deliverables` missing dropbox_url field

**Fix**:
1. Check API endpoint returns `dropbox_url`
2. Verify Dropbox folder sync is active
3. Confirm RLS allows client to see deliverables

---

## Authentication Issues

### Issue: "reset-password page crashes"

**Symptoms**:
```
GET /reset-password → 500 error
Error: Supabase client not initialized
```

**Cause**: Missing env vars during prerender

**Fix**:
```tsx
// src/app/reset-password/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;
```

**Prevention**: All auth pages must be `force-dynamic`.

---

### Issue: "Session expires unexpectedly"

**Symptoms**:
```
User logged in
Refresh page
Session lost, must re-login
```

**Cause**: SESSION_TTL too short or cookie config wrong

**Fix**:
1. Check `src/lib/session.ts` for SESSION_TTL
2. Verify cookie is set to httpOnly, secure, sameSite
3. Ensure SUPABASE_SERVICE_ROLE_KEY env var exists

---

## Dropbox Integration Issues

### Issue: "Dropbox sync fails silently"

**Symptoms**:
```
Portal shows no deliverables
Dropbox folder exists with files
No error in console
```

**Cause**: Sync token expired or folder path wrong

**Fix**:
1. Check `/api/dropbox/health` returns OK
2. Verify folder path in `.env` matches Dropbox
3. Re-authorize Dropbox OAuth if needed

---

### Issue: "Cannot download previewed file"

**Symptoms**:
```
File previews in drawer
Download button clicks but does nothing
```

**Cause**: Temporary link expired or auth issue

**Fix**:
1. Check `/api/portal/deliverables/link` returns valid URL
2. Verify Dropbox sharing token is current
3. Check /api/version shows correct branch

---

## Environment Variable Issues

### Issue: ".env.local committed accidentally"

**Symptoms**:
```
Security alert: SUPABASE_SERVICE_ROLE_KEY leaked
GitHub shows .env.local in git history
```

**Cause**: .env.local added to git

**Fix** (Immediate):
```bash
# Revoke all Supabase keys ASAP
# In GitHub: git rm --cached .env.local
# Create new Supabase key
# Commit the fix
```

**Prevention**:
```bash
# Ensure .gitignore has:
.env.local
.env.*.local
```

---

### Issue: "Missing NEXT_PUBLIC_* var in production"

**Symptoms**:
```
Feature works locally
Feature broken in production
Console: undefined vars
```

**Cause**: Env var not set in Vercel Production environment

**Fix**:
1. Vercel dashboard → Project → Settings → Environment Variables
2. Add var with value
3. Re-deploy or "Redeploy" button
4. Verify `/api/version` in production after redeploy

---

## Version & Deployment Issues

### Issue: "Old version still showing in production"

**Symptoms**:
```
Merged to main 10 min ago
/api/version still shows old sha
Browser shows old version
```

**Cause**:
- Browser cache
- CDN cache
- Vercel build didn't complete

**Fix**:
```bash
# Check if Vercel is still building:
# Vercel Dashboard → Deployments → check build status

# Hard refresh browser:
# F12 → Right-click refresh → "Empty cache and hard refresh"

# Or incognito window:
# Ctrl+Shift+N, visit site
```

---

### Issue: "Branch shows wrong in /api/version"

**Symptoms**:
```
In production but /api/version shows:
"branch": "feature/xyz"
```

**Cause**: Vercel auto-deploy picked wrong branch

**Fix**:
1. Check Vercel build log (should show "Building on main")
2. If wrong: Check Vercel settings → Git → Production branch
3. Force re-deploy of correct commit

---

## Performance Issues

### Issue: "Portal page loads slowly"

**Symptoms**:
```
/portal/projects/[id] takes 3+ seconds
Lots of layout shift
```

**Cause**: Too many queries or components rendering

**Fix**:
1. Check network tab (F12) for slow API calls
2. Optimize queries in data-fetching functions
3. Use `React.memo()` to prevent re-renders
4. Check if Dropbox sync is running (can be slow)

---

## References for Each Issue

Each issue links to relevant runbooks:

- **Build crashes** → RUNBOOK_SUPABASE.md
- **Git conflicts** → RUNBOOK_BRANCHING.md
- **Portal UI bugs** → RUNBOOK_PORTAL_CLIENT.md
- **Env vars** → RUNBOOK_SUPABASE.md
- **Production version** → RUNBOOK_DEPLOY_VERCEL.md
- **Testing** → RUNBOOK_QA.md

---

## Quick Diagnosis Checklist

If something is broken:

1. ✅ Check /api/version (what's actually running?)
2. ✅ Check Vercel build log (did it build?)
3. ✅ Check console (F12 → errors?)
4. ✅ Hard refresh (Ctrl+Shift+R or incognito)
5. ✅ Check git status (what branch?)
6. ✅ npm run build locally (does it compile?)
7. ✅ npm run preflight (any guardrail violations?)
8. ✅ Search this file for "Symptoms: ..."

---

**SUMMARY**: Check /api/version first. Force-dynamic auth pages. Use CSS variables for theming. Never rebase. Check Vercel build log before debugging locally.
