# Beyond Pricing — Platform SaaS Completa

Plataforma completa para produtoras de vídeo: gestão de orçamentos, portal do cliente, CRM, tarefas, journaling, call sheets, logística, e muito mais.

## Stack

- **Framework**: Next.js 15 (App Router) + React 19
- **Estilos**: Tailwind CSS v4
- **Base de dados**: Supabase (PostgreSQL + RLS + Realtime)
- **Auth**: Supabase Auth (OTP código, Password, OAuth Google/Microsoft)
- **Deploy**: Vercel
- **Ficheiros**: Dropbox API (OAuth + refresh token + sync incremental)
- **Voz**: Web Speech API (browser nativo, grátis)
- **Meteo**: Open-Meteo (grátis, sem key)
- **Geo**: OpenStreetMap + Nominatim (grátis)
- **IA**: OpenAI (completamente opcional, OFF por defeito)

---

## Variáveis de Ambiente

### Obrigatórias

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OWNER_EMAIL=daniellopes@beyondfocus.pt
```

### Dropbox (para sync de entregas)

```env
DROPBOX_APP_KEY=xxx
DROPBOX_APP_SECRET=xxx
```

### Email (opcional — sem estes, apenas notificações in-app)

```env
RESEND_API_KEY=re_xxx
SMTP_FROM=noreply@beyondfocus.pt
```

### OpenAI (opcional — todas as features têm fallback grátis)

```env
OPENAI_API_KEY=sk-xxx
ASSISTANT_MODEL=gpt-5-mini
```

### Vercel Cron

```env
CRON_SECRET=xxx
```

---

## Configuração Supabase

### 1. Executar migrações (por ordem no SQL Editor)

```
001_initial_schema.sql
002_seed_templates.sql
003_client_portal_rbac.sql
004_portal_messaging.sql
005_premium_features.sql
006_seed_checklist_templates.sql
007_admin_bootstrap.sql
008_rbac_soft_delete.sql
009_portal_enhancements.sql
010_dropbox_sync.sql
011_callsheets_weather.sql
012_crm_deals_pipeline.sql
```

### 2. Auth Settings (Dashboard → Authentication → Settings)

- **Disable signups**: ON
- **Email provider**: ON
- **OTP expiry**: 3600
- **Site URL**: `https://beyond-pricing.vercel.app`
- **Redirect URLs**: `https://beyond-pricing.vercel.app/auth/callback`

### 3. Bootstrap do owner (uma vez após deploy)

```bash
curl -X POST https://beyond-pricing.vercel.app/api/admin/bootstrap
```

---

## Configuração Dropbox

