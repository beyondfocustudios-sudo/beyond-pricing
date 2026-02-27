# PROJECT AGENTS - Doc-Feed Guardrails System

**This file is for Jarvis, Codex, Claude, and other AI agents working on Beyond Pricing.**

When you start a task on this project, follow this **MANDATORY entry point** before touching any code.

---

## 🚀 Agent Entry Point (ALWAYS FIRST)

### Step 1: Generate Doc Feed

When starting ANY task:

```bash
npx tsx scripts/agent/doc-feed.ts --task "your task description here"
```

**Example:**
```bash
npx tsx scripts/agent/doc-feed.ts --task "fix portal review scroll issue when deliverables tab active"
npx tsx scripts/agent/doc-feed.ts --task "add supabase migration for references table with RLS"
npx tsx scripts/agent/doc-feed.ts --task "implement dropbox folder sync" --mode jarvis
```

**Output:**
- `docs/agent/FEED.md` - Human-readable documentation pack (READ THIS FIRST)
- `docs/agent/FEED.json` - Machine-readable checklist

### Step 2: Read FEED.md

Open `docs/agent/FEED.md` immediately after generation. It contains:

- **Context Snapshot**: Current branch, SHA, timestamp, mode, task
- **MUST READ Docs**: Ordered by priority (read these first)
- **Recommended Docs**: Additional helpful context
- **Pre-Commit Checklist**: 8 items to verify before committing
- **Guardrails**: 6 critical rules (never break these)
- **Standard Commands**: Build, preflight, test, verification
- **Workflow Summary**: 9-step process from start to production

### Step 3: Follow the Checklist

Before any `git commit`:

```bash
npm run preflight
```

This validates:
- ✅ Branch is NOT main
- ✅ Git working tree is clean
- ✅ npm run build passes
- ✅ Smoke tests pass (optional)
- ✅ /api/version is valid
- ✅ No .env.local file committed

### Step 4: Code + Validate

```bash
# Write code...
npm run build                    # Must exit 0
npm run preflight               # Pre-commit validation
git add .
git commit -m "feat: ..."
```

The pre-commit hook runs preflight automatically.

### Step 5: Push + PR + Merge

```bash
git push origin feature/xyz      # Pre-push hook validates
# Create PR on GitHub
# Wait for review & merge
# Vercel auto-deploys from main
```

### Step 6: Verify Deployment

After PR merge:

```bash
npm run verify-deployment        # Confirms production is correct
```

Check:
- Production branch === "main"
- Production SHA matches origin/main
- /api/version shows correct deployment

---

## 📋 Mandatory Docs to Know

These docs are ALWAYS required before coding:

1. **docs/SOURCE_OF_TRUTH_MAIN.md** - 10 absolute rules about main branch
2. **docs/WORKFLOW_30S.md** - 7-step quick reference
3. **docs/agent/README.md** - Doc-feeding system overview
4. **docs/agent/MANIFEST.json** - Doc registry (for doc-feed heuristics)

---

## 🔒 Guardrails (Never Break These)

```
🔒 Produção = main. Nunca trabalhar em main.
🔒 Branch must be feature/* ou agent/*
🔒 Never touch .env.local
🔒 npm run build must pass (EXIT=0)
🔒 npm run preflight must pass
🔒 /api/version must show correct branch+sha
```

---

## ⚙️ Git Hooks (Automatic Enforcement)

### Pre-Commit Hook

Runs automatically when you `git commit`:

```bash
🔒 PRE-COMMIT HOOK - Running Preflight
    [validates branch, build, .env.local, etc.]
    ✅ Commits pass immediately
    ❌ Bad commits are blocked
```

### Pre-Push Hook

Runs automatically when you `git push`:

```bash
🔒 PRE-PUSH CHECK - Main Branch Guardrails
    [prevents accidental main pushes]
    [runs full preflight before push]
    ✅ Safe pushes succeed
    ❌ Unsafe pushes blocked
```

---

## 🛠️ Available Commands

```bash
# Doc Feeding & Validation
npm run preflight                           # Pre-commit check
npm run verify-deployment                  # Post-merge check

# Documentation Generation
npx tsx scripts/agent/doc-feed.ts --task "your task"
npx tsx scripts/agent/doc-feed.ts --task "your task" --mode jarvis

# Build & Test
npm run build                               # Production build
npm run test:smoke                          # Smoke tests
npm run test:e2e                            # Full e2e tests

# Database
npm run db:push                             # Push migrations
npm run db:status                           # Migration status
npm run db:audit                            # Schema audit

# Development
npm run dev                                 # Dev server
npm run typecheck                           # Type validation
npm run lint                                # Lint check
```

