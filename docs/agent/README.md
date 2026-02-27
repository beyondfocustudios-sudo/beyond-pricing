# 🤖 Agent Doc Feeding System

**Automatic Documentation Injection for Agents (Jarvis, Codex, Claude)**

---

## What is This?

This system automatically feeds the right documentation to agents based on:
- The task/feature being worked on
- Current git branch and commit
- Deployment environment (local/preview/production)
- Guardrails and safety checks

**Goal**: No agent ever says "I don't know which docs to read" or "which version am I on?"

---

## How It Works (For Agents)

### 1️⃣ Start of Session

When you begin working on a task:

```bash
npx tsx scripts/agent/doc-feed.ts --task "fix portal review scroll issue"
```

This generates:
- `docs/agent/FEED.md` - All docs you need
- `docs/agent/FEED.json` - Structured data

### 2️⃣ Read FEED.md

Your FEED.md contains:
- **Context Snapshot** (branch, sha, env, version)
- **Docs You Must Read** (ordered by priority)
- **Docs Recommended** (helpful but optional)
- **Pre-Commit Checklist** (safety gates)
- **Standard Commands** (build, test, preflight)
- **Guardrails** (rules you can't break)

### 3️⃣ Code + Validate

```bash
# Write code...
vim src/...

# Before commit: run preflight
npm run preflight

# Before push: pre-push hook validates again
git push origin agent/feature-name
```

### 4️⃣ Merge + Deploy

After PR merge → Vercel auto-deploys from main.

Verify version: https://beyond-pricing.vercel.app/api/version

---

## Available Runbooks

Check `MANIFEST.json` for complete list. Common ones:

| Runbook | When to Use | Tags |
|---------|-----------|------|
| RUNBOOK_BRANCHING | Starting any feature | git, branch, main, feature/* |
| RUNBOOK_DEPLOY_VERCEL | Ensuring correct production | vercel, alias, version |
| RUNBOOK_SUPABASE | Env vars, prerender issues | env, supabase, rls, auth |
| RUNBOOK_QA | Testing before commit | test, playwright, e2e, smoke |
| RUNBOOK_PORTAL_CLIENT | Portal features | portal, review, client, dropbox |
| KNOWN_ISSUES | Debug historical problems | tailwind, rebase, crashes |

---

## Quick Reference

### Guardrails (Never Break These)

```
🔒 Produção = main. Nunca trabalhar em main.
🔒 Branch must be agent/* ou jarvis/*
🔒 Never touch .env.local
🔒 npm run build must pass (EXIT=0)
🔒 npm run preflight must pass
🔒 /api/version must show correct branch+sha
```

### Pre-Commit Checklist

- [ ] Branch is NOT main (git branch)
- [ ] npm run build passed
- [ ] npm run preflight passed
- [ ] No uncommitted changes (git status)
- [ ] Commit message follows format (feat: / fix: / chore:)
- [ ] /api/version confirms you're on right branch

### Standard Commands

```bash
# Validate everything
npm run preflight

# Build + test
npm run build
npm run test:smoke

# Verify deployment
curl https://beyond-pricing.vercel.app/api/version | jq

# Check branch
git branch
git log --oneline -1
```

---

## If You're Stuck

1. Re-run doc-feed with better description
2. Read KNOWN_ISSUES.md for historical problems
3. Check /api/version to confirm environment
4. Run npm run preflight to validate state

---

## Doc Feeding Heuristic

The system uses keyword matching to choose docs:

```
Task contains "supabase/env/prerender"
  → Include: RUNBOOK_SUPABASE + KNOWN_ISSUES(prerender)

Task contains "portal/review/deliveries"
  → Include: RUNBOOK_PORTAL_CLIENT + RUNBOOK_QA

Task contains "deploy/vercel/alias"
  → Include: RUNBOOK_DEPLOY_VERCEL + RUNBOOK_BRANCHING
```

See `docs/agent/MANIFEST.json` for complete mapping.

---

## Manifest Structure

Each doc in MANIFEST.json has:

```json
{
  "id": "runbook-supabase",
  "path": "docs/agent/RUNBOOK_SUPABASE.md",
  "priority": 1,
  "tags": ["env", "supabase", "auth", "rls"],
  "when_to_read": "Always before touching .env, RLS policies, or Supabase schema",
  "must_read_before_commit": true,
  "related_features": ["auth", "portal", "reset-password"]
}
```

---

## Generated FEED Files

After running `doc-feed`, check:

- **docs/agent/FEED.md** - Human-readable doc pack
- **docs/agent/FEED.json** - Machine-readable data
- Both updated with latest branch/sha/env context

---

## Integration with Agents

### For Jarvis

Entry point: Add to AGENTS.md

```
## Doc Feeding (Always First)

1. npx tsx scripts/agent/doc-feed.ts --task "<your task>"
2. Read docs/agent/FEED.md (mandatory)
3. Follow FEED.json checklist
4. npm run preflight (before any commit)
```

### For Codex/Claude

Same process:
1. Generate FEED
2. Read FEED.md
3. Follow checklist
4. Use preflight

---

## Examples

### Example 1: Fix Portal Scroll

```bash
npx tsx scripts/agent/doc-feed.ts --task "fix portal review scroll issue when deliverables tab active"
```

**FEED.md will include:**
- RUNBOOK_BRANCHING (branch rules)
- RUNBOOK_PORTAL_CLIENT (portal architecture)
- RUNBOOK_QA (testing portal UI)
- SOURCE_OF_TRUTH_MAIN.md (main guardrails)
- Context + checklist

### Example 2: Add Supabase Migration

```bash
npx tsx scripts/agent/doc-feed.ts --task "add supabase migration for new references table with RLS"
```

**FEED.md will include:**
- RUNBOOK_SUPABASE (env, migrations, RLS)
- RUNBOOK_QA (testing migrations)
- KNOWN_ISSUES (prerender crashes)
- Context + checklist

---

## Files in This Directory

```
docs/agent/
├── README.md (this file)
├── MANIFEST.json (doc registry)
├── RUNBOOK_BRANCHING.md
├── RUNBOOK_DEPLOY_VERCEL.md
├── RUNBOOK_SUPABASE.md
├── RUNBOOK_QA.md
├── RUNBOOK_PORTAL_CLIENT.md
├── KNOWN_ISSUES.md
├── FEED.md (generated)
└── FEED.json (generated)
```

---

**Remember**: If you don't know what to do → `npm run preflight` always helps.

Start with FEED.md. It has everything you need for that task. 🚀
