# Beyond Pricing

**Premium SaaS platform for audiovisual production pricing.**
Built for Portuguese-speaking production companies to quote, manage, and export professional proposals.

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | Next.js 15 (App Router) |
| Styling | Tailwind v4 (PostCSS) |
| Database | Supabase (Postgres + RLS) |
| Auth | Supabase Auth (Password + OTP + Google OAuth + Microsoft/Azure OAuth) |
| Animation | Framer Motion v12 |
| Charts | Recharts |
| PDF | pdf-lib |
| Deployment | Vercel |

---

## Features

### Pricing Builder (`/app/projects/[id]`)
- Inline project name + client name editing
- Item CRUD grouped by category (Crew, Equipamento, Pós-Produção, Despesas, Outro)
- Margin/overhead/contingência sliders with live recalculation
- IVA regime selector (Continental 23%, Madeira 22%, Açores 16%, Isento)
- Investimento em equipamento slider
- Donut chart (Recharts) — cost distribution
- Auto-save with 1.5s debounce
- **Brief tab**: production type, delivery date, location fields, notes
- **Commercial terms generator**: preset payment structures (50/50, 30/70, faseado) + auto-generate button
- Export: **PDF** (premium branded) + **CSV**

### Checklists (`/app/checklists`)
- 3-phase production checklists (Pré-Produção, Rodagem, Pós-Produção)
- Real-time check/uncheck with Supabase persistence
- Progress bars per phase + overall
- Batch "complete all" per phase

### Templates (`/app/templates`)
- 4 system presets: Institucional, Short-Form, Documentário, Evento
- Preview modal with full item list + default parameters
- One-click "Usar template" → creates pre-filled project

### Insights (`/app/insights`)
- KPI cards: total revenue, avg price, approval rate, pipeline
- Monthly revenue bar chart (last 6 months)
- Category cost distribution with animated bars
- Guardrails engine: low margin / high overhead alerts

### Preferences (`/app/preferences`)
- Default overhead, contingência, margem alvo/mínima, investimento, IVA regime
- **AI Tagging toggle** (beta) — enables OpenAI Vision auto-tagging for photos in deliverables

### Client Portal (`/portal`)
- Login at `/portal/login` — **OTP-only** (6-digit email code, short 1-hour session)
- Project list: clients see only their projects (RLS-enforced)
- Project detail: Overview / Entregas (files from Dropbox) / Approvals & Feedback tabs

### Clients Backoffice (`/app/clients`)
- Create clients (name + slug)
- Associate projects to clients
- Invite client users (email + initial password + role)
- Manage project membership per client

### Entregas / Deliverables (`/app/projects/[id]` → Entregas tab)
- Configure Dropbox root path per project
- "Sincronizar agora" button → triggers `/api/dropbox/sync`
- Files displayed by type (Fotos / Vídeos / Docs) and collection (subfolder)
- Filter bar by type and collection
- Direct Dropbox shared links

---

## Setup

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
# Supabase (required)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Dropbox (required for Entregas feature)
DROPBOX_APP_KEY=your-dropbox-app-key
DROPBOX_APP_SECRET=your-dropbox-app-secret
DROPBOX_REFRESH_TOKEN=your-offline-refresh-token
DROPBOX_BASE_PATH=/Beyond/Clients

# OpenAI (optional — for AI photo tagging beta)
OPENAI_API_KEY=sk-...
```

#### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add Authorized Redirect URI: `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`
4. Copy `Client ID` and `Client Secret`
5. In Supabase Dashboard → Authentication → Providers → Google:
   - Enable Google provider
   - Paste Client ID and Client Secret
   - Save

#### Microsoft / Azure OAuth Setup

1. Go to [Azure Portal](https://portal.azure.com/) → Azure Active Directory → App registrations → New registration
2. Name: `Beyond Pricing` | Supported account types: **Any Azure AD directory + personal Microsoft accounts** (for broad login support)
3. Redirect URI: Web → `https://YOUR_SUPABASE_PROJECT.supabase.co/auth/v1/callback`
4. After creation, go to **Certificates & secrets** → New client secret → copy the value
5. Copy Application (client) ID from the Overview page
6. In Supabase Dashboard → Authentication → Providers → Azure:
   - Enable Azure provider
   - Paste Azure Application ID (Client ID)
   - Paste Client Secret
   - Set Tenant URL: `https://login.microsoftonline.com/common` (for multi-tenant/personal accounts)
   - Save

