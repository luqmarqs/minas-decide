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

_(preenchido na fase 4, após a pesquisa)_

## 4. Solução implementada

_(preenchido na fase 4)_

## 5. Revisão visual e refinamento

_(fase 5)_

## 6. Qualidade: testes, acessibilidade, desempenho

_(fase 6)_

## 7. Limitações e pendências

_(fase 6)_