1. Criar app em [dropbox.com/developers](https://www.dropbox.com/developers)
2. **Redirect URI**: `https://beyond-pricing.vercel.app/api/dropbox/callback`
3. Permissões: `files.metadata.read`, `files.content.read`
4. Copiar `App key` e `App secret` para `.env`
5. Ligar em `/app/projects/[id]` → aba "Entregas" → "Conectar Dropbox"

---

## Módulos

### Área Interna (/app)

| Rota | Módulo |
|------|--------|
| /app | Dashboard |
| /app/projects | Projetos + Orçamentos |
| /app/projects/[id] | Detalhe (itens, PPTX, Dropbox, timeline) |
| /app/clients | Clientes + convites (admin only) |
| /app/checklists | Checklists de produção |
| /app/templates | Templates reutilizáveis |
| /app/tasks | Kanban drag-drop + voz |
| /app/crm | Contactos + Pipeline de deals |
| /app/journal | Notas + voz + export .md |
| /app/inbox | Mensagens com clientes |
| /app/callsheets | Call Sheets + scaletta |
| /app/logistics | Planeador de rotas + gasolina |
| /app/weather | Open-Meteo para dias de rodagem |
| /app/insights | Análise de orçamentos |
| /app/support | Centro de tickets (owner/admin) |

### Portal do Cliente (/portal)

| Rota | Descrição |
|------|-----------|
| /portal | Lista de projetos |
| /portal/projects/[id] | Overview + Entregas + Pedidos + Mensagens |

---

## RBAC

| Role | Acesso |
|------|--------|
| `owner` | Tudo — gestão de clientes, membros, admin |
| `admin` | Maioria dos recursos |
| `member` | Projetos onde é membro |
| `client_viewer` | Portal — só leitura |
| `client_approver` | Portal — pode aprovar e criar pedidos |

### Convidar membro

```bash
curl -X POST /api/admin/invite \
  -H "Content-Type: application/json" \
  -d '{"email":"novo@beyond.pt","role":"member"}'
```

### Convidar colaborador para projeto

```bash
curl -X POST /api/projects/<project_id>/collaborators/invites \
  -H "Content-Type: application/json" \
  -d '{"email":"colab@studio.pt","role":"editor","expiresInDays":7}'
```

O colaborador conclui o setup em `/portal/invite?token=...` e fica associado ao projeto.

---

## Dropbox — Categorização Automática

| Padrão | Resultado |
|--------|-----------|
| `*.mp4`, `*.mov`, `*.r3d` | categoria: `video` |
| `*.jpg`, `*.raw`, `*.dng` | categoria: `photo` |
| `FINAL`, `EXPORT` no nome | categoria: `final` |
| `GRADE` no nome | categoria: `grade` |
| Pasta `01_PRE` / `PRE_PRODUCAO` | fase: `pre` |
| Pasta `02_SHOOT` / `RODAGEM` | fase: `shoot` |
| Pasta `03_POST` / `POS_PRODUCAO` | fase: `post` |
| Pasta `04_FINAL` / `ENTREGA` | fase: `final` |

---

## Cron (Vercel)

Criar `vercel.json` na raiz do projeto:

```json
{
  "crons": [
    {
      "path": "/api/notifications/dispatch",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

---

## QA Checklist

### Auth
- [ ] Login password → /app
- [ ] Login OTP código → /app
- [ ] Reset password funcional
- [ ] Login portal OTP → /portal
- [ ] Logout funcional

### Projetos
- [ ] Criar projeto + itens + calcular
- [ ] Export PPTX (download)
- [ ] Export PDF
- [ ] Conectar Dropbox + sync + filtros

### Portal Cliente
- [ ] Login OTP em /portal/login
- [ ] Ver projetos em /portal
- [ ] Ver milestones + progresso
- [ ] Criar pedido
- [ ] Enviar mensagem

### Notificações
- [ ] Bell badge com unread count
- [ ] Marcar como lido
- [ ] Marcar tudo como lido

### Call Sheets
- [ ] Criar com equipa + scaletta
- [ ] Ver detalhes
- [ ] Eliminar (soft delete)

### CRM
- [ ] Adicionar contacto
- [ ] Import/Export CSV
- [ ] Pipeline de deals + mover stages

### Tarefas
- [ ] Criar tarefa por coluna
- [ ] Drag-drop entre colunas
- [ ] Ditar com voz (Chrome/Edge)

### Journal
- [ ] Criar entrada com voz
- [ ] Export markdown
- [ ] Summarize heurístico

---

## Segurança

- **Invite-only**: signups desativados no Supabase
- **RLS**: todas as tabelas com Row Level Security
- **Service role**: apenas em server-side routes
- **Session TTL**: OTP = 1h, normal = 24h, "lembrar-me" = 30d
- **Rate limiting**: todos os API endpoints
- **Soft delete**: projetos, clientes, tarefas, CRM
- **Audit log**: `audit_log` para ações críticas

---

## HQ Assistant v2

- Widget ativo em `/app/*` e `/portal/*` (feature flag em `org_settings.enable_hq_assistant`)
- Tabs: `Ações`, `Pesquisa`, `Assistente`
- AI só para equipa interna e apenas quando:
  - `org_settings.enable_ai_assistant = true`
  - `OPENAI_API_KEY` configurada
- Limite semanal por user: `org_settings.ai_weekly_limit` (default 50)

### Ativar AI (rápido)

1. Definir env no Vercel:
   - `OPENAI_API_KEY`
   - `ASSISTANT_MODEL=gpt-5-mini`
2. Em DB, ligar flag:
   - `update org_settings set enable_ai_assistant = true;`
3. Ajustar limite semanal se necessário:
   - `update org_settings set ai_weekly_limit = 50;`

---

## How To Test In Prod (rápido)

1. Login Equipa em `/login?mode=team` e confirmar redirect para `/app/dashboard`.
2. Abrir `/app/projects`, criar projeto e entrar no detalhe.
3. No detalhe do projeto, testar tab **Logística**:
   - geocode automático
   - fallback manual de km/min
   - weather/fuel com retry.
4. Arquivar projeto e confirmar que desaparece da lista principal.
5. Abrir `/app/templates`, criar projeto a partir de template e validar abertura.
6. Abrir `/app/tasks`, criar tarefa, mover coluna e validar persistência após refresh.
7. Abrir `/app/clients` (owner/admin), gerar convite de cliente e copiar link.
8. Abrir `/app/integrations` e confirmar que carrega sem erro (owner/admin only).
9. Abrir `/app/insights` e confirmar métricas sem contar projetos deleted/archived.
10. Abrir `/app/diagnostics` e confirmar checks verdes (DB + plugins + support logs).

