# RELATÓRIO — REDESIGN EDITORIAL DO MINAS DECIDE

Branch: `redesign-editorial` · Baseline: staging em 2026-10-09 (`docs/screenshots/redesign-editorial/antes/`, 56 capturas: 4 viewports × 2 temas × 7 regiões) · Hero congelado por regressão visual (`e2e/hero-freeze.spec.ts`, 8 referências, `maxDiffPixelRatio 0,2 %`).

Conceito: **cartaz político brasileiro + jornalismo de dados + atlas eleitoral interativo + design digital contemporâneo.** Direção de arte: Claude Fable (decisão final); implementação por agentes especializados sob revisão visual.

---

## 1. Diagnóstico da versão anterior (capturas reais do staging)

Critérios: hierarquia, ritmo, coesão, densidade, originalidade, legibilidade, responsividade, continuidade. Gravidade: **alta** (compromete a leitura ou a identidade), **média** (monotonia/ruído), **baixa** (refino).

| # | Problema observado | Gravidade | Onde (arquivos) |
|---|---|---|---|
| D1 | **Narrativa de 5 momentos com a mesma composição** (texto à esquerda, mapa de ~420 px à direita, filete, legenda) repetida cinco vezes; o mapa que "assusta" (momento 1) tem o mesmo tamanho dos demais e não assusta. Em 1440 px sobram faixas vazias de ~150 px acima e abaixo de cada mapa. | alta | `src/features/story/StoryIntro.tsx`, `StoryMap.tsx` |
| D2 | **Momento 3 (abstenção/brancos/outros) em três cards idênticos** com números pequenos; as três bases diferentes (aptos, comparecimento, válidos) ficam só numa nota de rodapé — o leitor não vê a diferença de denominador. | alta | `StoryIntro.tsx` |
| D3 | **Momento 2 não mostra a transição** "parede → mosaico": o mapa sólido fica no momento 1 e o mosaico no momento 2, separados por ~900 px de rolagem; a comparação que é o argumento central nunca acontece no mesmo campo visual. | alta | `StoryIntro.tsx`, `StoryMap.tsx` |
| D4 | **"Por que Minas decide" é uma grade 3×2 de widgets iguais** (mesmo raio, mesma borda, mesma estrutura número/rótulo/gráfico/fonte): a importância relativa dos seis números é idêntica; o número âncora (10,3 % do eleitorado, 2º maior) não se destaca; os gráficos são miniaturas de 300 px. | alta | `src/features/highlights/WhyMinasInfographic.tsx`, `WhyMinasStrip.tsx`, `cards.ts` |
| D5 | **No celular o infográfico vira um carrossel** que esconde 5 dos 6 números (com indicação de rolagem, mas ainda escondidos). | alta | `Carousel.tsx`, `WhyMinasStrip.tsx` |
| D6 | **Três convites iguais em sequência** ("Quero participar" no momento 3, no momento 5, na faixa azul antes do mapa, no cabeçalho, no hero e no fim da página): redundância visual que reduz o valor de cada um. | média | `src/pages/HomePage.tsx`, `StoryIntro.tsx` |
| D7 | **A faixa "Minas se decide no corpo a corpo"** antes do mapa é um componente de landing page genérica (frase + botão numa barra) e corta a continuidade narrativa → mapa. | média | `HomePage.tsx` |
| D8 | **Seções sem continuidade gráfica**: narrativa (creme), infográfico (creme com cards brancos), faixa (branca), mapa (verde), agenda, cadastro (creme): cada bloco começa do zero; nenhum elemento gráfico atravessa seções. | média | `HomePage.tsx`, `src/styles/global.css` |
| D9 | **Tablet (768) e laptop (1024) são o layout do celular esticado** (coluna única com mapas pequenos centralizados); nenhuma composição própria para larguras intermediárias. | média | `StoryIntro.tsx`, `WhyMinasStrip.tsx`, `HomePage.tsx` |
| D10 | **Legendas e notas longas sob cada mapa** (3–4 linhas de 11 px) competem com o texto principal; a fonte (TSE · IBGE) aparece seis vezes na mesma tela. | baixa | `StoryIntro.tsx`, `WhyMinasInfographic.tsx` |
| D11 | **Painel territorial** usa quatro cards iguais para indicadores de naturezas diferentes (apto, comparecimento, abstenção, brancos/nulos) — o dado conquistável (brancos/nulos) não se destaca além de um negrito. | baixa | `src/features/territory/MetricBlocks.tsx` |
| D12 | **Agenda** aparece vazia na captura de página inteira (carrega sob demanda) e, quando carrega, é uma lista de cards; não há ligação com o mapa que a antecede. | baixa | `HomePage.tsx`, `src/features/activities/ActivityCard.tsx` |