#### Dropbox Setup
1. Go to [Dropbox Developer Console](https://www.dropbox.com/developers/apps) → Create App
2. Set permissions: `files.metadata.read`, `files.content.read`, `sharing.write`
3. Generate a **refresh token** (offline access):
   ```bash
   # 1. Get authorization URL:
   https://www.dropbox.com/oauth2/authorize?client_id=APP_KEY&token_access_type=offline&response_type=code
   # 2. Exchange the code for tokens:
   curl -X POST https://api.dropbox.com/oauth2/token \
     -d "code=AUTH_CODE&grant_type=authorization_code&client_id=APP_KEY&client_secret=APP_SECRET"
   # 3. Copy refresh_token from the response → DROPBOX_REFRESH_TOKEN
   ```
4. Set `DROPBOX_BASE_PATH` to your root folder (e.g. `/Beyond/Clients`)
5. Per-project, configure the root path in the Entregas tab: e.g. `/Beyond/Clients/ACME/Project-X`

### Database Migrations

Run the SQL migrations in Supabase SQL Editor in order:

```
supabase/migrations/001_initial_schema.sql      # Core tables + RLS policies
supabase/migrations/002_seed_templates.sql      # Global template presets
supabase/migrations/003_client_portal_rbac.sql  # RBAC, client portal, deliverables, Dropbox
```

Or via Supabase CLI:
```bash
supabase db push
```

### Development

```bash
npm install
npm run dev
```

### Build

```bash
npm run build
```

---

## Auth System

### Login Methods (`/login`)

| Method | Who | Session Duration |
|--------|-----|-----------------|
| Email + Password | Team members | 24h default; 30 days with "Lembrar-me" |
| Email OTP (6-digit code) | Anyone with quick access | Always 1 hour |
| Google OAuth | Team members | 24h default; 30 days with "Lembrar-me" |
| Microsoft/Azure OAuth | Team members | 24h default; 30 days with "Lembrar-me" |

### Portal Login (`/portal/login`)

OTP-only. No password, no OAuth. Session is always **1 hour**. No "remember me" option.
Client users must already exist in `client_users` — `shouldCreateUser: false` prevents signup from the portal.

### Session TTL Enforcement

Supabase JWTs have a fixed server-side expiry (~1 hour). We layer an app-level session TTL on top:

- After login, a `bp_session_ttl` cookie is set containing `{login_at, ttl}` as JSON
- The middleware reads this cookie on every request and computes `now < login_at + ttl`
- If expired: Supabase session is signed out, TTL cookie is cleared, user is redirected to the appropriate login page with `?expired=1`
- If no TTL cookie is present: Supabase's own session validity is trusted

### OAuth Flow

```
User clicks Google/Microsoft button
→ signInWithOAuth({ redirectTo: /auth/callback?ttl=30d|24h })
→ Supabase OAuth dance
→ GET /auth/callback?code=...&ttl=...
→ exchangeCodeForSession (server-side)
→ redirect to /auth/set-session?ttl=...&next=/app
→ client sets bp_session_ttl cookie
→ router.replace(/app)
```

### Password Reset Flow

```
User clicks "Esqueci a password" on /login
→ /reset-password (stage 1: email form)
→ resetPasswordForEmail({ redirectTo: /auth/callback?type=recovery })
→ User clicks link in email
→ GET /auth/callback?code=...&type=recovery
→ exchangeCodeForSession (establishes PASSWORD_RECOVERY session)
→ redirect to /reset-password
→ onAuthStateChange fires PASSWORD_RECOVERY event
→ stage 2: new password form
→ updateUser({ password })
→ signOut + clearSessionCookieClient
→ redirect to /login
```

---

## Project Structure

```
src/
├── app/
│   ├── app/                    # Internal authenticated routes
│   │   ├── page.tsx            # Dashboard
│   │   ├── projects/           # Project list + [id] pricing builder (+ Entregas tab)
│   │   ├── checklists/         # Checklist list + [id] detail
│   │   ├── templates/          # Template grid + modal
│   │   ├── insights/           # Analytics + guardrails
│   │   ├── clients/            # Client management backoffice
│   │   ├── rates/              # Base rate management
│   │   └── preferences/        # User preferences + AI tagging toggle
│   ├── portal/                 # Client portal (separate from /app)
│   │   ├── layout.tsx          # Portal shell (header, auth guard)
│   │   ├── login/              # OTP-only login (6-digit code, 1h session)
│   │   ├── page.tsx            # Client's project list
│   │   └── projects/[id]/      # Project detail (Overview, Entregas, Approvals)
│   ├── api/dropbox/
│   │   ├── sync/               # POST /api/dropbox/sync?projectId=...
│   │   └── ai-tag/             # POST /api/dropbox/ai-tag?fileId=...
│   ├── auth/
│   │   ├── callback/           # OAuth PKCE + password recovery handler
│   │   ├── set-session/        # Client shim: sets TTL cookie after OAuth
│   │   └── auth-code-error/    # Error page for failed code exchange
│   ├── login/                  # Internal auth (Password + OTP + Google + Microsoft)
│   └── reset-password/         # Password reset flow (request + update stages)
├── components/
│   └── AppShell.tsx            # Sidebar + mobile bottom nav
├── lib/
│   ├── authz.ts                # RBAC helpers (hasProjectRole, requireProjectAccess)
│   ├── calc.ts                 # Core pricing engine
│   ├── dropbox.ts              # Dropbox API (token refresh, sync, shared links)
│   ├── pdf.ts                  # PDF + CSV export
│   ├── session.ts              # Session TTL helpers (encode/decode cookie, isSessionValid)
│   ├── supabase-ephemeral.ts   # Browser client with persistSession: false (OTP)
│   ├── types.ts                # All TypeScript types
│   ├── utils.ts                # cn(), fmtEur(), etc.
│   ├── supabase.ts             # Browser Supabase client
│   └── supabase-server.ts      # Server Supabase client
└── middleware.ts               # Auth + TTL enforcement (/app/*, /portal/*, /auth/*)
```

### RBAC Roles

| Role | Description |
|------|-------------|
| `owner` | Full project + client management |
| `admin` | Can manage members, view all |
| `editor` | Can edit project content |
| `client_viewer` | Read-only portal access |
| `client_approver` | Portal access + can submit approvals |

---

## Vercel Deployment

1. Push to `main` branch
2. Set env vars in Vercel project settings
3. Deploy

Add all env vars in Vercel → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `DROPBOX_APP_KEY`
- `DROPBOX_APP_SECRET`
- `DROPBOX_REFRESH_TOKEN`
- `DROPBOX_BASE_PATH`
- `OPENAI_API_KEY` *(optional, for AI photo tagging)*

---

## License

Private — Beyond Focus Studios
