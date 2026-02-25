# OPS RUNBOOK — Beyond Pricing

Quick reference for day-to-day development operations.

---

## 1. Design Tokens

### Update tokens from Figma
```bash
# 1. In Figma: Tokens Studio → Export → JSON
# 2. Save as design-tokens/tokens.json
# 3. Build:
npm run tokens:build

# Output:
#   src/styles/tokens.css  — CSS custom properties
#   src/lib/motion.ts      — Framer Motion presets
```

### Validate tokens (CI also runs this)
```bash
npm run tokens:validate
```

### Token schema
- `design-tokens/tokens.example.json` — reference schema (committed)
- `design-tokens/tokens.json` — actual export (gitignored)

---

## 2. Database (Supabase)

### Prerequisites
```bash
# Link project (one-time)
npx supabase link --project-ref wjzcutnjnzxylzqysneg
```

### Common operations
```bash
# Check migration status
npm run db:status

# Push pending migrations to remote
npm run db:push

# Generate diff from local changes
npm run db:diff

# Full schema audit (requires .env.local)
export $(cat .env.local | xargs) && npm run db:audit
```

### Create new migration
```bash
# 1. Make changes in Supabase dashboard or locally
# 2. Generate migration file:
npx supabase db diff -f NNN_description

# 3. Review the generated file in supabase/migrations/
# 4. Push:
npm run db:push
```

### Emergency: Run SQL directly
```
1. Open: https://app.supabase.com/project/wjzcutnjnzxylzqysneg
2. SQL Editor → New Query
3. Paste SQL → RUN
```

---

## 3. Vercel Deployment

### Auto-deploy
Every push to `main` triggers automatic deployment on Vercel.

### Manual deploy check
```bash
# Verify build passes locally first
npm run build
```

### Environment variables
Required in Vercel dashboard (Settings → Environment Variables):
```
NEXT_PUBLIC_SUPABASE_URL        → https://wjzcutnjnzxylzqysneg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY   → (from Supabase → Settings → API)
SUPABASE_SERVICE_ROLE_KEY       → (from Supabase → Settings → API)
OWNER_EMAIL                     → (admin bootstrap email)
```

### Preview deployments
Every PR gets a preview URL from Vercel automatically.

---

## 4. GitHub CI

### What CI checks
On every PR to `main`:
1. `npm ci` — install dependencies
2. `tokens:validate` — design token structure
3. `tsc --noEmit` — TypeScript type check
4. `npm run build` — Next.js production build

### CI requires these GitHub secrets
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Set at: Settings → Secrets and variables → Actions

---

## 5. Local Development

### First-time setup
```bash
cd /Users/dolho/beyond-pricing/app
npm install
cp .env.local.example .env.local  # Fill in Supabase keys
npm run dev
```

### Daily workflow
```bash
# Start dev server
npm run dev

# Type check
npx tsc --noEmit

# Full build test
npm run build

# Run E2E smoke tests
npm run test:smoke
```

---

## 6. Branch Strategy

| Branch | Purpose |
|--------|---------|
| `main` | Production — auto-deploys to Vercel |
| `fix/stabilize-core-crud-ui` | DB schema + CRUD stabilization |
| `feat/premium-ui-redesign` | Visual redesign (future) |
| `feat/*` | Feature branches |
| `fix/*` | Bug fix branches |

### PR workflow
```bash
git checkout -b feat/my-feature
# ... make changes ...
git add <files>
git commit -m "feat: description"
git push -u origin feat/my-feature
gh pr create --title "feat: description" --body "..."
```

---

## 7. Key Files Reference

| File | Purpose |
|------|---------|
| `src/app/globals.css` | Design system — all CSS tokens + components |
| `src/lib/motion.ts` | Framer Motion presets (auto-generated) |
| `tailwind.config.ts` | Tailwind → CSS var mapping |
| `design-tokens/tokens.example.json` | Token schema reference |
| `scripts/build-tokens.ts` | Token compiler |
| `scripts/audit-schema-gaps-standalone.ts` | DB schema validator |
| `supabase/migrations/` | All SQL migrations |
| `.github/workflows/ci.yml` | CI pipeline |

---

## 8. Troubleshooting

### Build fails with missing env vars
```bash
# Ensure .env.local exists and has all required vars
cat .env.local
```

### Supabase CLI not linked
```bash
npx supabase link --project-ref wjzcutnjnzxylzqysneg
```

### Token build fails
```bash
# Check token file exists
ls design-tokens/tokens.json
# Falls back to tokens.example.json if not found

# Validate structure
npm run tokens:validate
```

### Migration conflicts
```bash
# Check remote migration status
npm run db:status

# If out of sync, repair:
npx supabase migration repair --status applied NNN_migration_name
```
