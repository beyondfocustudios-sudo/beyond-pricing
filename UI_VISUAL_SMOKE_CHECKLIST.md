# UI Visual Smoke Checklist

## Dashboard
- [ ] `/app` abre com shell super-card, top nav pills e top schedule bar.
- [ ] Toggle `CEO/Empresa` muda layout e persiste após refresh.
- [ ] `ThemeToggle` (top-right) alterna Light/Dark e persiste após refresh.

## Core Pages
- [ ] `/app/projects` renderiza cards, filtros pills e paginação sem quebra visual.
- [ ] `/app/projects/[id]` abre tabs e cards sem regressão funcional.
- [ ] `/app/clients`, `/app/inbox`, `/app/tasks`, `/app/templates`, `/app/insights` renderizam dentro do mesmo shell.

## Portal
- [ ] `/portal` usa shell simplificado com os mesmos tokens.
- [ ] Toggle de tema no portal funciona e persiste.

## Responsive
- [ ] Desktop: top nav pills visível e conteúdo em grid modular.
- [ ] Tablet: layout reorganiza sem overlap.
- [ ] Mobile: bottom nav visível, topbar compacta e sem clipping.

## Regression
- [ ] Criar projeto.
- [ ] Editar nome do projeto.
- [ ] Apagar (soft delete) projeto.
- [ ] Criar tarefa.
- [ ] Abrir inbox e criar conversa.
