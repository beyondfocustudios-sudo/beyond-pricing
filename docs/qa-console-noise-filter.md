# QA Console Noise Filter

Objetivo: evitar falsos positivos no QA quando o browser injeta erros de extensões ou tooling local.

## O que é ignorado (somente em `development`)

- Logs com `chrome-extension://`
- `FrameDoesNotExistError`
- mensagens de `manifest`/`permissions`
- `background.js`
- websocket local `localhost:8081`

## O que **não** é ignorado

- Erros da app (`/_next/static/...`, `src/...`, `api/...`)
- Erros de runtime React/Supabase/Next
- Falhas de fetch e exceptions de componentes

## Implementação

- Componente: `src/components/DevConsoleNoiseFilter.tsx`
- Montagem: `src/components/Providers.tsx`
- Escopo: apenas `NODE_ENV=development`
- Produção: comportamento de consola intacto

