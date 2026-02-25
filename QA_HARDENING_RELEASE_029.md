# QA Hardening Release 029

## 1) Auditoria automática
- `npm run build`: OK
- `npm run lint`: OK (warnings apenas de `<img>` em review pages)
- `npx tsc --noEmit`: OK
- `npm run db:audit` (com `.env.local`): ✅ READY (0 missing tables/columns)
- `npm run test:smoke`: executa; requer credenciais E2E para não fazer skip

## 2) Feature inventory (app + portal)
### /app principais
- Dashboard, Projects, Templates, Checklists, Clients, Inbox, Journal, Tasks, CRM, Insights, Integrations, Diagnostics, Support
- Dependências DB principais: `projects`, `project_members`, `templates`, `template_items`, `checklists`, `checklist_items`, `clients`, `client_users`, `conversations`, `messages`, `journal_entries`, `tasks`, `crm_*`, `deliverables`, `review_*`, `plugin_status`, `plugin_runs`, `support_tickets`

### /portal principais
- `/portal`, `/portal/projects/[id]`, `/portal/review/[deliverableId]`, `/review-link/[token]`
- Dependências DB principais: `projects`, `deliverables`, `deliverable_versions`, `review_threads`, `review_comments`, `approvals`, `review_links`, `messages`, `notifications`

### Plugins ativos
- Weather: `/api/plugins/weather` -> `weather_cache` (TTL 8h)
- Route: `/api/plugins/route` -> `route_cache` (TTL 7d)
- Fuel: `/api/plugins/fuel` -> `fuel_cache` (TTL 24h)
- Diagnostics plugin telemetry: `plugin_status`, `plugin_runs`

## 3) Bugs prováveis mapeados (antes do hardening)
- payload externo inválido (Nominatim/Open-Meteo/OSRM) sem validação rígida
- fallback manual fraco em logística/combustível quando API indisponível
- cobertura E2E incompleta para guardrails de auth (team/portal/collaborator)
- diagnósticos sem visão de `plugin_status` e `support_tickets`

## 4) Correções aplicadas neste release
- validação `zod` nos payloads externos de plugins:
  - `src/app/api/plugins/weather/route.ts`
  - `src/app/api/plugins/route/route.ts`
- hardening do tab de logística com fallback manual:
  - `src/components/ProjectLogisticsTab.tsx`
  - fallback manual de km/min (guardar no projeto)
  - fallback manual de combustível (€/L)
  - retry explícito para weather/fuel
  - tratamento seguro de payloads
- diagnósticos melhorados:
  - `src/app/app/diagnostics/page.tsx`
  - adiciona checks de `plugin_status`, `plugin_runs`, `support_tickets`
- smoke tests ampliados:
  - `e2e/smoke.spec.ts`
  - guardrail: team não permanece no `/portal`
  - collaborator mode restrictions (com credenciais opcionais)
  - verificação de `/app/integrations` sem crash/regressão

## 5) Risco residual
- testes E2E de cliente portal dependem credenciais/OTP reais no ambiente
- warnings de `<img>` pendentes (não bloqueiam build)