---

## 📖 Full Documentation Registry

All available docs are in `docs/agent/MANIFEST.json`:

- **RUNBOOK_BRANCHING.md** - Git workflow (branch types, 7-step process, merge strategy)
- **RUNBOOK_DEPLOY_VERCEL.md** - Production deployment (Vercel flow, anti-old-versions, verification)
- **RUNBOOK_SUPABASE.md** - Database & auth (env vars, RLS, migrations, debugging)
- **RUNBOOK_QA.md** - Quality assurance (testing, "Terminado ✅" definition, checklists)
- **RUNBOOK_PORTAL_CLIENT.md** - Client portal (features, RLS, Dropbox, theming, bugs)
- **KNOWN_ISSUES.md** - Historical bugs (solutions, debugging, common fixes)

The **doc-feed** system automatically selects relevant docs based on your task description.

---

## 🚨 If You're Stuck

1. **Run preflight**: `npm run preflight` tells you what's wrong
2. **Read KNOWN_ISSUES.md**: Check for historical solutions
3. **Check /api/version**: Confirms which environment/branch you're on
4. **Re-generate FEED**: `npx tsx scripts/agent/doc-feed.ts --task "your task"` with better description
5. **Check git status**: `git status`, `git branch`, `git log --oneline -5`

---

## 🎯 Success Criteria for "Terminado ✅"

From RUNBOOK_QA.md:

**Stage 1: Local** ✅
- npm run build passes
- npm run preflight passes
- Manual testing done locally
- No console errors

**Stage 2: GitHub** ✅
- PR created
- CI/CD checks all pass
- At least 1 reviewer approved
- Commit message format correct (feat: / fix: / chore:)

**Stage 3: Production** ✅
- npm run verify-deployment confirms production SHA
- Smoke test production (click around, test critical paths)
- /api/version shows branch=main

**Stage 4: Documentation** ✅
- Updated relevant docs if applicable
- Added comments to complex code
- Updated KNOWN_ISSUES.md if encountered/fixed issues

---

## 💾 Memory & Context

Each task generates `docs/agent/FEED.md` with:
- **Context**: Branch, SHA, timestamp, mode
- **Curated docs**: Filtered to your specific task
- **Actionable checklist**: Before each phase (commit, push, deploy)
- **Clear error messages**: When preflight/verify fails

The doc-feed system ensures agents never say:
- ❌ "Which docs should I read?"
- ❌ "What branch am I on?"
- ❌ "Did the deployment work?"
- ❌ "What's the 9-step workflow?"

All answers are in `FEED.md` ✅

---

## 🚀 Example Workflow

```bash
# Start session
npx tsx scripts/agent/doc-feed.ts --task "fix portal scroll issue"
# Read docs/agent/FEED.md (takes 5 min)

# Create branch and code
git checkout -b feature/fix-portal-scroll origin/main
vim src/components/portal/...
npm run build && npm run preflight     # Validates before commit

# Commit and push
git add .
git commit -m "fix: resolve scroll freeze in portal deliverables tab"
# Pre-commit hook validates ✅
git push origin feature/fix-portal-scroll
# Pre-push hook validates ✅

# Create PR on GitHub, wait for review

# After merge (Vercel auto-deploys)
npm run verify-deployment              # Confirms production is correct ✅
# Smoke test in production
# Consider task "Terminado ✅"
```

---

## 🔗 Quick Links

- **Repo**: https://github.com/your-org/beyond-pricing
- **Production**: https://beyond-pricing.vercel.app/api/version (check version here)
- **Vercel Dashboard**: https://vercel.com/dashboard/projects
- **Supabase Console**: https://app.supabase.com/projects

---

## 📞 Support

Before asking for help:

1. Run `npm run preflight` - tells you what's wrong
2. Check `docs/agent/KNOWN_ISSUES.md` - might be a known issue with a fix
3. Read the relevant runbook from your FEED.md
4. Check `/api/version` endpoint to confirm environment

Then ask with error output and current `git status`.

---

**Remember: Doc-feed is your guide. Read FEED.md before coding. Follow preflight before committing. Verify after deploying. 🚀**
