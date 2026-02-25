# Design Tokens — Beyond Pricing

## Overview

This directory holds the **single source of truth** for the Beyond Pricing design system.

Tokens are exported from **Tokens Studio** (Figma plugin) as JSON, then compiled into:
- `src/styles/tokens.css` — CSS custom properties (`:root` + `[data-theme="light"]`)
- `src/lib/motion.ts` — Framer Motion presets (springs, easings, variants)
- `tailwind.config.ts` — Colors mapped to CSS vars

## Workflow

```
Figma (Tokens Studio) → tokens.json → npm run tokens:build → CSS + TS
```

### 1. Export from Figma
1. Open Figma → Tokens Studio plugin
2. Export as JSON (single file)
3. Save as `design-tokens/tokens.json`

### 2. Build
```bash
npm run tokens:build
```

### 3. Validate (CI runs this automatically)
```bash
npm run tokens:validate
```

## File Structure

```
design-tokens/
  tokens.example.json   ← Schema reference (committed)
  tokens.json           ← Your actual export (gitignored)
  README.md             ← This file
```

## Token Schema

Follows Tokens Studio format with custom `motion` and `typography` extensions:

| Group       | Description                          |
|-------------|--------------------------------------|
| `brand`     | Brand color scale (50–900)           |
| `coal`      | Dark base palette (100–950)          |
| `semantic`  | Theme-aware tokens (dark/light)      |
| `status`    | Success/warning/error                |
| `pastel`    | Accent pastels per theme             |
| `glass`     | Glass morphism values                |
| `radii`     | Border radius scale                  |
| `shadows`   | Box shadows per theme                |
| `motion`    | Easing curves + springs + durations  |
| `typography`| Font families                        |

## Notes
- `tokens.json` is **gitignored** — only `tokens.example.json` is committed
- The build script is idempotent — safe to re-run at any time
- CI validates token structure on every PR
