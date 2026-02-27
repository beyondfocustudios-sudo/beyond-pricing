# 🌳 Branching Strategy & Merge Rules

**Rules for creating, working with, and merging branches safely into main.**

---

## Golden Rule

> **Produção = main**
>
> main é SEMPRE a versão em produção. Nunca se trabalha diretamente em main.

---

## Branch Types

### feature/* (Standard Feature Branches)

```bash
git checkout -b feature/what-you-do origin/main
```

**When**: Developing new features or bug fixes
**Examples**:
- feature/add-version-badge
- feature/fix-portal-scroll
- feature/implement-dropbox-sync

**Rules**:
- Always branch from origin/main
- Commit message format: `feat:` / `fix:` / `chore:`
- Run npm run build before push
- Run npm run preflight before push
- Create PR for review before merge

### agent/* (Agent-Specific Branches)

```bash
git checkout -b agent/task-name-YYYYMMDD origin/main
```

**When**: Jarvis, Codex, or Claude working autonomously
**Examples**:
- agent/fix-auth-crash-20260227
- agent/portal-ui-improvements-20260227

**Rules**:
- Include date in branch name (YYYYMMDD)
- Same commit and build rules as feature/*
- Mention "agent:" in PR to trigger auto-review if configured

### jarvis/* (Jarvis Agent Branches)

```bash
git checkout -b jarvis/feature-name origin/main
```

**When**: Jarvis development branches (special agent)
**Examples**:
- jarvis/development
- jarvis/feature-integration

**Rules**:
- Similar to feature/* but dedicated to Jarvis
- Can be long-lived development branches
- Must still merge back to main via PR

### release/* (Consolidated Release Branches)

```bash
git checkout -b release/consolidate-to-main origin/main
```

**When**: Consolidating multiple branches before main merge
**Examples**:
- release/consolidate-to-main

**Rules**:
- Created only for major consolidations
- Merge multiple feature branches into release/*
- Then merge release/* into main with --no-ff
- Document the consolidation process

---

## Workflow (7 Steps)

### Step 1: Create Branch

```bash
git fetch origin
git checkout -b feature/what-you-do origin/main
```

### Step 2: Code

```bash
vim src/...
git add .
git commit -m "feat: description of what you did"
```

### Step 3: Build

```bash
npm run build
# Must see: ✅ EXIT=0 (or "Build succeeded")
```

### Step 4: Preflight

```bash
npm run preflight
# Must see: ✅ PREFLIGHT PASSED
```

### Step 5: Push

```bash
git push origin feature/what-you-do
# Git hook pre-push will run preflight again
# If it fails, fix and retry
```

### Step 6: PR

- Open GitHub
- Click "Create Pull Request"
- Fill title: `feat: your title` (copy commit message)
- Add description: What changed and why
- List commits: `git log --oneline feature/what-you-do ^origin/main`
- Wait for CI/CD checks (green ✅)
- Request review from team

### Step 7: Merge

- Reviewer approves
- Click "Merge Pull Request"
- Choose merge strategy:
  - **Squash and Merge**: Use if commits are messy (1 commit in main)
  - **Create a Merge Commit**: Use if commit history matters (--no-ff style)
- Delete branch after merge

---

## Pre-Merge Checklist

Before merging to main, ensure:

- [ ] Branch is NOT main
- [ ] npm run build passed (EXIT=0)
- [ ] npm run preflight passed
- [ ] GitHub CI/CD checks all green ✅
- [ ] At least 1 reviewer approved
- [ ] Commit messages follow format (feat: / fix: / chore:)
- [ ] No .env.local changes
- [ ] Related docs updated (if applicable)

---

## Merging Strategy

### Default: Create a Merge Commit

```bash
# GitHub will use this when you click "Merge Pull Request"
# Preserves branch history: main → feature/*
```

**Advantages**:
- Clear history of where commits came from
- Rollback is easy (git revert)

**Disadvantages**:
- More commit noise in main

### Alternative: Squash and Merge

```bash
# When you want clean main history
# All feature commits → 1 commit in main
```

**Advantages**:
- Clean main history
- main log shows "feat: title" (1 line per feature)

**Disadvantages**:
- Loses commit history detail
- Harder to bisect bugs

**When to use**:
- Small, focused features
- Many small commits in feature
- Team prefers clean history

---

## Rebase vs Merge

### Rebase (Not Recommended for main)

```bash
# NEVER rebase main into feature
# or rebase feature into main before merge
git rebase origin/main  # ❌ Avoid
```

**Why avoid**:
- Rewrites history (confuses git blame)
- Makes git reset dangerous
- Conflicts with collaborative work

### Merge (Recommended)

```bash
# ALWAYS merge, never rebase
git merge origin/main  # ✅ Safe
```

**Why prefer**:
- Preserves history
- Clear parent commits
- Merges explicitly tracked

---

## Common Scenarios

### Scenario: Feature Branch is Behind main

```bash
# Check:
git fetch origin
git log --oneline feature/what-you-do ^origin/main

# If behind, merge main into feature:
git merge origin/main
# Resolve conflicts if any
git push origin feature/what-you-do
```

### Scenario: Conflict When Merging to main

```bash
# After clicking "Merge" on GitHub, if conflicts:
# GitHub will show "This branch has conflicts"

# Option 1: Resolve on GitHub (if simple)
# Click "Resolve conflicts", make choices, commit

# Option 2: Resolve locally
git fetch origin
git checkout feature/what-you-do
git merge origin/main
# Fix conflicts in your editor
git add .
git commit -m "merge: resolve conflicts from main"
git push origin feature/what-you-do
```

### Scenario: Accidentally Committed to main

```bash
# STOP. Don't push.
# Revert the commit:
git revert HEAD
git push origin main

# Then create feature branch with your changes:
git checkout -b feature/name origin/main
# (copy your code back if needed)
```

### Scenario: Need to Work on Multiple Features Simultaneously

```bash
# Each feature gets its own branch:
git checkout -b feature/feature1 origin/main
# (work on feature1)

git checkout -b feature/feature2 origin/main
# (work on feature2)

# Then PR each separately to main
# Both can be open at same time
```

---

## Merging to main (Step-by-Step)

### From GitHub UI (Recommended)

1. Navigate to PR
2. Scroll to bottom
3. Click "Merge Pull Request"
4. Choose merge strategy (see above)
5. Confirm
6. GitHub will auto-merge
7. Vercel auto-deploys from main

### From Command Line (Advanced)

```bash
# Only if GitHub merge is broken
git checkout main
git pull origin main
git merge feature/what-you-do
git push origin main

# Vercel auto-deploys
```

---

## Post-Merge Validation

After merge to main:

1. Wait for Vercel build (1-2 min)
2. Check /api/version in production
   ```bash
   curl https://beyond-pricing.vercel.app/api/version | jq
   ```
3. Confirm:
   - `branch === "main"`
   - `sha` matches the commit you just merged
4. Smoke test: Quick click-around to ensure no obvious breaks
5. If all OK: Done ✅

---

## Branch Naming Convention

```
<type>/<description>-<optional-date>

Examples:
- feature/add-version-badge
- feature/fix-portal-scroll
- agent/fix-auth-20260227
- jarvis/development
- release/consolidate-to-main
```

**Never use**:
- `main` (never work here)
- `master` (deprecated)
- `production` (not this repo)
- Random names like `feature1`, `test`, `foo`

---

## Guardrails

| Rule | Enforcement | Consequence |
|------|-------------|------------|
| Never work on main | Pre-push hook | Blocks push to main |
| Feature from origin/main | Manual | Old base → conflicts |
| npm run build passes | Pre-commit | Preflight blocks |
| Commit message format | Lint-staged (optional) | CI fails |
| PR before merge | Manual | Code review missing |

---

## If You're Stuck

- `git branch` - See current branch
- `git status` - See uncommitted changes
- `git log --oneline -5` - See recent commits
- `npm run preflight` - Validate state
- Check SOURCE_OF_TRUTH_MAIN.md - Fundamental rules

---

**Summary**: feature/* from origin/main → build+preflight ✅ → push → PR → review → merge → Vercel auto-deploys → confirm /api/version. **FIM.**
