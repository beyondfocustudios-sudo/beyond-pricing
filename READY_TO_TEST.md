# Ready to Test (10 passos)

1. Atualizar DB remoto: `supabase db push` (migration `036` já incluída).
2. Garantir env local: `.env.local` e `.env.db` válidos (sem expor secrets).
3. Build: `npm run build`.
4. Smoke E2E: `E2E_EMAIL="..." E2E_PASSWORD="..." npm run test:smoke`.
5. Login Team: validar acesso a `/app/dashboard` sem loops e sem erro infinito.
6. CRUD core: criar/editar/apagar (soft delete) em Projects, Tasks, Journal, CRM, Clients.
7. Review flow: criar deliverable+versão, comentar, resolver thread, comment->task, aprovar/pedir alterações.
8. Guest review link: criar link partilhável, comentar como guest, confirmar bloqueio a APIs privadas sem sessão.
9. Insights/Diagnostics: validar exclusão archived/deleted e `/app/diagnostics` com checks verdes de plugins/cache.
10. Auditoria final schema: `cd app && export $(cat .env.local | xargs) && npx tsx scripts/audit-schema-gaps-standalone.ts` deve retornar `✅ READY`.