O que **funciona e fica**: hero (congelado); barra compacta, legenda recolhida e sheet do mapa no celular (rodada 4b); paleta e fontes da identidade; textos aprovados; cores partidárias só na margem e na narrativa (D25); ressalvas de bairro aproximado e selos DEMO/parcial; fluxos de cadastro, RSVP e compartilhamento.

## 2. Alternativas de direção de arte

### A — "Cartaz desdobrado" (rolagem editorial contínua com mapa fixo)

Depois do hero, a página é **um único fluxo editorial** sobre o creme da identidade, organizado por filetes e tipografia, sem cards decorativos.

1. **Narrativa como scrollytelling**: em ≥ 1024 px um **mapa grande fixo** (coluna de 7/12, ~70 vh) permanece na tela enquanto os cinco momentos rolam na coluna de 5/12; o mapa **muda de estado** a cada momento (parede azul → mosaico 2026 → 2022 → atividades), de modo que a transição "parede → mosaico" (D3) acontece no mesmo lugar, diante do leitor. Momento 3 troca o mapa por uma **composição de blocos proporcionais** (três barras em escalas distintas, cada uma com seu denominador escrito ao lado). Momento 1 ganha presença: mapa a toda a coluna, com a frase "assusta" sobre a faixa oliva. No celular/tablet o mapa fixa no topo (≈ 42 vh) e os textos rolam abaixo; sem IntersectionObserver ou com movimento reduzido, cada momento mostra seu mapa estático (como hoje).
2. **Infográfico como página dupla de jornal**: número âncora gigante (10,3 % · 2º maior eleitorado) com anotação; gráfico comparativo 2022 → 2026 (Lula × Bolsonaro) na largura toda, com os valores anotados nas barras; linha de **pequenos múltiplos** (853 municípios, participação, 5,4 mi) separados por filetes; uma única fonte por bloco. No celular: lista vertical de blocos a toda a largura, sem carrossel (D5).
3. **Continuidade**: a narrativa termina em "veja o seu bairro" e **desemboca no mapa** sem a faixa de CTA (D7); um filete forte com o passo numerado atravessa narrativa → infográfico → mapa → agenda, como pranchas de um mesmo atlas.
4. **Convites** reduzidos a três momentos com função distinta: hero (entrar), fim da narrativa (ver o mapa / participar) e formulário final; os demais viram links de texto.
5. **Agenda** como lista editorial (coluna de data + título + lugar, filetes), ligada ao mapa por "no mapa"; **painel territorial** com o dado conquistável em destaque tipográfico, sem quatro caixas iguais.

Prós: resolve D1–D8; o mapa fixo "ensina" o mapa interativo e antecipa sua descoberta sem mexer no hero; ritmo claro (impacto → revelação → ausência → história → ação). Contras: scrollytelling exige cuidado com acessibilidade (conteúdo íntegro sem animação) e com altura em laptops baixos (1024×768: mapa fixo de 60 vh).

### B — "Atlas em pranchas" (pranchas numeradas, mapas a sangrar)

Cada seção é uma **prancha numerada** (filete forte à esquerda, número da prancha em display), com mapas a toda a largura e textos sobrepostos em caixas de creme; o infográfico é uma **página de dados** densa com linhas de pauta (estilo jornal impresso); a agenda, uma tabela.

Prós: forte identidade "atlas"; mapas grandes. Contras: a sobreposição texto-sobre-mapa briga com a cartografia (regra: visualização protagonista, sem ruído); as pranchas tendem a repetir a mesma estrutura cinco vezes (o problema D1 em outra roupa); densidade alta no celular; mais risco para contraste (WCAG) e para o tema escuro.

### Decisão: **A — "Cartaz desdobrado"**, com dois empréstimos de B

Empréstimos: numeração tipográfica das "pranchas" como elemento de continuidade (D8) e o mapa a toda a coluna no momento 1. Justificativa: A é a única que resolve a comparação central (D3) e a hierarquia do infográfico (D4) sem criar nova monotonia; mantém a cartografia limpa; tem fallback natural (mapas estáticos por momento) para movimento reduzido e leitores de tela; funciona no celular como "mapa no topo + texto" — composição própria, não desktop empilhado (D9).

