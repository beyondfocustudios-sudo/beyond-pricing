# ✅ QA Checklist & Test Procedures

**How to ensure code quality before pushing to main.**

---

## Pre-Commit QA (Local)

### 1. Build Check

```bash
npm run build
# Must see: ✅ (no errors, EXIT=0)
```

**If fails**: Fix errors. Read TypeScript output carefully.

### 2. Preflight Validation

```bash
npm run preflight
# Must see: ✅ PREFLIGHT PASSED
```

**If fails**: Fix issues (branch, working tree, env vars).

### 3. Manual Testing

Before commit:

```bash
npm run dev
# Open http://localhost:3000
# Click around your changed features
# Check console for errors (F12)
# Verify /api/version shows local branch
```

---

## Smoke Tests (Playwright)

### Run Smoke Suite

```bash
npm run test:smoke
# Must complete without failures
```

**What it tests**:
- Landing page loads
- Auth flow (OTP login)
- Basic portal navigation
- Critical paths

### Setup Auth State (If Needed)

```bash
npm run test:e2e:prepare-auth
# Creates test user session
```

---

## Pre-Push QA Checklist

- [ ] `npm run build` → EXIT=0
- [ ] `npm run preflight` → PASSED
- [ ] Manual testing: feature works as intended
- [ ] Console: No errors (F12 → Console)
- [ ] No .env.local changes
- [ ] Commit message format: `feat:` / `fix:` / `chore:`
- [ ] Branch is NOT main
- [ ] /api/version shows correct branch

---

## Pre-Merge QA (GitHub)

- [ ] GitHub CI/CD checks all green ✅
- [ ] Code review approved by 1+ person
- [ ] All conversations resolved
- [ ] No merge conflicts
- [ ] Related docs updated

---

## Post-Merge QA (Production)

After Vercel auto-deploy:

- [ ] Wait 1-2 min for build
- [ ] Check `/api/version`:
  ```bash
  curl https://beyond-pricing.vercel.app/api/version | jq
  # branch === "main"
  # sha matches your commit
  ```
- [ ] VersionBadge shows no warnings
- [ ] Smoke test in production:
  - [ ] App loads
  - [ ] Key feature works
  - [ ] No console errors

---

## Common QA Failures

### "npm run build fails"

```
Error: src/app/layout.tsx:50 - error TS2345
Type 'X' is not assignable to type 'Y'
```

**Fix**:
1. Read the error carefully
2. Fix the TypeScript issue
3. Commit the fix
4. Re-run `npm run build`

### "preflight says branch is wrong"

```
Error: You are NOT on feature/* or jarvis/*
```

**Fix**:
```bash
git checkout -b feature/correct-name origin/main
# Move your work to the right branch
```

### "Smoke test fails"

```
Error: timeout waiting for selector '.main'
```

**Fix**:
1. Check if your change broke the layout
2. Fix the issue locally
3. Manually verify with `npm run dev`
4. Re-run smoke test

### "/api/version shows wrong branch"

```json
{
  "branch": "feature/xyz"  // ❌ Should be "main"
}
```

**Fix**: You likely merged feature directly. Check Vercel build log.

---

## Feature-Specific QA

### Portal Changes

- [ ] Portal loads without errors
- [ ] Client deliverables tab shows
- [ ] Download/preview buttons work
- [ ] Scroll doesn't freeze
- [ ] Dark/light mode works

### Auth Changes

- [ ] OTP login works
- [ ] Session persists on reload
- [ ] Logout works
- [ ] /api/version accessible

### API Changes

- [ ] Test with curl or Postman
- [ ] Check response format
- [ ] Verify auth (401 if not authorized)
- [ ] Check performance (< 1s)

### Database Changes

- [ ] Migration runs without errors
- [ ] RLS policies work
- [ ] Data accessible from portal
- [ ] Rollback tested (if critical)

---

## "Terminado ✅" Definition

Your change is "Terminado ✅" when:

1. ✅ Locally:
   - npm run build → EXIT=0
   - npm run preflight → PASSED
   - Manual testing → works
   - Console → no errors

2. ✅ On GitHub:
   - CI/CD → all checks pass
   - Code review → approved
   - No conflicts

3. ✅ In Production:
   - /api/version → branch=main, correct sha
   - VersionBadge → no warning
   - Feature works in production
   - No new console errors

4. ✅ Documentation:
   - Relevant docs updated (if applicable)
   - Commit message clear

---

## References

- RUNBOOK_BRANCHING.md - Merge checklist
- RUNBOOK_DEPLOY_VERCEL.md - Production validation
- RUNBOOK_SUPABASE.md - Env vars & RLS testing

---

**SUMMARY**: Build locally ✅ → Preflight ✅ → Manual test ✅ → Smoke test ✅ → PR + merge → Check /api/version in prod ✅ → Terminado ✅
