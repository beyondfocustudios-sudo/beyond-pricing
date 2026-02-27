# 🗄️ Supabase Configuration & Pitfalls

**Critical env vars, RLS policies, migrations, and common crash scenarios.**

---

## Required Environment Variables

### Production (Vercel)

```env
NEXT_PUBLIC_SUPABASE_URL=https://[project].supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OWNER_EMAIL=daniellopes@beyondfocus.pt
```

All 4 are **REQUIRED**. Missing any one causes:
- Login failures
- Prerender crashes
- API 401/403 errors
- "Cannot create Supabase client" errors

### Local Development (.env.local)

Same vars + local overrides:
```env
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Never commit `.env.local` - it contains secrets.

---

## Common Crashes & Fixes

### 1. "Cannot find module Supabase" during prerender

**Cause**: Env var missing during next build

**Fix**:
```bash
# Ensure vars are in Vercel Production settings
# VERCEL_ENV should equal "production"
# Then rebuild:
npm run build  # Check for errors
```

**Prevention**: See RUNBOOK_DEPLOY_VERCEL.md

### 2. RLS Policy Denies Access

**Symptom**: "new row violates row level security policy" in logs

**Fix**:
1. Check table RLS policy in Supabase dashboard
2. Ensure current user passes the policy condition
3. Add debug query to understand policy
4. Update policy if needed

**Common policies**:
```sql
-- User-scoped RLS
(SELECT auth.uid()) = user_id

-- Team-scoped RLS
team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))
```

### 3. Auth Token Expired

**Symptom**: 401 Unauthorized, "Invalid JWT" errors

**Fix**:
- In browser: Clear cookies → Re-login
- In API: Session TTL may have expired
- Check session.ts for SESSION_TTL constant

---

## RLS (Row Level Security) Rules

### Golden Rule

> Don't trust the client. Always verify in Supabase RLS policies.

### Table RLS Checklist

- [ ] RLS enabled on sensitive tables (users, teams, projects)
- [ ] RLS disabled on public tables (if any)
- [ ] Policies tested in Supabase dashboard
- [ ] Policies match your auth model

### Common RLS Patterns

```sql
-- Pattern 1: User owns record
(SELECT auth.uid()) = user_id

-- Pattern 2: User is in team
team_id IN (SELECT team_id FROM team_members WHERE user_id = (SELECT auth.uid()))

-- Pattern 3: Public read, auth write
(current_setting('request.jwt.claims'->>'role') = 'authenticated')
```

---

## Migrations

### Running Migrations

```bash
# Push schema changes
npm run db:push

# Check migration status
npm run db:status

# Diff changes
npm run db:diff
```

### Migration Naming

```
supabase/migrations/XXX_description.sql
```

Example: `049_project_references.sql`

Always version sequentially.

---

## Supabase Auth Modes

### OTP (One-Time Password)

- Email-based
- No password needed
- Cheaper than passwords
- Default in this repo

### Password Auth

- Traditional username/password
- More familiar to users
- Supported but not default

### OAuth (Google, Microsoft)

- Third-party login
- Implemented in login.tsx
- Requires Supabase OAuth app config

---

## Database Schema

### Critical Tables

- `auth.users` - Supabase auth (auto-managed)
- `public.team_members` - RLS for teams
- `public.projects` - Project records
- `public.deliverables` - Client deliverables

Check Supabase dashboard for schema.

---

## Debugging

### Query Tool

Supabase dashboard → SQL Editor → test queries

```sql
SELECT * FROM public.projects
WHERE user_id = (SELECT auth.uid())
LIMIT 1;
```

### Logs

Supabase dashboard → Logs → see API errors

### Client Errors

Browser console → Network tab → see /api/* errors

---

## References

- RUNBOOK_QA.md - Testing with Supabase
- KNOWN_ISSUES.md - Historical prerender crashes
- BOOTSTRAP.md - Initial auth setup

---

**SUMMARY**: 4 env vars required. RLS prevents unauthorized access. Migrations versioned. Test in Supabase editor before deploying. Check logs if confused.