Riscos aceitos e mitigação: (1) `position: sticky` + troca de estado por IntersectionObserver — sem JS, todos os momentos têm seu mapa; (2) desempenho — os SVGs já existem (`StoryMap`), a troca é de atributos, sem biblioteca nova; (3) o hero não entra em nenhuma mudança (teste de regressão).

## 3. Princípios aplicados (de `docs/REFERENCIAS_REDESIGN_EDITORIAL.md`)

A pesquisa examinou 26 referências (38 URLs lidas; as que falharam estão registradas no documento). Dos 15 princípios consolidados, estes governam a implementação:

| Princípio (pesquisa) | Onde se aplica | Referências |
|---|---|---|
| Um gráfico por ideia; título como conclusão, unidade e base junto do título | infográfico (cada peça responde a uma pergunta), momento 3 (três bases, três barras separadas) | Pudding, SWD, Nexo, FT Visual Vocabulary |
| Anotar sobre o dado em vez de embalar em card: número > rótulo > fonte | infográfico (número âncora, pequenos múltiplos com filetes), momento 4, painel territorial | NN/g (hierarquia, escala), SWD |
| Três tamanhos de tipo, no máximo dois elementos grandes por tela | todas as pranchas (`.ed-figure-xl/lg/md`, `.ed-kicker`, `.ed-caption`) | NN/g ×2, lambe-lambe |
| Scroll só quando a transição carrega informação; empilhar com movimento reduzido e no celular quando não acrescenta | narrativa (mapa fixo que muda de estado; no celular momento 2 lado a lado; reduced motion = mapas estáticos) | Pudding (scrollama, responsive scrollytelling), WCAG 2.3.3 |
| Mudança no tempo lida em p.p., lado a lado, com legenda comum | infográfico (comparativo 2022 → 2026), momento 4 | Nexo 2022×2026, Datawrapper 2021, AnyChart |
| Legenda com classes, unidade e classe "empate técnico" explícita; bordas finas entre áreas (3:1) | momento 2 (rótulos existentes mantidos; refino na rodada de revisão), mapa | Datawrapper ×2, WCAG 1.4.11 |
| Reflow a 320 px; alvos ≥ 44 px; foco nunca sob o sheet | todas as seções (teste e2e de overflow em 390/320) | WCAG 1.4.10, 2.4.11, 2.5.8 |
| Linguagem de cartaz nas vinhetas, não nos dados | faixa oliva do cadastro e do momento 1; gráficos e mapas limpos | Tupinambá Lambido, xilogravura (URCA) |
| Ficha técnica como parte do gráfico (fonte, turno, base, aproximação, status) | uma linha `.ed-caption` por peça; metodologia linkada | Nexo, Atlas RS, Pudding |
| Agenda como lista cronológica: data em coluna estreita + título + local + selo de tipo | agenda (prancha 04) | Pindograma, NN/g |

**Desvios deliberados em relação à pesquisa (decisão de direção, proprietário > referência):** (1) a pesquisa recomenda abandonar vermelho/azul partidários em favor de uma divergente céu–creme–ocre; o proprietário decidiu pelo enquadramento explícito de campanha e as cores partidárias ficam **só** na narrativa e na camada de margem (D25) — mantidas; (2) a pesquisa limita Anton ao hero e selos; os títulos dos momentos e os números do infográfico já usavam `.brand-display` desde a rodada 3 com aceite do proprietário — mantidos, sem ampliar para novos lugares; (3) propostas que exigem ETL/MapLibre (mapa de setas, pontos por local de votação, basemap próprio) ficam registradas como pendências, fora do escopo frontend desta missão.

## 4. Solução implementada (direção A, commits `ae0ef4e` → `60c51a0` na branch)

### 4.1 Camada editorial compartilhada
- `src/styles/editorial.css` (aditiva, importada depois dos tokens): `.ed-section` (ritmo vertical fluido), `.ed-measure`, `.ed-rule`/`.ed-rule-strong` (filetes no lugar de bordas de card), `.ed-kicker`, `.ed-figure` + `-xl/-lg/-md` (números protagonistas, tabulares), `.ed-note`, `.ed-caption`, `.ed-grid-12` (1 coluna < 768 px, 12 colunas a partir de md), `.ed-sticky` (desliga com movimento reduzido), `.ed-band-ink` (faixa oliva que remapeia os tokens semânticos, igual à "ilha" do hero, sem tocar em `.brand-hero`).
- `src/components/editorial/PlateHeading.tsx`: abertura de seção com filete forte, número da prancha (01…04), kicker e título — a numeração atravessa narrativa → números → mapa → agenda.

