# Design system — Minas em Movimento (identidade provisória)

Status: **provisório e retematizável** (spec §12.1, §13). A arte oficial ainda não foi entregue; nada aqui
simula marca oficial. Toda decisão visual passa por tokens para que a troca de identidade seja feita em
`src/styles/tokens.css` sem tocar componentes.

## 1. Princípios

- **Mapa como instrumento, não fundo.** O mapa ocupa a área principal da home, é navegável e sempre tem
  legenda com unidade, cálculo (denominador), fonte/versão e status do snapshot.
- **Editorial, terroso, contemporâneo.** Serifada de display (Fraunces → fallback Iowan/Palatino/Georgia) para
  títulos e números de destaque; sans de corpo (Inter → system-ui). Superfícies areia, ação verde-serra, ocre
  para foco/seleção.
- **Sem estética de dashboard SaaS.** Sem sidebar onipresente, sem gradientes decorativos, sombras só onde há
  sobreposição real (painéis e overlays sobre o mapa).
- **Honestidade de estado.** Carregando / sem dado / erro / indisponível / demonstrativo são estados visuais
  explícitos; nunca sucesso antes da resposta do servidor; dados sintéticos sempre com selo
  **DADOS DEMONSTRATIVOS** (variante `demo`, roxo, alta saliência, propositalmente fora da paleta de dados).

## 2. Tokens (`src/styles/tokens.css`)

| Grupo | Tokens | Uso |
|---|---|---|
| Superfície/texto | `--color-surface`, `-alt`, `-raised`, `-overlay`, `--color-text-primary/secondary/muted`, `--color-border(-strong)` | fundo, cartões, overlays do mapa, hierarquia de texto |
| Ação/estado | `--color-action-primary/hover/active/soft`, `--color-accent(-soft)`, `--color-success/warning/error/info(-soft)`, `--color-focus`, `--color-demo(-soft)` | botões, badges, notas, foco, selo DEMO |
| Mapa | `--map-fill-none/low/mid-low/mid/mid-high/high`, `--map-diverging-neg/zero/pos`, `--map-stroke`, `--map-selected`, `--map-activity(-halo)` | coropletas, contorno selecionado, atividades |
| Tipografia | `--font-display/body/mono`, `--text-xs…4xl`, `--leading-*`, `--tracking-display` | |
| Espaço/forma | `--space-1…16` (4pt), `--gutter`, `--touch-target` (44px), `--radius-sm/md/card/sheet/pill`, `--shadow-raised/sheet` | |
| Motion | `--duration-fast` 140ms, `-base` 200, `-panel` 240, `-sheet` 300, `-map` 500; `--easing-standard/emphasized/exit` | todas zeradas sob `prefers-reduced-motion` |
| Camadas/layout | `--z-map/panel/header/sheet/dialog/toast`, `--header-height`, `--panel-width`, `--content-max` | |

Tema escuro: `prefers-color-scheme: dark` (salvo `data-theme="light"`) e `data-theme="dark"` redefinem os
mesmos tokens. Os tokens são expostos ao Tailwind 4 via `@theme` em `src/styles/global.css`
(`bg-surface`, `text-primary`, `bg-action`, `border-border`, `bg-demo-soft`…). Componentes **não** usam hex
solto; o mapa lê as cores com `getComputedStyle` (`src/features/electoral-map/palette.ts`).

### Cores de dados

- Sequencial (abstenção, comparecimento, votação): `--map-fill-low → high`, verde neutro, crescente em
  luminância; não codifica julgamento moral. "Sem dado" = `--map-fill-none` (neutro, explicado na legenda).
- Divergente (2022 × 2026, p.p.): `--map-diverging-neg / zero / pos`, domínio simétrico em torno de 0.
- Seleção: contorno `--map-selected` (ocre), também usado no foco — consistente para "isto está em foco".
- Listas (fallback sem WebGL) usam os mesmos tokens em 5 faixas (`swatchVar`), sempre com o valor numérico ao
  lado — cor nunca é o único portador de significado.

## 3. Componentes

### Fundacionais (`src/components/ui/`)

