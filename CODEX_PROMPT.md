# CODEX PROMPT — Beyond Pricing Implementation

> **Single prompt block** for AI-assisted implementation of the Beyond Pricing platform.
> Copy this entire block into Codex/Claude/GPT to get full context.

---

## Project Context

**Beyond Pricing** is a production management + budgeting SaaS for audiovisual production companies.

**Stack:**
- Next.js 15 (App Router) + React 19
- Supabase (PostgreSQL + RLS + Auth)
- Tailwind CSS v4 + CSS Custom Properties
- Framer Motion (Base44 presets)
- TypeScript strict mode

**Repo:** `/beyond-pricing/app`
**Branch:** `fix/stabilize-core-crud-ui`
**Supabase project:** `wjzcutnjnzxylzqysneg`

---

## Architecture

### Design System
All visual tokens live in `src/app/globals.css` as CSS custom properties:
- **Dual theme**: Dark default (`:root`) + Light (`[data-theme="light"]`)
- **Token groups**: brand, coal, semantic, status, pastel, glass, radii, shadows
- **Components**: btn, input, card, badge, tabs, modal, nav-item, alert, table, skeleton
- **Pill shapes**: All buttons/inputs/tabs use `border-radius: 9999px`
- **Typography**: Manrope (body) + Fraunces (display headings)

### Token Pipeline
```
Figma (Tokens Studio) → design-tokens/tokens.json → npm run tokens:build
  → src/styles/tokens.css (CSS vars)
  → src/lib/motion.ts (Framer Motion presets)
```

### Tailwind Config
`tailwind.config.ts` maps all colors/radii/shadows to CSS variables:
```ts
colors: { brand: { 500: "var(--brand-500)" }, bg: "var(--bg)", ... }
```

### Motion System (`src/lib/motion.ts`)
- **Easings**: Base44 easeOut `[0.22, 1, 0.36, 1]`, easeInOut `[0.4, 0, 0.2, 1]`
- **Springs**: fast (380/32/0.7), ui (300/30/0.8), soft (220/26/0.9)
- **Variants**: page, containerStagger, itemEnter, cardEnter, modalEnter, tab, listItem, fadeIn
- **Helpers**: `useMotionEnabled()`, `buttonMotionProps()`, `cardHoverProps()`
- Auto-respects `prefers-reduced-motion`

### Database Schema
28 tables with full RLS. Key tables:
- `projects` (14+ cols: id, user_id, project_name, client_name, status, inputs, calc, location_*, travel_*, deleted_at, owner_user_id)
- `checklists`, `checklist_items`, `templates`, `template_items`
- `clients`, `crm_contacts`, `crm_deals`, `crm_companies`, `crm_stages`, `crm_activities`
- `journal_entries`, `tasks`, `team_members`, `organizations`
- `conversations`, `messages`, `call_sheets`, `catalog_items`
- Portal: `portal_pages`, `portal_briefs`, `portal_deliverables`, `portal_approvals`, `portal_requests`

**Soft delete**: All critical tables have `deleted_at` column. RLS filters `WHERE deleted_at IS NULL`.

**Column aliases**: PT/EN sync triggers (nome/name, texto/text, concluido/completed).

### Route Structure
```
/app                    — Dashboard
/app/projects           — Project list + CRUD
/app/projects/[id]      — Project detail + calculator
/app/checklists         — Checklists
/app/tasks              — Kanban task board
/app/journal            — Private journal
/app/crm                — CRM contacts/deals
/app/clients            — Client management (org-level RBAC)
/app/callsheets         — Call sheet management
/app/logistics          — Route/logistics planning
/app/inbox              — Conversations/messaging
/app/insights           — Charts/analytics
/app/templates          — Budget templates
/portal                 — Client portal (separate nav)
/portal/login           — Portal auth
/portal/projects/[id]   — Client project view
```

---

## Coding Conventions

### Data Fetching Pattern
```tsx
const [data, setData] = useState<Type[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState<string | null>(null);

const load = useCallback(async () => {
  setLoading(true);
  setError(null);
  try {
    const res = await fetch("/api/endpoint");
    if (!res.ok) throw new Error("Failed");
    const json = await res.json();
    setData(json);
  } catch (e: any) {
    setError(e.message);
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => { load(); }, [load]);
```

### CSS Classes (not Tailwind utilities for core components)
Use design system classes from `globals.css`:
```html
<button className="btn btn-primary">Save</button>
<input className="input" />
<div className="card card-hover">...</div>
<span className="badge badge-success">Active</span>
<div className="page-header"><h1 className="page-title font-display">Title</h1></div>
```

### Framer Motion Usage
```tsx
import { motion, AnimatePresence } from "framer-motion";
import { variants, transitions } from "@/lib/motion";

<motion.div variants={variants.page} initial="initial" animate="animate" exit="exit" transition={transitions.page}>
  ...
</motion.div>
```

### Error States
Every page MUST have:
```tsx
if (error) return (
  <div className="empty-state">
    <p className="empty-title">Error</p>
    <p className="empty-desc">{error}</p>
    <button className="btn btn-secondary" onClick={load}>Retry</button>
  </div>
);
```

### Toast Notifications
```tsx
import { useToast } from "@/components/Toast";
const { addToast } = useToast();
addToast({ type: "success", message: "Saved!" });
```

---

## npm Scripts

```bash
npm run dev              # Next.js dev server
npm run build            # Production build
npm run tokens:build     # Compile design tokens → CSS + motion.ts
npm run tokens:validate  # Validate token JSON structure
npm run db:push          # Push migrations to Supabase
npm run db:status        # List migration status
npm run db:audit         # Audit schema gaps
npm run test:smoke       # Playwright smoke tests
```

---

## CI Pipeline

On every PR to `main`:
1. Install deps (`npm ci`)
2. Validate tokens (`tokens:validate`)
3. Type check (`tsc --noEmit`)
4. Build (`npm run build`)

---

## Current Status

- **Database**: 28/28 tables deployed, 21 migrations applied, schema ✅ READY
- **Build**: Compiles with 0 errors, 62 routes
- **Theme**: Dual dark/light with localStorage persistence
- **Sidebar**: Apple-style icon sidebar with pill navigation
- **CRUD**: All pages have data fetch + error + retry pattern
- **RBAC**: Org-level access on clients page, user-level on personal data

---

## When Implementing New Features

1. Check if relevant table exists (see DB schema above)
2. Use design system classes from `globals.css` — DO NOT use raw Tailwind for core UI
3. Follow the data fetching pattern with `useCallback` + `useEffect`
4. Add framer-motion animations using `variants` from `@/lib/motion`
5. Include error state + retry button
6. Use toast for user feedback
7. Test with `npm run build` before committing