### 4.2 Prancha 01 — narrativa (`src/features/story/`)
- **Scrollytelling em dois atos (≥ 1024 px, com IntersectionObserver e sem `prefers-reduced-motion`)**: um painel fixo (`.ed-sticky`, 7/12, ≈ `min(70vh, 640px)`) muda de estado por crossfade de 240 ms (nunca os 853 paths): ato A parede → mosaico 2026; ato B mosaico 2022 → mosaico 2026 atenuado. O estado vive num store externo; rolar só re-renderiza os painéis. `data-story-state` na seção e nos painéis.
- **Momento 1 — impacto**: enquanto ativo, o ato A inteiro fica em faixa oliva (tokens de `.ed-band-ink`, transição motion-safe), a parede azul a toda a coluna e o título em display grande; no modo estático (celular, tablet, movimento reduzido) a faixa sangra a largura.
- **Momento 2 — revelação**: no desktop o próprio painel vira o mosaico e uma miniatura da parede (1 path, 72 px, "Resumo · o estado numa cor só") fica junto do texto; no celular, resumo pequeno (6 rem) + mosaico a toda a largura; abaixo de 360 px empilham. A explicação das faixas aparece uma só vez.
- **Momento 3 — ausência**: composição a 12 colunas com três barras, cada uma de 0 a 100 % da **própria base** e com o denominador escrito ("22,8 % de 16,4 mi aptos", "5,2 % de 12,6 mi que compareceram", "8,4 % de 12,0 mi votos válidos"); válidos = comparecimento − brancos/nulos (não existe `mg_2026_r1_valid_votes` no highlights; a nota diz isso); cores neutras; ressalva mantida; JoinCta removido daqui (D6). `<dl>` válido (dt/dd diretos).
- **Momento 4 — 2022**: "49.650" em `.ed-figure-xl` com "votos de diferença · +0,4 p.p." e a nota "No Brasil, a diferença foi de 2.139.645 votos (1,8 p.p.)" (`br_2022_r2_margin_votes`); nenhuma comparação inventada.
- **Momento 5 — mobilização**: mosaico 2026 atenuado (0,55 claro / 0,72 escuro); legenda com o SunMark: "As atividades da campanha aparecem no mapa interativo, logo abaixo, marcadas com o sol"; convites com função distinta: primário "Ver o seu bairro no mapa" (`/#mapa`), secundário "Quero participar".
- Tablet (768): mapa de cada momento fixo no topo do próprio momento (≤ 46vh). Fonte uma vez por momento (`.ed-caption`). Todos os títulos e parágrafos aprovados mantidos. Sem dependência nova.

### 4.3 Prancha 02 — "Por que Minas decide" (`src/features/highlights/`)
- `WhyMinasInfographic.tsx` reescrito como **página dupla**: `<ul>` em `.ed-grid-12`; âncora "10,3 %" (`.ed-figure-xl`) com "16,4 mi pessoas aptas a votar" e barra Brasil = 100 % (4 colunas); abaixo dela "Quão apertado foi 2022?" (+49.650, régua tipográfica ±2 p.p.); comparativo 2022 → 2026 em 8 colunas com rótulo direto em cada barra ("Lula 48,3 %", "Jair 43,6 %", "Flávio 48,2 %"), linha de 50 %, margem publicada por rodada e nota "não implica transferência"; linha de **pequenos múltiplos** separados por filetes: 853 municípios (barra dividida), 77,2 % (pilha válidos/brancos e nulos/abstenção com legenda textual), 5,4 mi (10 blocos). Cada bloco: pergunta (`.ed-kicker`), número, gráfico `role="img"` com `aria-label` completo, uma linha de fonte (5 no total).
- **Celular: lista vertical a toda a largura, sem carrossel** — os seis números sempre visíveis; 320 px sem overflow, inclusive com fonte a 200 %. Em 768: 5/7 e 6/6 + 12. Cores partidárias só no comparativo, na barra dividida e na margem. O fallback `buildStripCards` + `Carousel` fica só para o estado demo.

