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

---

## Setup

### Environment Variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### Database Migrations

Run the SQL migrations in Supabase SQL Editor in order:

```
supabase/migrations/001_initial_schema.sql   # Tables + RLS policies
supabase/migrations/002_seed_templates.sql   # Global template presets
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
│   ├── app/                    # Authenticated app routes
│   │   ├── page.tsx            # Dashboard
│   │   ├── projects/           # Project list + [id] pricing builder
│   │   ├── checklists/         # Checklist list + [id] detail
│   │   ├── templates/          # Template grid + modal
│   │   ├── insights/           # Analytics + guardrails
│   │   ├── rates/              # Base rate management
│   │   └── preferences/        # User preferences
│   ├── auth/callback/          # Magic link PKCE handler
│   └── login/                  # Auth page
├── components/
│   └── AppShell.tsx            # Sidebar + mobile bottom nav
├── lib/
│   ├── calc.ts                 # Core pricing engine
│   ├── pdf.ts                  # PDF + CSV export
│   ├── types.ts                # All TypeScript types
│   ├── utils.ts                # cn(), fmtEur(), etc.
│   ├── supabase.ts             # Browser Supabase client
│   └── supabase-server.ts      # Server Supabase client
└── middleware.ts               # Auth middleware (protects /app/*)
```

---

## Vercel Deployment

1. Push to `main` branch
2. Set env vars in Vercel project settings
3. Deploy

Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel → Settings → Environment Variables.

---

## License

Private — Beyond Focus Studios
