# Capturas comparativas — redesign editorial (branch `redesign-editorial`)

Roteiro único (`scripts/visual/redesign-capture.mjs <base> <pasta>`): 4 viewports (m390 = 390×844, t768 = 768×1024, l1024 = 1024×768, d1440 = 1440×900) × 2 temas (light/dark), com movimento reduzido.

| Pasta | Origem | Conteúdo |
|---|---|---|
| `antes/` | staging em 2026-10-09 (main `b0d84ca`) | `home-*` (página inteira), `hero-*` (só a região do hero), `story-*`, `infografico-*`, `agenda-*`, `participar-*`, `mapa-bh-*` |
| `depois/` | build final da branch (`60c51a0`, `build:local`) | mesmos arquivos — comparação direta antes/depois por nome |
| `depois-story/` | narrativa com movimento: `story-sticky-s1..s5-{l1024,d1440}-{light,dark}` (cada momento no palco fixo), `story-view-s1..s3-{m390,t768}-*` | scrollytelling desktop e composição mobile/tablet |
| `depois-infografico/` | seção isolada em 4 viewports × 2 temas | prancha 02 |
| `depois-home/` | rodada de integração da home (antes dos refinos finais) | agenda, cadastro, mapa com BH |
| `revisao/` | revisão visual independente (`live-*`): rolagem do scrollytelling quadro a quadro, momentos no celular em 390 e 320, agenda/mapa/cadastro/BH | evidência dos achados P2/P3 |
| `lighthouse/` | `lighthouse-home-{antes,depois}-{1,2,3}.json` + resumos | desempenho/acessibilidade mobile |

**Comparação do hero preservado:** `antes/hero-<vp>-<tema>.png` × `depois/hero-<vp>-<tema>.png` (8 pares) — diferença medida 0,000 %; o teste `e2e/hero-freeze.spec.ts` compara a região contra as referências em `e2e/hero-freeze.spec.ts-snapshots/`.