### 4.4 Costura da home, mapa, agenda e cadastro (`src/pages/HomePage.tsx` e afins)
- Ordem: hero (intocado) → 01 narrativa → 02 números → **03 mapa** (abertura "Veja o seu bairro" com a ressalva de bairro aproximado e a busca territorial repetida **só no desktop**, ao lado do título) → 04 agenda → fechamento. A faixa "Minas se decide no corpo a corpo" foi removida (D7). O `#mapa` (rodada 4b) não mudou.
- **Convites**: hero e cabeçalho (intocados), fim da narrativa (dois, com funções distintas), link de texto "Proponha uma atividade" na agenda, formulário no fim. Nenhuma outra barra de CTA.
- **Agenda**: lista editorial (`ActivityRow`, `variant="row"`): coluna de data (dia em `.ed-figure`, mês e hora em kicker, `<time>`), tipo, título com link, local, compartilhar no WhatsApp; filetes; 2 colunas em 768; título 4/12 + lista 8/12 no desktop. `content-visibility` retirado (o conteúdo real era maior que o placeholder).
- **Cadastro**: faixa oliva de fechamento (`.ed-band-ink` + `home-join.css` para os tokens de estado), h2 `brand-display` mantido, formulário em painel à direita a partir de 1024; `RegistrationForm` intacto.
- **Painel territorial**: `MetricBlocks` sem quatro caixas iguais — eleitorado como linha de contexto, comparecimento e abstenção como par com barra neutra, **brancos e nulos** em `.ed-figure-lg` sob filete forte ("votos que podem ser conquistados"), válidos como linha; comparativo e mobilização sem bordas de card. Dados e textos iguais.

### 4.5 Correções transversais
- Reflow: cabeçalho sem transbordo em 320 px (palavra em contorno do lockup oculta abaixo de 360 px); widget Turnstile (300 px fixos) reduzido a 84 % abaixo de 360 px; infográfico na mesma largura (`--content-max`) das demais pranchas.
- Acessibilidade: lista de definição válida (momento 3); texto visível do lockup ("MINAS DECIDE") contido no nome acessível; Lighthouse acessibilidade 100.
- Tema escuro: `--map-margin-zero` (empate técnico) de `#2a2820` para `#4f4b42` — o empate deixa de parecer "buraco" nos mapas divergentes (único token alterado; não é consumido pelo hero — teste de regressão verde).
- Build local: `npm run build:local` (`vite build --mode dev`) para e2e e capturas — o modo `production` passou a ler `.env.production` (chave live do Clerk e widget Turnstile de produção, que recusam `localhost`). Isso explicou as falhas de cadastro/entrar numa rodada de e2e e foi corrigido no `playwright.config.ts`.

## 5. Revisão visual e refinamento

Duas rodadas com capturas reais antes de fechar:

1. **Revisão de direção (Fable)** sobre as primeiras entregas: infográfico — equilibrar a coluna da âncora (margem de 2022 movida para baixo dela), fundir fontes (6 → 5), rótulos diretos nas barras, barra "Brasil = 100 %" visível no claro, menos respiro no celular; narrativa — respiro antes do segundo ato, sol fora do mapa, mosaico atenuado legível no escuro.
2. **Revisão independente (agente `visual-review`, 58 capturas em `docs/screenshots/redesign-editorial/revisao/`)**: hero com **0,000 % de diferença** em 8 comparações e 3 recortes da home; **sem overflow** em 320–1440; **nenhum texto < 12 px**; **zero falhas de contraste** de texto nos dois temas; alvos < 44 px só no cadastro e rodapé (pré-existentes). Nenhum P1. Os P2 foram corrigidos: faixa oliva do momento 1 também no modo fixo (P2-3), legenda do momento 5 sem prometer sóis (P2-2), respiro do momento 3 e vão 01→02 reduzidos (P2-3b, P3-3), resumo pequeno + mosaico pleno no celular (P3-5), miniatura da parede no desktop (P3-6), comparativo alinhado ao topo (P3-2), empate técnico legível no escuro (P3-8), capturas "depois" regeradas do build final (P2-1). Mantidos como pendência: P3-7 (basemap escuro compete com o dado — escopo do mapa), P3-9 (alvos pequenos no formulário/rodapé — anteriores), P2-4 (as atividades `[EXEMPLO]` vêm do banco sem flag demo — dado, não interface).

