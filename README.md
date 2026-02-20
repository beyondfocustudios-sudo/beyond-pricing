# Beyond Pricing — OS de Produtora Audiovisual

Plataforma completa para gestão de produção audiovisual: orçamentos, portal do cliente, logística, journal, tarefas, CRM, mensagens e muito mais.

## Stack

- **Frontend**: Next.js 15 (App Router) + Tailwind v4 + Framer Motion
- **Backend**: Supabase (Postgres + Auth + RLS)
- **Deploy**: Vercel (Node.js runtime)
- **Auth**: Email+Password, OTP (6 dígitos), Google OAuth, Microsoft OAuth
- **Modelo**: Invite-only (signups públicos desactivados)

---

## Env Vars

### Obrigatórias

| Variável | Onde encontrar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (secreto) |

### Opcionais

| Variável | Feature activada |
|---|---|
| `OPENAI_API_KEY` | Resumos journal, parse de tarefas, sugestão de resposta portal |
| `RESEND_API_KEY` | Envio de emails |
| `SMTP_HOST/PORT/USER/PASS` | Alternativa ao Resend |
| `EMAIL_FROM` | Remetente dos emails |
| `GOOGLE_DISTANCE_API_KEY` | Google Distance Matrix para logística |
| `CRON_SECRET` | Auth para /api/notifications/dispatch |
| `NEXT_PUBLIC_APP_URL` | URL base para links nos emails |
| `DROPBOX_APP_KEY/APP_SECRET` | Integração Dropbox |

---

## Configuração Supabase

### Authentication → Providers → Email
- **Enable Email provider**: ON
- **Enable Email Signup**: OFF (invite-only)

### Authentication → URL Configuration
- Site URL: `https://beyond-pricing-f7iandu3b-beyondfocustudios-sudos-projects.vercel.app`
- Redirect URLs:
  - `https://beyond-pricing-f7iandu3b-beyondfocustudios-sudos-projects.vercel.app/auth/callback`
  - `http://localhost:3000/auth/callback`
  - `https://*.vercel.app/auth/callback`

### Migrations (correr por ordem no SQL Editor como service_role)
```
001_initial_schema.sql
002_seed_templates.sql
003_client_portal_rbac.sql
004_portal_messaging.sql
005_premium_features.sql
006_seed_checklist_templates.sql
007_admin_bootstrap.sql
```

---

## Admin

```
Email:    daniellopes@beyondfocus.pt
Password: tadIdSz3G0NKL1jk
Role:     owner (app_metadata.role = "owner")
```

---

## Módulos /app (equipa)

| Rota | Módulo |
|---|---|
| `/app` | Dashboard |
| `/app/projects/[id]` | Editor + PDF + CSV + Slides (.pptx) |
| `/app/checklists` | Checklists Pre/Rodagem/Pós |
| `/app/templates` | Templates de orçamento |
| `/app/clients` | Clientes e utilizadores portal |
| `/app/inbox` | Mensagens do portal |
| `/app/journal` | Diário de produção + voz + export |
| `/app/tasks` | Tarefas kanban |
| `/app/crm` | Contactos CRM |
| `/app/logistics` | Rotas e distâncias |
| `/app/weather` | Meteorologia |
| `/app/insights` | Analytics |

## Módulos /portal (clientes)

| Rota | Módulo |
|---|---|
| `/portal` | Lista de projetos |
| `/portal/projects/[id]` | Detalhe + entregas + aprovações |

---

## PPTX Export

Botão "Slides" no toolbar do projeto → `GET /api/export/pptx?projectId=xxx`

6 slides: Capa · Resumo · Breakdown · Top Items · Entregáveis · Termos Comerciais

Sem API externa — geração 100% local via pptxgenjs.

**Smoke test:**
1. Abre um projeto com itens
2. Clica "Slides" no toolbar
3. Download .pptx → abre no PowerPoint/Keynote/LibreOffice
4. Verifica 6 slides com dados do projeto

---

## Ditado por Voz (grátis)

Web Speech API — sem custos, sem API externa.

- Hook: `useVoiceDictation()` em `src/lib/voice/useVoiceDictation.ts`
- Componente: `<VoiceButton onInsert={fn} />`
- Língua: pt-PT → pt-BR → en-US (fallback automático)
- Requer Chrome ou Edge

**Integrado em:** `/app/journal` (botão "Ditado" no editor), `/app/tasks` (título da tarefa)

---

## Email / Notificações

`POST /api/notifications/dispatch` com header `x-cron-secret: {CRON_SECRET}`

Vercel Cron (vercel.json):
```json
{"crons": [{"path": "/api/notifications/dispatch", "schedule": "*/5 * * * *"}]}
```

---

## Checklist QA

### Auth
- [ ] Login password: daniellopes@beyondfocus.pt / tadIdSz3G0NKL1jk → /app
- [ ] Login OTP: código 6 dígitos → entra, sessão 1h
- [ ] OTP portal (/portal/login): mesmo fluxo
- [ ] Google OAuth → /app com TTL 24h
- [ ] Session expirada → redirect com ?expired=1
- [ ] Signup bloqueado (anon signUp() → erro)

### PPTX
- [ ] Projeto com itens → "Slides" → download .pptx → abre correctamente
- [ ] Projecto vazio → gera sem erro

### Portal Mensagens
- [ ] Enviar msg como equipa → notificação criada
- [ ] Marcar como lida

### Logística
- [ ] POST /api/logistics com origin/destination → guarda rota
- [ ] Sem GOOGLE_DISTANCE_API_KEY → hasApiData: false

### Meteorologia
- [ ] GET /api/weather?location=Lisboa → dados Open-Meteo
- [ ] 2ª chamada → fromCache: true

### Ditado por Voz
- [ ] Chrome: Journal → "Ditado" → falar → "Inserir" → texto no textarea
- [ ] Safari → banner "não disponível"

### Build
- [ ] npm run build → sem erros TS
- [ ] Todas as rotas API retornam 401 sem token

---

## Dev Local

```bash
git clone https://github.com/beyondfocustudios-sudo/beyond-pricing
cd beyond-pricing/app
cp .env.local.example .env.local  # preencher vars
npm install
npm run dev
```

*Beyond Focus Studios © 2026*
