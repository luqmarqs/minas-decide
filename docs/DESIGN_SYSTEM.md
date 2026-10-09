# Design system — Minas Decide (identidade oficial)

Status: **identidade oficial "Minas Decide"** (arte aceita pelo proprietário em 2026-10-09, alternativa A da
`docs/IDENTITY_AUDIT.md`; FE-5). Toda decisão visual continua passando por tokens
(`src/styles/tokens.css`). A identidade provisória das rodadas 1–2 sobrevive apenas como tema de
comparação/rollback (`data-brand="provisorio"`, ver a seção "Identidade oficial e rollback").

## 1. Princípios

- **Mapa como instrumento, não fundo.** O mapa ocupa a área principal da home, é navegável e sempre tem
  legenda com unidade, cálculo (denominador), fonte/versão e status do snapshot.
- **Cartaz serigrafado nas bordas, neutro no miolo de dados.** Hero com a chave visual, sol como símbolo,
  Anton/Bungee Outline só no hero, nos selos de marca e no lockup. Todos os demais títulos usam a sans do
  corpo (Inter → system-ui) em 700. Superfícies creme (claro) e oliva (escuro), ação azul-céu (texto
  branco), amarelo-sol como destaque de superfície, ocre nas bordas fortes e na divisória "horizonte".
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

`--color-border-strong` (rodada 2): `#857d6c` no claro e `#7d7562` no escuro — ≥ 3:1 sobre
`surface`, `surface-alt` e `surface-raised` (WCAG 1.4.11), usado nas bordas de inputs, selects, checkboxes,
chips de camada e no contorno do swatch "sem dado". Nenhum token de texto mudou (todos seguem ≥ 4,5:1).

Tema escuro: `prefers-color-scheme: dark` (salvo `data-theme="light"`) e `data-theme="dark"` redefinem os
mesmos tokens. Os tokens são expostos ao Tailwind 4 via `@theme` em `src/styles/global.css`
(`bg-surface`, `text-primary`, `bg-action`, `border-border`, `bg-demo-soft`…). Componentes **não** usam hex
solto; o mapa lê as cores com `getComputedStyle` (`src/features/electoral-map/palette.ts`).

### Cores de dados

- Sequencial (abstenção, comparecimento, votação): `--map-fill-low → high`, verde neutro, crescente em
  luminância; não codifica julgamento moral. "Sem dado" = `--map-fill-none` (neutro, explicado na legenda).
- Divergente (2022 × 2026, p.p.): `--map-diverging-neg / zero / pos`, domínio simétrico em torno de 0.
- Seleção: contorno `--map-selected` (amarelo-sol) sobre um contorno `--map-selected-casing` (tinta no claro,
  oliva no escuro), porque o amarelo sozinho tem < 3:1 sobre o basemap claro.
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
| `BottomSheet` (vaul, lazy) | snap points recolhido/meio/expandido (`148px / 45% / 92%`, `features/territory/sheet.ts`); abre no **meio** a cada seleção com o mapa visível acima (a busca no celular rola o mapa para o topo); botão explícito "Mostrar/Expandir/Recolher painel" para teclado e leitor de tela; não modal, Esc/fechar; a câmera reserva o seletor de camadas (topo) e a altura do sheet (base) ao enquadrar o território |
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
- `features/auth` (ADR 0005, Clerk, fluxos próprios — nenhum componente visual do Clerk):
  `CodeStep` + `CodeActions` (passo 2 "Digite o código enviado para <e-mail>": input de 6 dígitos com
  `autocomplete="one-time-code"`, `inputmode="numeric"`, foco automático, erro no campo; "Reenviar código"
  com espera de 30 s e "Trocar e-mail"), `SignInCodeForm` (`/entrar`), `SignedOutPanel` (páginas
  protegidas sem sessão: "Entrar com código" + "Criar conta"). O cadastro (`RegistrationForm`) usa o mesmo
  `CodeStep`; o Turnstile fica montado nos dois passos e o slot `#clerk-captcha` logo abaixo dele. Erros do
  Clerk sempre traduzidos (`lib/clerk.ts` → `clerkErrorMessage`).