Altura da home (medida ao vivo): 390 px 8.242 → 11.110; 1440 px 6.800 → 8.769 (+29 %). O crescimento vem da narrativa (mapas maiores, momento 3 como composição) e do infográfico (6 números sempre visíveis, sem carrossel) — decisão deliberada: densidade legível em vez de conteúdo escondido.

## 6. Qualidade: testes, acessibilidade, desempenho

| Verificação | Resultado |
|---|---|
| `npm run ci` (lint, format, typecheck, vitest, isolamento, build) | verde — **515/515** testes (47 arquivos); 2 avisos antigos de lint em `BottomSheet.tsx` |
| Hero congelado (`e2e/hero-freeze.spec.ts`, 4 viewports × 2 temas, `maxDiffPixelRatio` 0,2 %) | **8/8** após cada etapa; diff medido 0,000 % |
| E2E completo (desktop + mobile) | ver §6.1 |
| Lighthouse mobile da home (CPU 4×, 3 rodadas) | antes (staging): perf 78–82, a11y 100, LCP 3,2–3,4 s, TBT 340–430 ms, CLS 0 · depois: perf 84–88, **a11y 100**, LCP 2,8–2,9 s, TBT 270–380 ms, CLS 0 (`docs/screenshots/redesign-editorial/lighthouse/`) |
| Reflow | `scrollWidth` = viewport em 320/390/768/1024/1440, dois temas |
| Contraste | texto: 0 falhas nos dois temas (varredura computada); tokens em `scripts/visual/contrast.mjs` |
| Texto mínimo | nenhum nó < 12 px na home |
| Alvos | ≥ 44 px em narrativa, infográfico, agenda e controles novos; exceções pré-existentes no formulário/rodapé |
| Teclado | foco visível (3 px) verificado; percurso completo por Tab **não** executado |
| Leitores de tela reais | **não** testados (semântica: `role="img"` + `aria-label` + `aria-describedby` nos SVGs, `<ol>` de momentos, `<dl>` válido, painéis fixos `aria-hidden` com descrição `sr-only` por momento) |

### 6.1 E2E
Suíte completa (`npx playwright test`, projetos desktop e mobile) no build local com chaves de teste (`build:local`): **76 passaram, 0 falharam, 20 pulados** (pulos previstos pelos próprios testes: casos exclusivos de um projeto e o passo de código do Clerk sem `CLERK_TESTING_TOKEN`). Inclui `hero-freeze` 8/8, os novos `redesign-story`, `redesign-infografico`, `redesign-home`, e os antigos `home.smoke`, `rodada2/3.smoke`, `fe10-mobile`, `registration.smoke`. Uma rodada anterior teve 6 falhas em cadastro/entrar por o build de e2e usar a chave live do Clerk (modo `production`) — corrigido com `build:local`; outra teve 27 falhas por concorrência com builds e servidores de outros agentes (reproduzida limpa: 0).

## 7. Limitações e pendências

- **Mobile sem mapa fixo**: no celular/tablet a narrativa usa mapas estáticos por momento (título → mapa → legenda → texto), seguindo a prática de scrollytelling responsivo (Pudding) — o doc de direção previa o mapa fixo no topo; a decisão final foi pela composição estática por legibilidade e por não esconder o mapa atrás de interação.
- **Basemap no tema escuro** compete com o coroplético (vias escuras): ajuste no estilo do MapLibre (fora da home editorial).
- **Alvos < 44 px** nos checkboxes e links de texto do formulário e do rodapé: anteriores ao redesign; corrigir em `RegistrationForm`/`AppFooter`.
- **Atividades `[EXEMPLO]`** aparecem sem selo DEMO porque são linhas reais do banco (dev compartilhado com produção, D40) — remover com `cleanup-dev-data.ts` (bloqueado para o agente; comando entregue ao proprietário).
- **Safari/Firefox**: o modo fixo usa `subgrid` e `overflow-x: clip`; não testado fora do Chromium.
- **Propostas da pesquisa fora do escopo frontend**: mapa de setas 2022→2026, camada por local de votação, basemap próprio sem rótulos de rua, escala divergente céu–creme–ocre (contraria D25) — registradas, não implementadas.
- **Anton**: continua nos títulos dos momentos, nos números do infográfico e no h2 do cadastro (uso anterior, aceito); não foi ampliado.
- **Sem deploy nem merge**: a branch `redesign-editorial` fica para revisão do proprietário (staging continua na `main`).
