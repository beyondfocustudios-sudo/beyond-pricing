# Beyond Pricing — Project Instructions

## Tech Stack
- Next.js 14+ App Router, Tailwind CSS v4, Framer Motion, Supabase, Dropbox OAuth, Resend email
- Fonts: DM Serif Display (headings), DM Sans (body), JetBrains Mono (numbers)
- Icons: Lucide React, Charts: Recharts

## Design System (FROZEN)
- Background: #F5F6FA
- Cards: white, 16px border-radius, subtle shadow
- Accent: #1B4965 (petrol blue), Secondary: #5FA8D3 (teal)
- Priority: Urgent #EF4444, High #F97316, Medium #1B4965, Low #64748B
- Sidebar: icon-only sempre (sem text labels)
- Topbar: "Beyond Focus" wordmark + CEO|Team|Clients toggle + search + date "1-7 Mar, 2026" + notifications + dark/light + avatar

## Three Areas
- CEO (`/app/(ceo)`) — 15 screens aprovados, dashboard pessoal/estratégico
- Empresa (`/app/(empresa)`) — hub operacional, produção, equipa
- Freelancer (`/app/(freelancer)`) — vista limitada para externos
- Client Portal (`/app/(portal)`) — já construído, NÃO modificar

## CSS Variables (globals.css)
- `--bg`: background principal
- `--surface`: card/panel background
- `--text`, `--text-2`, `--text-3`: hierarquia de texto
- `--accent`: #1B4965 petrol blue
- `--accent-2`: #5FA8D3 teal
- `--border`: border color

## Rules (NUNCA violar)
- JetBrains Mono para TODOS os números financeiros (`font-mono`)
- Sidebar SEMPRE icon-only (width 64px), sem text labels
- EUR (€) com formatação portuguesa: `Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })`
- Framer Motion para TODAS as animações (nunca CSS transitions puras)
- `"use client"` apenas onde necessário; preferir Server Components
- Nunca apagar ou modificar `/app/(portal)/` sem autorização explícita
- Nunca apagar ou modificar `/app/app/` (app existente) sem autorização explícita
- Componentes novos em `/src/components/ceo/`, `/src/components/empresa/`, `/src/components/freelancer/` ou `/src/components/shared/`
- Tipos em `/src/types/`
- Hooks em `/src/hooks/`
- Constantes e config em `/src/lib/constants/`

## Área CEO — Screens Aprovados (15)
1. Dashboard (overview estratégico)
2. Journal (diário do CEO)
3. Tasks (tarefas pessoais)
4. Inbox (mensagens filtradas)
5. Calendar (agenda pessoal)
6. Projects (visão global de projetos)
7. Documents (biblioteca de documentos)
8. Clients (gestão de clientes)
9. Insights (analytics e métricas)
10. Settings

## Área Empresa — Screens
1. Dashboard (operacional)
2. Operações (pipeline de produção)
3. Projetos (gestão de projetos)
4. Orçamentos (quotes/proposals)
5. Clientes (CRM)
6. Inbox (comunicações)
7. Equipa (team management)
8. Integrações (Dropbox, Google, etc.)
9. Financeiro (P&L, invoicing)
10. Settings

## Área Freelancer — Screens
1. Home (dashboard simplificado)
2. Projetos (projetos atribuídos)
3. Tarefas (tarefas do freelancer)
4. Mensagens (comunicação com equipa)
5. Ficheiros (ficheiros do projeto)
6. Timesheet (registo de horas)

## Component Patterns
```tsx
// Números financeiros — SEMPRE assim:
<span className="font-mono">
  {new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value)}
</span>

// Animação de entrada padrão:
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
>

// Status badge pattern — usar StatusBadge component
// Stat card pattern — usar StatCard component
```

## Git Conventions
- Branch: `feature/ceo-*`, `feature/empresa-*`, `feature/freelancer-*`
- Commits: `feat(ceo):`, `feat(empresa):`, `feat(freelancer):`, `fix():`, `refactor():`
- Nunca push direto para main sem CI pass