- Layouts: `AppHeader` (identidade tipográfica + "Entrar" a partir de 640px + CTA Participar; com sessão, menu
  da conta com nome, Minhas atividades, Propor atividade, Moderação só se `/me.is_admin`, Sair), `AppFooter` (metodologia, privacidade,
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
- **Início adiado (rodada 2, P-PERF-1):** home, território e atividade pintam primeiro o conteúdo estático e um
  `MapPlaceholder` (superfície `surface-alt`, skeleton do seletor e legenda com rótulo/rampa da camada, mesma
  caixa e mesma atribuição do mapa real — sem CLS). `DeferredMapShell` só importa o `MapShell` (Zod, snapshot,
  MapLibre) depois de `load` + primeiro paint com conteúdo + `requestIdleCallback` (`src/lib/idle.ts`), ou
  imediatamente se a pessoa selecionar algo na busca. O índice de territórios (~2 MB) é baixado no primeiro
  foco/toque na busca ou em idle; os documentos normalizados da busca só são montados ao digitar.
- Coropleta por **propriedade GeoJSON** (`v`) avaliada no worker do MapLibre; `feature-state` fica só para
  hover. Camadas do basemap sem valor para a leitura (prédios, aeroportos, ferrovias, setas de mão única,
  escudos de rodovia) são removidas do estilo; `fadeDuration: 0`.
- Basemap OpenFreeMap **Positron** no claro e **Dark** (`https://tiles.openfreemap.org/styles/dark`) no tema
  escuro; a troca de `prefers-color-scheme` remonta o canvas com o outro estilo (P-UX-3). `preconnect` para
  `tiles.openfreemap.org` em `index.html`. O style é buscado com timeout de 8 s. Falha → estilo mínimo (fundo liso) e
  aviso "Mapa de fundo indisponível; dados e contornos continuam visíveis" (T29). Atribuição sempre visível
  abaixo do mapa: "© OpenFreeMap © OpenMapTiles Dados © OpenStreetMap contributors · Malha municipal: IBGE".
- Municípios: malha IBGE (`public/geo/mg-municipios.geojson`, 455 KB, fetch sob demanda), coloridos pela
  propriedade `v` (nada de estado React por feição). Falha da malha → círculos nos centroides.
- Bairros: **pontos** (sem polígonos inventados) do município selecionado, rotulados "aprox.".
- Atividades: fonte GeoJSON `cluster: true` (WebGL), clique no cluster aproxima; clique no ponto abre card
  compacto (não modal).
- Alvos de toque: botões de zoom 44×44 px (CSS com especificidade acima do `maplibre-gl.css`, que carrega
  depois) e ícones invertidos no tema escuro; links da atribuição com `min-height` 24 px (P-UX-5).
- Home desktop: herói + mapa ocupam exatamente a viewport (`flex`), então o selo DEMO no herói reduz o mapa em
  vez de empurrar a atribuição para fora da tela (P-UX-4).
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

### Rodada 2 (FE-3)

`docs/screenshots/final-r2/` (`<tela>-<desktop1440|mobile390>-<estado>-<data>-<commit>.png`): home claro/escuro
(basemap escuro), home DEMO, território mobile sem CLS, bottom sheet no estado meio, retorno do magic link com
"Confira seus dados", `/conta/seguranca` (enrolamento TOTP), `/admin` pedindo o segundo fator e com
Suspender/Revelar contato. Resultados de axe/CLS/alvos em `_resultados-r2.json`, Lighthouse antes/depois em
`lighthouse-*.json`, validação real em `_validacao-real.json`. Scripts: `scripts/visual/{capture-r2,lighthouse,
r2-validate,paint-probe,totp}.mjs`.

Padrões novos (os três primeiros removidos na FE-11/ADR 0005): `ProfileReview`/`ProfileReviewGate` (revisão de dados após a promoção da sessão),
`MfaGate` + `OtpField` (código de 6 dígitos, `autocomplete="one-time-code"`, `inputmode="numeric"`),
`RevealContact` (contato completo só em estado local, some ao fechar a revisão ou esconder a aba),
`ModerationDialog` genérico (aprovar/rejeitar/suspender/reativar, motivo obrigatório).

## Identidade oficial e rollback (FE-4 protótipo → FE-5 padrão)

Fonte: `docs/IDENTITY_AUDIT.md` (§2 paleta medida, §7 mapeamento). Aceita pelo proprietário (alternativa A,
nome "Minas Decide").

- **Padrão:** `<html data-brand="minas-decide">`, já no `index.html` e reaplicado por `initBrand()`
  (`src/lib/brand.ts`, chamado em `main.tsx` antes do primeiro render). Os valores oficiais estão em `:root` e
  nos blocos escuros (`prefers-color-scheme` + `[data-theme='dark']`), então a página fica correta mesmo antes do
  JS rodar.
- **Rollback/comparação:** `?brand=0` (ou `?brand=provisorio`) grava `localStorage['mm.brand']='provisorio'` e
  aplica `data-brand="provisorio"`. `?brand=1` volta ao oficial e limpa o storage. O bloco
  `:root[data-brand='provisorio']` (+ escuros) restaura as cores, a Fraunces e o peso 600 dos títulos; o header
  mostra a marca antiga com o texto "Minas Decide", e a home volta ao hero compacto. Favicon: `/favicon.svg` (sol)
  × `/favicon-provisorio.svg`. No provisório o foco passou a `#a8640f` (3,79:1 sobre surface-alt; antes
  `#c2771a` = 2,87:1).
- **Tokens oficiais:**

| Token | Claro | Escuro |
|---|---|---|
| `--color-surface` / `-alt` / `-raised` | #f6ece4 / #ebd6ca / #fffaf6 | #1e1f1c / #262824 / #2e302b |
| `--color-text-primary` / `-secondary` / `-muted` | #202020 / #4a4038 / #5b5249 | #ebd6ca / #d4c3b7 / #b3a497 |
| `--color-action-primary` (texto sobre ela) | #067fa8 (branco, 4,56:1) | #e8ba1f (#202020, 8,9:1) |
| `--color-action-hover` / `-active` | #06688a / #055574 | #d7ac1e / #c99a12 |
| `--color-accent` | #e8ba1f (só superfície; nunca texto em fundo claro) | #e8ba1f |
| `--color-focus` | #06688a | #e8ba1f |
| `--color-border-strong` | #7f5c34 (ocre) | #9c7a4f (a auditoria sugeria #5e4325, que dá < 3:1) |
| `--map-selected` (+ `--map-selected-casing`) | #e8ba1f com contorno #202020 | #e8ba1f com contorno #1e1f1c |
| `--map-activity` | #06688a | #5fb8d9 (o azul-escuro some no basemap escuro) |
| `--font-display` / `--heading-weight` | `var(--font-body)` / 700 | idem |
| `--font-brand` / `--font-brand-outline` | Anton / Bungee Outline | idem |

  `--map-fill-*`, as escalas divergentes e `--color-demo*`/status não mudam. As cores cruas da arte
  (`--brand-sky/sun/cream/ocre/olive/ink…`) servem só para hero, divisória, lockup e selos de marca.
  Verificação: `node scripts/visual/contrast.mjs` (oficial) e `--brand provisorio`.
- **Tipografia:** decisão FE-5: títulos comuns (painéis, cartões de métrica, formulários, páginas, rodapé) em
  **Inter/system 700**, e não em serifa, para ficar neutro e legível no miolo de dados. Anton (`.brand-display`,
  `--font-brand`) só no h1 do `BrandHero`, no lockup e no `Badge variant="brand"`. Bungee Outline
  (`.brand-outline`) só em palavras curtas em caixa alta no hero e no lockup. As duas são OFL, self-hosted em
  `public/fonts/*/` (woff2, subconjunto latino, 20,7 KB + 50,6 KB, `OFL.txt` ao lado), com `font-display: swap`
  e `<link rel="preload">` no `index.html`; `/fonts/*` tem cache de 7 dias (`public/_headers`).
- **Marca:** `SunMark.tsx` (sol vetorial desenhado por código: semicírculo + 11 raios ondulados, `currentColor`,
  `aria-hidden`, geometria em `sunGeometry.ts`); `BrandLockup.tsx` (sol + MINAS + DECIDE; `mono` usa a cor do
  texto) no `AppHeader`, cujo link se chama "Minas Decide — página inicial". Os favicons são gerados por
  `npx tsx scripts/visual/brand-favicon.ts`.
- **Home:** `BrandHero.tsx`, com a chave visual em `<picture>` (800w/1600w, `eager` + `fetchpriority=high`).
  Altura de 36vh no celular, `clamp(36vh, 40vw, 52vh)` no layout empilhado e 48vh em coluna (≥ 1280px). O
  título fica na faixa oliva que continua a base da arte, com a busca logo abaixo e `HorizonDivider.tsx`
  (serra ocre) antes do mapa. O hero é sempre uma "ilha escura" (tokens remapeados em `.brand-hero`). Há grão
  SVG a 6 % só sobre a arte, nunca sobre formulário, mapa ou legenda.
- **Componentes:** `ActivityMarker` vira um sol pequeno com halo; "Eu vou" (`.mm-rsvp-cta`) fica amarelo com
  texto #202020; o botão primário é azul com texto branco no claro; os selos DEMO/validado não mudam. O
  `SidePanel` é uma `section` rotulada, e não um `aside`, porque fica dentro da seção do mapa e um landmark
  complementar aninhado falha no axe.
- **Evidências:** `docs/screenshots/brand/` (protótipo FE-4, `?brand=1`) e `docs/screenshots/brand/final/`
  (padrão FE-5, sem query; inclui o antes/depois com `?brand=0`), mais `fe4-log.json`, gerados por
  `BASE=… AXE=… node scripts/visual/capture-brand.mjs` (`OUT`/`QS` configuráveis).

### FE-11 — Clerk (ADR 0005)

`docs/screenshots/clerk/`: formulário, passo do código (`live-participar-codigo-*`), código incorreto, conta que
exige senha na instância dev (`live-participar-senha-exigida-*`), `/obrigado` após POST real, menu da sessão,
"já tem cadastro", `/entrar` (e e-mail não encontrado), página protegida sem sessão, desafio do captcha do Clerk
em navegador automatizado. `fe11-log.json`: violações de CSP, axe e peso das requisições do Clerk.