| Componente | Notas de acessibilidade/estado |
|---|---|
| `Button`, `ButtonLink` (`buttonStyles.ts`) | variantes primary/secondary/ghost/subtle/danger; `loading` (spinner + `aria-busy` + texto opcional), disabled, ≥44px |
| `Input`, `Textarea` | `aria-invalid` estiliza erro; foco com outline `--color-focus` |
| `Field`, `FormErrorSummary` | label + hint + erro ligados por `aria-describedby`; erro textual (não só cor); resumo com links aos campos |
| `Checkbox` (Radix) | caixa 24px com área de toque 44px; descrição associada |
| `Combobox` | padrão WAI-ARIA 1.2 (input `role=combobox`, `aria-activedescendant`), ↑/↓/Enter/Esc, contagem anunciada em live region |
| `Select` (Radix) | itens ≥44px, portal acima do mapa |
| `Dialog` (Radix) | título/descrição obrigatórios, Esc fecha |
| `BottomSheet` (vaul, lazy) | snap points collapsed/half/expanded (`168px / 55% / 92%`), não modal (mapa segue utilizável), Esc/fechar |
| `SidePanel` | painel desktop recolhível (`aria-expanded`), entrada `--duration-panel` |
| `Toast` (Radix) + `useToast` (`toastContext.ts`) | região viva polida; erros como foreground |
| `Tabs` (Radix) | ano/turno; rolagem horizontal interna quando necessário |
| `Badge` | neutral/success/warning/error/info/accent/**demo** |
| `Skeleton`, `LoadingBlock` | pulso moderado só com motion permitido; `role=status` |
| `ErrorState`, `EmptyState`, `Note` | erro com retry e `request_id`; vazio com ação; nota metodológica |
| `Tooltip` | apenas complementar (não confiável em toque) |
| `VisuallyHidden`, `LiveRegion`, `Icon`, `Spinner` | ícones decorativos `aria-hidden` salvo `label` |

### Produto

- `features/territory`: `TerritorySearch`, `TerritoryPanel` (SidePanel ≥1024px / BottomSheet abaixo),
  `TerritoryDetails` (breadcrumb, cobertura, ano/turno, `MetricCard`s com absolutos + denominador,
  `ResultsBlock` com nota de Senador = 2 votos, `ComparisonBlock` com "não implica transferência de votos",
  `DataQualityNote`, `GroupCard` exato/municipal/nenhum/erro, agenda compacta).
- `features/electoral-map`: `MapShell` (decide mapa × lista, layout de overlays), `MapCanvas` (lazy, MapLibre),
  `MapLayerSelector` (radiogroup nativo estilizado como chips), `MapLegend`, `TerritoryListFallback`,
  `snapshot.ts` (loader com fallback DEMO), `useMapUrlState` (`?t=&camada=&ano=&turno=&cand=&vista=`).
- `features/activities`: `ActivityCard`, `ActivityMarker`, `ActivityAgenda`, `RSVPButton`.
- Layouts: `AppHeader` (identidade tipográfica + CTA Participar), `AppFooter` (metodologia, privacidade,
  termos, fonte, organização responsável — placeholder), `PageShell`/`Prose`.

## 4. Motion

| Situação | Duração | Implementação |
|---|---|---|
| hover/press | `--duration-fast` (140ms) | `duration-(--duration-fast) ease-(--easing-standard)` |
| painel lateral | `--duration-panel` (240ms) | keyframe `panel-in` (CSS) |
| bottom sheet | vaul (≈300ms, gesto) | biblioteca acessível, sem gestos artesanais |
| câmera do mapa | 350–650ms (`--duration-map` = 500ms, limitado) | `flyTo`/`fitBounds`; **`jumpTo`/duração 0** com reduced motion e no primeiro enquadramento (link profundo) |
| skeleton | pulso Tailwind | só `motion-safe` |

Decisão: a dependência `motion` foi **removida do uso** (só animava a entrada do painel e custava ~127 KB no
bundle inicial). Animações são CSS com tokens, o que já zera tudo sob `prefers-reduced-motion`. Nenhuma
animação bloqueia interação ou submit; marcadores em massa não animam individualmente.

## 5. Mapa — decisões

- MapLibre carregado por `React.lazy` (chunk `maplibre`), worker emitido como asset via
  `maplibre-gl-worker.mjs?url` + `setWorkerUrl` (sem isso o worker 404 no dev e no build).
- Basemap OpenFreeMap Positron; o style é buscado com timeout de 8 s. Falha → estilo mínimo (fundo liso) e
  aviso "Mapa de fundo indisponível; dados e contornos continuam visíveis" (T29). Atribuição sempre visível
  abaixo do mapa: "© OpenFreeMap © OpenMapTiles Dados © OpenStreetMap contributors · Malha municipal: IBGE".
- Municípios: malha IBGE (`public/geo/mg-municipios.geojson`, 455 KB, fetch sob demanda), coloridos por
  `feature-state` (nada de estado React por feição). Falha da malha → círculos nos centroides.
- Bairros: **pontos** (sem polígonos inventados) do município selecionado, rotulados "aprox.".
- Atividades: fonte GeoJSON `cluster: true` (WebGL), clique no cluster aproxima; clique no ponto abre card
  compacto (não modal).
- `cooperativeGestures` ligado sempre: Ctrl/⌘ + rolagem no desktop e dois dedos no celular, para o mapa nunca
  capturar a rolagem da página. Controles de zoom no canto inferior direito, deslocados do painel.
- Sem WebGL, erro de contexto ou escolha do usuário ("Ver como lista") → `TerritoryListFallback` com a mesma
  legenda e os mesmos valores (T20). Nunca geolocaliza.

## 6. Plano de retematização (spec §13)

1. Receber a arte e executar a auditoria `docs/IDENTITY_AUDIT.md` (inventário, licenças, paleta, contraste,
   tipografia licenciável, logo e zonas de respiro) **antes** de tocar estilos.
2. Mapear a paleta de marca para tokens semânticos de UI (`--color-action-*`, `--color-accent*`,
   `--color-surface*`, `--font-display`). Validar contraste AA em claro e escuro.
3. **Não** substituir `--map-*` por cores de campanha se isso prejudicar leitura estatística; no máximo ajustar
   matiz mantendo rampa de luminância monotônica e o divergente simétrico.
4. Trocar a marca tipográfica do `AppHeader` (hoje SVG genérico + texto) pelo logotipo autorizado; atualizar
   `public/favicon.svg` e `theme-color` em `index.html`.
5. Reservar padrões gráficos para hero/divisórias; formulários e painéis permanecem sóbrios.
6. Fontes: hospedar localmente as fontes licenciadas (hoje `Fraunces`/`Inter` são apenas nomes com fallback do
   sistema — nenhuma webfont é carregada nesta rodada).
7. Re-capturar `docs/screenshots/` (home desktop/mobile, território, atividade, estados de erro) para o
   antes/depois.

## 7. Evidências

Capturas reais em `docs/screenshots/` (Chromium headless, 1440×900 e 390×844):
`real-*` com o snapshot publicado (`validated`), `demo-*` com o fallback DEMO
(`VITE_SNAPSHOT_BASE` apontando para caminho inexistente), `*-sem-webgl-*` com WebGL desligado e
reduced motion, `real-desktop-basemap-indisponivel.png` com o basemap bloqueado.
