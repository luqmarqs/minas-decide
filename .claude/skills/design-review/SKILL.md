---
name: design-review
description: Revisão visual e de acessibilidade com evidências (capturas, axe, Lighthouse, contraste de tokens). Use após mudanças de UI ou antes de fechar uma rodada.
---

1. `npm run build && npx wrangler dev --env local --port 8791` (ou outra porta livre).
2. `node scripts/visual/capture.mjs` — capturas desktop 1440 e mobile 390 em `docs/screenshots/final*/`, axe por tela, overflow horizontal, teclado do combobox, reduced motion.
3. `node scripts/visual/contrast.mjs` — contraste WCAG dos pares de tokens (claro e escuro); texto ≥ 4,5:1, bordas de controle ≥ 3:1.
4. `npx --yes lighthouse <url> --form-factor=mobile --only-categories=performance,accessibility,best-practices --chrome-flags="--headless=new" --output=json` com `CHROME_PATH` do Chromium do Playwright; registre Perf/A11y/BP, LCP, TBT, CLS.
5. Revise: selo DEMO/validado, legenda com unidade/fonte/versão, estados vazio/erro/carregando, foco visível, alvos ≥ 44 px, sem overflow, tema escuro.
6. Relate achados com severidade, tela, caminho da captura e correção sugerida. Não imponha preferência estética sem critério.
