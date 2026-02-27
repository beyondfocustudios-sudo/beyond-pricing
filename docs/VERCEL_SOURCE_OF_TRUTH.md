# Vercel Source of Truth - Consolidation Process

## Overview
This document outlines the 10-step consolidation process ensuring `origin/main` is always the authoritative source of truth for production Vercel deployments.

## 10-Step Consolidation Process

### Step 1: Inventory and Detection
- Execute `git fetch --all --prune` to sync all remote branches
- Identify key feature branches and their commit SHAs
- Determine which commits need to be integrated into main

### Step 2: Create Consolidation Branch
```bash
git checkout -B release/consolidate-to-main origin/main
```

### Step 3: Merge Feature Branches
- Merge or cherry-pick important branches into consolidation
- Example: Merge portal-client-dashboard-ui-match-ceo with BTL portal fixes
- Resolve conflicts by keeping recent, tested fixes

### Step 4: Verify All Commits Included
- Check consolidation branch includes all critical fixes
- Verify BTL portal scroll/dark-mode fixes are present
- Ensure CEO dashboard improvements are integrated

### Step 5: Reintegrate Other Important Branches
- Selectively merge branches like `jarvis/development`
- Use `--no-commit` merges to review changes carefully
- Only commit changes that pass code review

### Step 6: Build and QA Locally
```bash
npm install
npm run build  # Verify EXIT=0
```
- Check for TypeScript errors
- Verify no critical warnings
- Test critical paths manually

### Step 7: Guarantee API Endpoints
- Verify `/api/version` endpoint exists and responds with:
  - `sha`: Git commit SHA
  - `branch`: Git branch name
  - `env`: Deployment environment
  - `buildTime`: ISO timestamp in Lisbon timezone
  - `deploymentUrl`: Vercel deployment URL
- Add `Cache-Control: no-store, max-age=0` header
- Test anti-cache configuration

### Step 8: Final Merge to Main
```bash
git checkout main
git merge release/consolidate-to-main --no-ff \
  -m "feat(consolidation): [detailed commit message]"
```

### Step 9: Verify Vercel Production
- Monitor Vercel deployment at https://beyond-pricing.vercel.app
- Check build log confirms Branch: main
- Verify production SHA matches local commit
- Test `/api/version` endpoint in production
- Validate footer stamps show correct version info

### Step 10: Documentation
- Update this file with process details
- Document any manual steps required
- Record timestamps of deployments
- Note any issues encountered

## Key Endpoints

### Version Endpoint
- **URL**: `https://beyond-pricing.vercel.app/api/version`
- **Method**: GET
- **Response**: JSON with deployment metadata
- **Cache**: Disabled (no-store)

### Build Stamp Endpoint
- **URL**: `https://beyond-pricing.vercel.app/api/build-stamp`
- **Method**: GET
- **Response**: Build information with formatted timestamp
- **Cache**: Disabled (no-store)

## Consolidation Commit Log
**Last Consolidation**: 2026-02-27
- **Branch**: release/consolidate-to-main
- **Commits Merged**:
  - Portal client-dashboard UI match CEO (fbf732d)
  - BTL portal scroll/dark-mode fixes (4283c29, 6c759f7)
  - Prior build fixes (4fb6a22, 4566dcc)
- **Files Changed**: 119
- **Build Status**: ✅ EXIT=0

## Workflow Going Forward

1. Create feature branches from `main`
2. When feature is complete, submit to `main` via pull request
3. Quarterly or as needed: Run full consolidation to integrate multiple branches
4. Always deploy from `main` to Vercel production
5. Use `/api/version` endpoint to verify production deployment

## Emergency Procedures

If production deployment fails:
1. Check `/api/version` to identify deployed SHA
2. Review Vercel build logs for specific error
3. Create hot-fix branch from problematic commit
4. Follow steps 1-9 to integrate fix
5. Document issue and root cause

## Owner Notes
- Consolidation ensures no branch drift or version confusion
- `/api/version` endpoint serves as deployment verification source
- All feature work merges into main via pull requests
- Vercel always deploys from origin/main
