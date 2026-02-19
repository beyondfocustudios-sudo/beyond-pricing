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
| Auth | Supabase Magic Link PKCE |
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
- Separate login page at `/portal/login` (email + password)
- Project list: clients see only their projects (RLS-enforced)
- Project detail: Overview / Entregas (files from Dropbox) / Approvals & Feedback tabs
- First-access password reset flow built-in

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
supabase/migrations/001_initial_schema.sql   # Core tables + RLS policies
supabase/migrations/002_seed_templates.sql   # Global template presets
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

## Auth Flow (Magic Link PKCE)

1. User enters email → Supabase sends magic link
2. Link redirects to `/auth/callback?code=...`
3. Code exchange happens server-side via `@supabase/ssr`
4. Session stored in cookies → all server components have access

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
│   │   ├── login/              # Email+password login
│   │   ├── page.tsx            # Client's project list
│   │   └── projects/[id]/      # Project detail (Overview, Entregas, Approvals)
│   ├── api/dropbox/
│   │   ├── sync/               # POST /api/dropbox/sync?projectId=...
│   │   └── ai-tag/             # POST /api/dropbox/ai-tag?fileId=...
│   ├── auth/callback/          # Magic link PKCE handler
│   └── login/                  # Internal auth page
├── components/
│   └── AppShell.tsx            # Sidebar + mobile bottom nav
├── lib/
│   ├── authz.ts                # RBAC helpers (hasProjectRole, requireProjectAccess)
│   ├── calc.ts                 # Core pricing engine
│   ├── dropbox.ts              # Dropbox API (token refresh, sync, shared links)
│   ├── pdf.ts                  # PDF + CSV export
│   ├── types.ts                # All TypeScript types
│   ├── utils.ts                # cn(), fmtEur(), etc.
│   ├── supabase.ts             # Browser Supabase client
│   └── supabase-server.ts      # Server Supabase client
└── middleware.ts               # Auth middleware (protects /app/* and /portal/*)
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
