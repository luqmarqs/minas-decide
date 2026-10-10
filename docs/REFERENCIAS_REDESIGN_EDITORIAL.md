# Referências para o redesign editorial do Minas Decide

Data da pesquisa: 2026-10-09. Autor: agente de pesquisa (sessão Claude Code), a pedido do redesign editorial.

## Como ler este documento

- Cada referência foi **efetivamente aberta** por ferramenta de web (WebFetch, WebSearch ou leitura via proxy de texto `r.jina.ai` para sites que renderizam só em JavaScript — Nexo, Reuters, staging). O que não abriu está listado em "Registro de acesso" no fim, com o motivo.
- As ferramentas devolvem **texto extraído**, não captura de tela. Portanto, quando descrevo cor, legenda ou layout, é porque a própria página declarou (título de gráfico, rótulo de legenda, `alt`, nome de arquivo, nota metodológica) ou porque o texto o descreve. Onde a fonte não diz, escrevo "não declarado".
- Contexto do produto, lido no staging (`/` e `/territorio/mg-3106200`) e no código (`src/features/story/StoryIntro.tsx`, `src/features/highlights/*`, `src/features/electoral-map/MapLegend.tsx`):
  - **Narrativa "Minas, cidade por cidade" em 5 momentos:** (1) "O mapa do primeiro turno assusta" (mapa sólido numa cor; 48,2% × 43,3% dos válidos); (2) "Mas ele não é exatamente assim" (mosaico municipal; Lula à frente em 452 municípios, Flávio Bolsonaro em 401); (3) "E tem gente que não veio com a gente, mas também não foi para lá" (abstenção 3.735.098 = 22,8% dos aptos; brancos/nulos 661.039 = 5,2% do comparecimento; outros 1.009.751 = 8,4% dos válidos — bases diferentes); (4) "2022 foi decidido aqui" (margem de 49.650 votos, 0,4 p.p.); (5) "A gente não pode se sentir sozinho…" (sol no mapa marca atividade).
  - **Infográfico "Por que Minas decide"** (`WhyMinasStrip`: rótulo curto + mini-SVG + fonte).
  - **Mapa coroplético com bairros aproximados** (Voronoi a partir de locais de votação; legenda divergente "Bolsonaro à frente — empate — Lula à frente"; indicadores: aptos, comparecimento, abstenção, brancos/nulos, cargos; comparação 2022→2026 em p.p. com aviso "não implica transferência de votos").
  - **Agenda** de atividades e **cadastro/participar** ("Quero participar", "Eu vou").
  - Identidade: cartaz político brasileiro; céu `#067fa8`, sol `#e8ba1f`, creme `#ebd6ca`, oliva `#262824`; Anton só em hero/selos; sans no texto.

---

## Referências obrigatórias

### 1. The Pudding — "The Sadness of Song" (experimento com IA) e página inicial

**URLs:** https://pudding.cool/2024/07/ai/ e https://pudding.cool/ (ambas abertas).

**O que vi.** A peça de 2024 é um ensaio de processo ("como pedimos a uma IA que fizesse uma história do Pudding") com um botão "Read Claude's story" que abre a história gerada; setas do teclado alternam processo × história. A história em si segue a gramática clássica da casa: capa com imagem de largura total, manchete grande ("The Sadness of Song…"), subtítulo em uma linha, byline; abertura com uma anedota concreta (uma música) antes da tese; seções com títulos curtos ("The Rise of Negativity", "The Artist Landscape", "Conclusion", "Methodology"); **cada gráfico é introduzido por um título e uma frase, depois interpretado em prosa**; o gráfico central é uma linha (% de músicas negativas por ano, eixo 0–100%) com **pontos de inflexão anotados**; pequenos múltiplos por emoção; dispersão de artistas com filtros; fecha com "Methodology" em linguagem simples e link para o repositório. A página inicial é uma **coluna única de cartões empilhados** (não grade): número da edição ("#225"), mês/ano, miniatura, **título curto em caixa baixa** ("happy map", "mowing experiment") e descrição de uma linha com um número concreto ("Mapping 100,000 moments of human happiness").

**Princípio.** Narrativa = gancho concreto → tese → um gráfico por ideia, cada um apresentado e lido em texto; anotação direto no gráfico; metodologia aberta no fim; títulos curtos e descrições com número.

**Aplicação no Minas Decide.** Momentos 1–5: manter a sequência "frase-tese → gráfico → leitura", com uma anotação ancorada ao dado em cada passo (ex.: no momento 2, seta/rótulo em um município de margem apertada; no momento 4, a margem de 49.650 escrita sobre o gráfico, não só no parágrafo). "Por que Minas decide": adotar o padrão de descrição de uma linha com número. Página de metodologia: seguir o tom "plain-language + limitações + link para dados".

**O que não copiar.** O tom brincalhão/caixa-baixa dos títulos (o produto é uma campanha, não uma revista de curiosidades); o cover fotográfico de largura total (nossa capa é ilustração de cartaz); filtros e busca em gráficos de narrativa (a narrativa deve ser lida, não explorada).

**Justificativa.** O Pudding é a referência mais consistente de "scrollytelling" que funciona por **progressão argumentativa**, não por efeito. A narrativa de 5 momentos já tem essa espinha; falta a anotação no gráfico e a leitura explícita de cada passo.

---

### 2. The Pudding — guias de scrollytelling (Scrollama, scrollytelling responsivo, comparação de bibliotecas)

**URLs:** https://pudding.cool/process/introducing-scrollama/ , https://pudding.cool/process/responsive-scrollytelling/ , https://pudding.cool/process/how-to-implement-scrollytelling (as três abertas).

**O que vi.** Padrão "sticky graphic": o gráfico entra, **fica fixo enquanto os passos de texto rolam**, e solta ao fim ("the scrollytelling portion is not the entire story"). Cada `.step` carrega `data-step` que diz ao gráfico que estado assumir; o espaçamento entre passos é CSS, não JS. Scrollama usa `IntersectionObserver` em vez de eventos de scroll. No guia responsivo: "mobile-first forces you to pare down your experience to the nuts and bolts"; **manter o scroll só quando a transição tem significado** (mudança no tempo, movimento espacial); caso contrário, **empilhar gráficos estáticos**; evitar `vh` (barras do navegador móvel mudam de tamanho) e calcular alturas com `window.innerHeight`; **substituir hover por texto fixo/anotação no celular**; "a sequence that works on desktop may be fatiguing on mobile" — poucos passos.

**Princípio.** Scroll só monitora, não sequestra; a transição entre passos precisa carregar informação; no celular, menos passos e anotação fixa em vez de hover.

**Aplicação.** Momentos 1→2 (sólido → mosaico) e 2→3 (mosaico → camada de abstenção) são **transições com significado** e merecem o mapa fixo com o mesmo enquadramento; momentos 4 e 5 podem ser blocos empilhados (um gráfico de margem; um mapa com sóis). Já existe `useReveal` com `IntersectionObserver` e respeito a `prefers-reduced-motion` em `StoryIntro.tsx`; a regra de `prefers-reduced-motion` do projeto já cobre "empilhar". Para toque: cada passo mostra sua própria anotação (não depender de tooltip).

**O que não copiar.** Steppers/swipe (o guia desaconselha explicitamente); animações longas entre todos os passos; alturas em `vh`.

**Justificativa.** É a fonte primária da técnica que a narrativa já usa; as regras de "quando empilhar" evitam um scrolly cansativo em 360 px de largura, que é o público-alvo (mobile-first).

---

### 3. Reuters Graphics — página de seção e cobertura eleitoral

**URLs:** https://www.reuters.com/graphics/ (aberta só via proxy de texto; os artigos individuais retornaram 401/CAPTCHA); https://graphics.reuters.com/USA-ELECTION/RESULTS/zjpqnemxwvx/ (aberta via proxy: feed de resultados 2024, sem gráficos no texto). Descrições dos mapas de Reuters 2024 vêm da resenha da AnyChart (ref. 14), que lista os quatro mapas da Reuters.

**O que vi.** A seção Graphics é **uma coluna, quase só texto**: título grande "Graphics", um destaque com miniatura larga (em 2026-10-09: "Brazil election results", miniatura descrita como "mapa estilizado do Brasil em gradiente vermelho→azul"), depois lista vertical "More Graphics" com rótulo de categoria, data, manchete em negrito e resumo de uma linha ("Mapping the wildfires outside Bordeaux and Madrid", "Mapping the total solar eclipse", "Inside Nepal's hidden tunnel networks…"). Nas peças eleitorais de 2024, segundo a AnyChart, a Reuters publica **quatro mapas separados com uma pergunta cada**: corridas definidas (coroplético e cartograma hexagonal), **força da liderança** ("choropleth map with a color scale of blue and red shades indicating the vote margin") e **status da apuração** ("how many votes are left to count by state"), com bolhas no drill-down.

**Princípio.** Um mapa por pergunta ("quem venceu", "por quanto", "o que falta") em vez de um mapa que tenta responder tudo; página de seção sobriamente tipográfica em que o gráfico é o ponto focal.

**Aplicação.** Mapa coroplético: separar explicitamente a camada "quem lidera" (categórica, dois polos + neutro) da camada "por quanto" (margem em p.p., sequencial) e da camada "quem não veio" (abstenção, sequencial) — hoje a legenda divergente faz as duas primeiras ao mesmo tempo. Agenda: a lista "rótulo de categoria + data + título em negrito + uma linha" da Reuters é um bom modelo de **lista densa e legível** para atividades, sem cards.

**O que não copiar.** Vermelho/azul partidário (a regra de cartografia do projeto proíbe cores partidárias na escala); miniaturas fotográficas; a página de resultados "ao vivo" com log de chamadas, inadequada a dados consolidados.

**Justificativa.** A Reuters é referência de **mapa noticioso disciplinado**; a decomposição em perguntas resolve a confusão "margem × vencedor" que a legenda atual mistura. Limitação: não vi as peças renderizadas; a descrição dos mapas de 2024 é de segunda mão (AnyChart) e está marcada como tal.

---

### 4. Financial Times — Visual Vocabulary (repositório público)

**URL:** https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary (aberta; https://www.ft.com/vocabulary bloqueado → substituído pelo GitHub, que é a fonte do pôster).

**O que vi.** Pôster/README que organiza tipos de gráfico em **nove famílias por pergunta**: Deviation ("Emphasise variations (+/-) from a fixed reference point"), Correlation ("many readers will assume the relationships… to be causal"), Ranking, Distribution, Change over Time ("Choosing the correct time period is important"), Part-to-whole, Magnitude (coluna "Must always start at 0 on the axis"), Spatial, Flow. Para Spatial: "Basic choropleth (rate/ratio): the standard map approach. **Use rates rather than totals**"; "Proportional symbol (count/magnitude): for totals"; "Dot density: annotate any patterns readers should notice"; cartogramas equalizado e escalado. Para Deviation: **diverging bar** e **spine chart** ("splits one value into two contrasting parts"). Para Change over Time: **slope** ("works when the data can be simplified to two or three points"). Para Magnitude: **lollipop** e **isotype** ("only with whole numbers"). Para Part-to-whole: **gridplot** ("shows percentages, works best with whole numbers").

**Princípio.** Escolher o gráfico pela pergunta, não pelo visual; taxas no coroplético, totais em símbolos; barra sempre do zero.

**Aplicação.** Momento 1 (48,2% × 43,3%): **spine/diverging bar** com os "outros" visíveis entre os polos, em vez de dois números soltos. Momento 3 (bases diferentes: aptos, comparecimento, válidos): **três gridplots/isotype** com unidade explícita, um por base — exatamente o caso "percentuais com números inteiros". Momento 4 e comparação 2022→2026: **slope** por município (dois pontos) ou **lollipop** com 2022 e 2026 por município (como o Nexo, ref. 6). Mapa: margem em p.p. e abstenção em % (taxas) no coroplético; **votos absolutos só como símbolo proporcional** (círculos por local de votação), nunca como preenchimento de área.

**O que não copiar.** Radar/parallel coordinates (ordem das variáveis distorce leitura); área empilhada (o próprio FT diz "use with care"); pie/donut para a divisão dos válidos.

**Justificativa.** É o catálogo mais usado em redações para evitar o erro mais comum do produto hoje — números de bases diferentes apresentados com o mesmo tratamento visual.

---

### 5. Nexo Jornal — página inicial, seção "Gráfico" e cobertura 2026

**URLs:** https://www.nexojornal.com.br/ (via proxy), https://www.nexojornal.com.br/grafico/2026/10/06/lula-bolsonaro-estados-2022-2026 (via proxy e HTML bruto), https://www.nexojornal.com.br/grafico/2026/09/30/votacao-presidente-por-municipio-eleicoes (via proxy), https://www.nexojornal.com.br/serie/2026/10/05/graficos-nexo-eleicoes-2026-primeiro-turno (via proxy). O site é SPA (Next.js): só o proxy devolveu corpo.

**O que vi.**
- **Home:** cartões com miniatura ~320×200, **rótulo de seção colorido em caixa alta** ("GRÁFICO", "EXPRESSO", "ACADÊMICO"), manchete e byline; blocos "Em alta" numerados; rodapé com newsletter "nos eixos" (gráficos e dados). As peças da seção Gráfico são curtas, de um autor, com ícone próprio.
- **"Como cada estado votou em 2022 e como votou em 2026"** (Zanlorenssi e Hemerly, 06/10/2026): linha fina "Veja o percentual de votos válidos no primeiro turno… por unidade da federação e por região"; gráfico "Como cada estado votou em 2022 e como vota agora", unidade "Votos válidos no 1º turno para presidente", **legenda de cinco classes: Lula, Bolsonaro, Outros, Abstenções, Brancos e nulos**; alternador "Estados / Regiões"; cada UF aparece com **2022 e 2026 lado a lado**; o nome do arquivo da imagem de teaser é `lollipop-estados-2022-2026-teaser-laranja`, ou seja, é um **lollipop** com fundo laranja da marca. O texto lê o gráfico em **pontos percentuais**: "Em quatro anos, Lula passou de 48,4% para 45,2%…", "Lula perdeu votos em 25 das 27 unidades da federação", "Minas Gerais e Tocantins, onde Lula tinha vencido em 2022, deram mais votos ao PL em 2026". Fonte: "Fonte: TSE (Tribunal Superior Eleitoral)" + logo.
- **"Como cada município votou para presidente desde 1989, em mapas"** (30/09/2026): painel "O resultado das eleições presidenciais desde 1989 — % de votos válidos, por localidade" com seletor "Escolha um estado ou um município" e alternador 1º/2º/"Turno decisivo"; mapas "O mais votado em cada município" com alternância **"Polígonos" / "Pontos"**, botões por ano (89…26) e **"Exibir todos os mapas"** (pequenos múltiplos); busca "Procure um município nos mapas"; legendas nomeiam candidato e partido ("Eleito: Bolsonaro (PSL)"). Notas metodológicas explícitas: TSE + malhas IBGE; 1989 corrigido pelo projeto Geografia do Voto; percentuais sobre válidos; votos no exterior fora do mapa; municípios criados depois aparecem unidos ao de origem.
- **Série do 1º turno 2026:** "O mapa mais detalhado do 1º turno" é **mapa de pontos por local de votação** (vermelho onde Lula foi o mais votado, azul onde Flávio Bolsonaro); hemiciclos do Senado (assentos brancos sobre laranja) e da Câmara (sobre lilás) com marca "Eleições 2026".

**Princípio.** Unidade declarada no subtítulo do gráfico; comparação temporal como pares lado a lado por território, lida em p.p. no texto; "polígonos × pontos" como alternância honesta para dados por local de votação; notas metodológicas curtas e específicas no rodapé do gráfico; cor de marca no fundo, não nos dados.

**Aplicação.** Comparação 2022→2026 na página de território e no momento 4: **lollipop/dumbbell por município ou bairro**, 2022 e 2026 no mesmo eixo, variação em p.p. no rótulo — substitui a tabela de quatro números. Mapa: oferecer **"Pontos (locais de votação)"** ao lado de "Áreas aproximadas", já que os dados do Minas Decide são por local (regra de cartografia); legendas com unidade na mesma linha do título. Rodapé dos gráficos: adotar a fórmula "Fonte: TSE; malhas IBGE; bairros aproximados por Voronoi de locais de votação". Agenda e cadastro: o rótulo de seção colorido em caixa alta do Nexo é um bom "selo" para o tipo de atividade (panfletagem, caminhada, conversa).

**O que não copiar.** Vermelho/azul por candidato; a abundância de controles (seletor + alternador + busca + anos) numa narrativa — isso é para a página de território, não para os 5 momentos; fundo de marca saturado atrás de gráfico de dados sem checar contraste.

**Justificativa.** É o único veículo brasileiro examinado que faz exatamente o que o produto faz (município, local de votação, comparação 2022×2026, p.p.) com padrões editoriais maduros. Limitação: cores e tipografia do gráfico não são declaradas no texto; descrições de legenda vêm dos rótulos e do `alt`.

---

### 6. Nexo — análise acadêmica das visualizações (UFPB, revista Temática)

**URL:** https://periodicos.ufpb.br/index.php/tematica/article/download/68340/38280/204447 (PDF aberto via proxy).

**O que vi.** Analisa duas peças de 2020 ("As projeções para o PIB global: antes e durante a pandemia" e "O que é a OMS e como ela é financiada"). Observa que a primeira **abre com um "guia de leitura"** ("a primeira imagem apresentada (figura 1), ensina como ler gráficos") antes dos mapas; usa escala **divergente rosa→verde** com transparência para sobreposição de períodos; a segunda usa cor por continente e branco para empresas/ONGs, com legenda no meio do gráfico. Crítica: a visão global "perde a individualidade dos dados"; "a suposta liberdade do [leitor] está condicionada à construção realizada pelo jornalista".

**Princípio.** Ensinar a ler o gráfico uma vez, no início; legenda onde o olho está; assumir que a escolha editorial conduz a leitura.

**Aplicação.** Momento 1 deve funcionar como **guia de leitura** do resto: apresentar a escala divergente (dois polos + neutro) e a unidade uma vez, e reutilizá-la idêntica nos momentos 2 e 4 e no mapa. Para o mapa coroplético, legenda **sobre o mapa** (canto), não abaixo da dobra.

**O que não copiar.** Rosa/verde (não está nos tokens e falha para daltônicos sem lightness adequada).

**Justificativa.** Confirma com um caso brasileiro a prática do "guia de leitura" que também aparece no Pudding (introdução de cada gráfico) e no Datawrapper (legenda decifrável).

---

### 7. NN/g — "5 Principles of Visual Design in UX"

**URL:** https://www.nngroup.com/articles/principles-visual-design/ (aberta).

**O que vi.** Escala ("Using relative size to signal importance"; **no máximo três tamanhos distintos**; o mais importante é o maior); hierarquia (dois ou três tamanhos de tipo; combinar escala, cor e espaço; "if users struggle to find where to look, the hierarchy likely needs work"); equilíbrio (simétrico = estável, assimétrico = energético; "the area taken by the design element matters… not just the number of elements"); contraste (reservar uma cor viva para uma função; **"Don't lower text contrast to de-emphasize content"**); Gestalt/proximidade (rótulo colado ao campo — exemplo Uber vs. formulário 1040).

**Princípio.** Três tamanhos, uma cor de ênfase, proximidade para agrupar, contraste nunca sacrificado para "rebaixar".

**Aplicação.** "Por que Minas decide": o número é o elemento maior (Anton), o rótulo é o segundo tamanho, a fonte é o terceiro — e **nada mais**; sem card nem sombra. Cadastro: rótulo imediatamente acima do campo, erro imediatamente abaixo (já previsto em `aria-describedby`), grupos separados por espaço, não por caixas. Agenda: assimetria controlada (data em coluna estreita à esquerda, título e local à direita) dá energia sem cards.

**O que não copiar.** Rebaixar texto secundário com cinza claro sobre creme (o creme `#ebd6ca` já reduz contraste; "muted" precisa ser conferido a 4,5:1).

**Justificativa.** Estabelece limites numéricos simples (3 tamanhos, 2 elementos grandes) que resolvem o aspecto "dashboard SaaS" que a regra de frontend proíbe.

---

### 8. NN/g — "Visual Hierarchy in UX: Definition"

**URL:** https://www.nngroup.com/articles/visual-hierarchy-ux-definition/ (aberta).

**O que vi.** Três ferramentas: **cor/contraste** ("It's not the actual color of an element that creates the hierarchy", é o contraste de valor e saturação), **escala**, **agrupamento** (proximidade, espaço em branco, contêineres só quando o espaço não basta — "Let it breathe"). Recomendações com números: ~2 cores primárias + 2 secundárias; **3 tratamentos de contraste** no máximo; 3 tamanhos (14–16 px corpo, 18–22 px subtítulo, até 32 px título na web — no nosso caso o hero em Anton é a exceção declarada); **no máximo 2 elementos grandes por tela**; "Do not rely only on color to communicate visual hierarchy"; **teste do desfoque** (squint test) para ver se os agrupamentos sobrevivem; uma imagem muito colorida pode dominar uma página mesmo ilustrando algo secundário.

**Princípio.** Hierarquia é contraste + escala + agrupamento, limitados; defina a ordem de importância antes de desenhar; teste desfocando.

**Aplicação.** Em cada momento da narrativa há **um** elemento grande (o número ou o mapa), não os dois. Na página de território, a ilustração do hero (sol/montanhas) não deve competir com o mapa: reduzir ou remover abaixo do hero. Aplicar o teste do desfoque nas capturas do `design-review`: se o sol amarelo do mapa de atividades "ganha" do dado, a hierarquia está invertida.

**O que não copiar.** Contêineres para tudo; a sugestão de 32 px como teto não vale para o display em Anton, que é selo/hero.

**Justificativa.** Dá o critério para decidir "números protagonistas com anotação em vez de cards": o card é um contêiner que a NN/g manda usar só quando o espaço não resolve.

---

### 9. Datawrapper Academy — "What to consider when creating choropleth maps"

**URL:** https://www.datawrapper.de/academy/what-to-consider-when-creating-choropleth-maps (aberta).

**O que vi.** "Choropleth maps work best for **relative data**" (taxas, não contagens; para absolutos, mapa de símbolos); "great to see the big picture, but **not for subtle differences**"; comparações exatas entre regiões pedem tabela/outro gráfico; áreas grandes e vazias dominam (considerar cartograma, com a ressalva de que é mais difícil de ler); **menor unidade disponível** revela padrão; três famílias de escala — sequencial, divergente, categórica; em divergente, "**the color in the middle should be the lightest one and the extremes should be the darkest ones**"; reservar o mais escuro para os extremos; passos discretos "sacrifice nuance for quick readability", contínuo ajuda a comparar vizinhos; tooltips dão o valor exato; legenda: mínimo, máximo e **2 a 4 cores intermediárias, com valores redondos (0, 25, 50)**; divergente mostra o **valor central**.

**Princípio.** Taxas no coroplético; divergente com centro claro e extremos escuros; legenda com valores redondos e centro explícito; detalhes finos vão para tooltip/tabela.

**Aplicação.** Mapa: a legenda "Bolsonaro à frente — empate — Lula à frente" vira **escala com classes rotuladas em p.p.** (ex.: >20 / 10–20 / 0–10 / empate técnico ±2 / 0–10 / 10–20 / >20) com "empate" na cor mais clara (creme). Abstenção: sequencial em 4–5 classes com valores redondos (15, 20, 25, 30%). Páginas de bairro: para diferenças finas entre bairros vizinhos, **lista ordenada com o valor** ao lado do mapa (já existe "Onde a abstenção pesa mais"), não só o mapa.

**O que não copiar.** Escala contínua sem marcas (impede ler a classe no celular); cartograma para bairros (não temos geometria oficial, e o Datawrapper avisa que cartograma exige familiaridade).

**Justificativa.** É a lista de verificação mais direta para o item "legenda do coroplético com classes e unidade visível".

---

### 10. Datawrapper Academy — "Customizing your choropleth map"

**URL:** https://www.datawrapper.de/academy/customizing-your-choropleth-map (aberta).

**O que vi.** Tipo de legenda "steps" ("each color covers a range, e.g. yellow covers 5–10%") × contínua; interpolação para enfatizar valores altos; **centro customizado em "0"** para dados com positivo e negativo; "Hide region borders" dá visual limpo mas "makes similar regions harder to tell apart"; **padrões (hachuras)** para sobrepor uma segunda informação, com legenda própria; "Crop to data" e ocultar regiões sem dado; **inset/globo** para orientação ao dar zoom; anotações de texto **sobre o mapa** para explicar um contraste; aba Annotate reúne título, descrição, notas, fonte, byline e **descrição para leitor de tela**.

**Princípio.** Bordas finas ajudam a distinguir áreas semelhantes; hachura para segunda variável; anotação sobre o mapa; descrição textual do mapa é parte do gráfico.

**Aplicação.** Mapa de bairros aproximados: **bordas claras finas** entre polígonos Voronoi (são aproximações; a borda visível lembra que são áreas construídas); **hachura** para "dado parcial/demo" em vez de outra cor; **mini-inset de Minas** ao navegar num município; texto `sr-only` com o resumo do mapa (já há `sr-only` na legenda; estender ao mapa). Momento 2: uma anotação sobre o mapa apontando um exemplo de "margem apertada".

**O que não copiar.** Ocultar bordas; usar hachura para mais de uma categoria.

**Justificativa.** Complementa a ref. 9 com o que torna o mapa **honesto sobre a aproximação por bairro**, exigência da regra de cartografia.

---

### 11. Observable — "Crafting data colors"

**URL:** https://old.observablehq.com/blog/crafting-data-colors (aberta).

**O que vi.** Foco em **paletas categóricas**. Seis metas: muitas cores, ligação à paleta da marca, diferenciação em marcas pequenas/finas, usabilidade para daltônicos, cores fáceis de nomear, funcionar em fundo claro e escuro. Avaliação em **CIELAB** ("covers the entire gamut of human visual perception") e busca de candidatas em **OKLCH**. Descartaram duas cores da marca por serem claras demais sobre branco; testaram com simulação de deuteranopia (Color Oracle) e, onde ciano e rosa ficaram parecidos, **mantiveram e compensaram com rótulos, formas, tooltips e tracejado** ("encoding data in other ways"). Ordenação: as duas primeiras com forte contraste, depois alternar tons fortes e suaves.

**Princípio.** Derivar cores de dados da marca em espaço perceptual; cor nunca é o único canal; testar daltonismo cedo.

**Aplicação.** Construir `--map-fill-*` e a escala divergente em OKLCH a partir de céu e sol: o problema concreto é que **sol `#e8ba1f` é claro** (L alto) e, numa escala divergente, o extremo precisa ser escuro — logo o polo "sol" precisa de um tom **ocre/âmbar escuro** derivado, e o centro deve ser creme. Categorias de atividade na agenda (panfletagem, caminhada, conversa, reunião): no máximo 4 cores nomeáveis (céu, sol, oliva, terracota derivada), sempre com ícone/rótulo. Verificar deuteranopia nos pares céu × ocre.

**O que não copiar.** Dez cores categóricas (nosso universo tem 3–4 categorias); "dark mode" como requisito de primeira ordem (o produto é cartaz claro).

**Justificativa.** Traduz a regra "componentes consomem tokens; sem paleta solta" para dados: as cores de mapa precisam nascer dos tokens, mas em espaço perceptual, não copiando o hex.

---

### 12. Storytelling with Data — "Design effective graphs and slides" (com IA)

**URL:** https://www.storytellingwithdata.com/blog/swd-ai-design-effective-graphs-and-slides (aberta).

**O que vi.** "Anything that doesn't add informative value is clutter"; alinhar; focar atenção — "The most powerful tool for this is color used sparingly" (uma cor de ênfase sobre neutros); anotar — "Key data points should be annotated where they add meaning"; **todo gráfico tem título descritivo e todo slide tem título-conclusão** ("Every slide needs a takeaway title"); "Every word that isn't earning its place is adding noise"; começar pela identidade da organização. Armadilhas da IA: rótulos demais, muitas cores, descrever opções em vez de recomendar.

**Princípio.** Título = conclusão; uma cor de ênfase; anotar só o que importa; cortar palavras.

**Aplicação.** Os títulos dos 5 momentos já são conclusões ("O mapa do primeiro turno assusta", "2022 foi decidido aqui") — manter esse padrão também nos gráficos de "Por que Minas decide" e nos títulos das seções da página de território ("Onde a abstenção pesa mais" está certo; "Resultados eleitorais" não é conclusão). Em cada gráfico, **uma única cor de ênfase** (sol) sobre oliva/cinza; o resto neutro.

**O que não copiar.** Estética de slide corporativo (fundos brancos, caixas); o conselho de "começar pelo template da organização" não se aplica literalmente.

**Justificativa.** Fundamenta "números protagonistas com anotação em vez de cards": o card é clutter; a anotação é o que "ganha o lugar".

---

### 13. WCAG 2.2 — Quick Reference (critérios selecionados)

**URL:** https://www.w3.org/WAI/WCAG22/quickref/ (aberta em duas leituras; texto exato extraído).

**O que vi.**
- **1.4.3 Contraste (mínimo), AA:** texto e imagens de texto com razão ≥ 4,5:1 (exceções: texto grande 3:1, incidental, logotipos).
- **1.4.10 Reflow, AA:** conteúdo apresentável sem perda de informação/funcionalidade e **sem rolagem em duas dimensões** (320 CSS px de largura para conteúdo vertical).
- **1.4.11 Contraste não textual, AA:** componentes de interface e **objetos gráficos** com ≥ 3:1 contra cores adjacentes.
- **2.3.3 Animação por interação, AAA:** animação de movimento disparada por interação pode ser desativada, salvo se essencial.
- **2.4.11 Foco não obscurecido (mínimo), AA:** componente focado não fica totalmente escondido por conteúdo do autor (nota: conteúdo aberto pelo usuário pode cobrir, se puder ser revelado sem mover o foco).
- **2.4.13 Aparência do foco, AAA:** indicador com área ≥ perímetro de 2 CSS px do componente e contraste ≥ 3:1 entre estados focado/não focado.
- **2.5.8 Tamanho do alvo (mínimo), AA:** ≥ **24×24 CSS px**, com exceções de espaçamento (círculos de 24 px que não se cruzam), equivalente, inline, agente de usuário e essencial.

**Princípio.** Contraste 4,5:1 em texto e 3:1 em cores de mapa adjacentes e em foco; largura de 320 px sem rolagem horizontal; alvos ≥ 24 px (o projeto já adota 44 px); animações desligáveis.

**Aplicação.** Mapa: **classes adjacentes da escala precisam de ≥ 3:1 entre si ou borda de separação** (1.4.11) — com 7 classes isso é impraticável, logo ≤ 5 classes com borda clara entre áreas. Bottom sheet e painéis (vaul): garantir que o elemento focado não fique sob o sheet (2.4.11). Legenda e textos sobre creme: checar 4,5:1 para `text-muted`. Narrativa: `prefers-reduced-motion` desliga reveal/flyTo (já implementado) — mantém 2.3.3. Reflow: a comparação lado a lado do momento 2 precisa **empilhar em 320 px**, não encolher.

**O que não copiar.** Nada a "copiar"; é norma. Mas não confundir AAA (2.4.13, 2.3.3) com obrigação — o projeto mira AA e já excede alvo (44 px).

**Justificativa.** A regra de frontend exige WCAG 2.2 AA; os critérios citados são os que mais colidem com mapa coroplético, scrollytelling e bottom sheet.

---

## Referências complementares

### 14. AnyChart DataViz Weekly — "27 Election Maps of 2024 U.S. Presidential Vote Results"

**URL:** https://www.anychart.com/blog/2024/11/08/us-election-maps/ (aberta).

**O que vi.** Inventário de 27 mapas por veículo, com tipo e descrição. Padrões recorrentes: **cartograma + coroplético lado a lado** (WaPo, Politico, Axios, Al Jazeera); **hachura diagonal para "virou"** (CNN; ABC com "color-blind mode that adds hatch fills"); **bolhas por margem** (Guardian: "sizes counties by winning margin, colored by party"); **spikes** (Bloomberg: "shaded triangles… height reflecting the magnitude of the change"); **setas de deslocamento** (NYT: "swing map or hedgehog map, conveys shifts in margin from 2020"); Reuters com quatro mapas (vencedor, força da liderança, apuração, bolhas); animação coroplético→cartograma (Douïeb: "scales states by electoral weight, preserving the U.S. shape for recognition").

**Princípio.** Para "mudança entre duas eleições" o setor usa **setas/spikes/bolhas de margem**, não um segundo coroplético; hachura é a convenção acessível para estado especial.

**Aplicação.** Comparação 2022×2026 no mapa de Minas: **mapa de setas por município** (direção = para que lado a margem se moveu; comprimento = p.p.) ou spikes — mais honesto que dois coropléticos e cabe em pequenos múltiplos ao lado do mapa de 2026. Hachura para municípios com dado parcial/demo.

**O que não copiar.** Dezenas de camadas e abas por mapa; cartograma eleitoral (colégio eleitoral não existe aqui); cores partidárias.

**Justificativa.** Resenha de segunda mão, mas útil como **censo das convenções** e única fonte que descreveu os mapas da Reuters e do NYT, que estavam bloqueados.

---

### 15. Datawrapper — "Arrow maps" e mapa de Berlim (ratio × diferença × share)

**URLs:** https://www.datawrapper.de/blog/arrow-maps e https://www.datawrapper.de/blog/weekly42-berlin-election-result-map/ (ambas abertas).

**O que vi.** Arrow map para "the direction and size of a change… such as party support (especially in a two-party system!)"; setas esquerda/direita para contraste entre duas categorias, cima/baixo para aumento/queda; legenda "explains the meaning of your arrows' direction, color, and length"; "Reduce size on smaller screens". No mapa de Berlim (Linke × AfD), a autora compara três codificações: **share do vencedor** ("artificially increases the polarisation… if the AfD gets just one more vote… the whole district flips"), **diferença em p.p.** ("the color fill would be exactly the same, no matter the absolute values") e **razão** ("takes both into account, the difference and the absolute values"); centro claro, extremos escuros.

**Princípio.** Nunca pintar pelo vencedor sozinho; diferença em p.p. é honesta mas cega ao volume; mostrar volume por outro canal (tamanho).

**Aplicação.** Momento 2 ("não é exatamente assim") é literalmente o argumento de Berlim: **ao lado do mapa sólido, o mapa por município pintado pela margem em p.p. com classe "empate técnico" clara**, e um texto que diz quantos municípios estão nessa classe. Na página de território, acrescentar **tamanho (eleitores) como canal** — círculo proporcional por local de votação sobre a área aproximada — para que bairros grandes e pequenos não pareçam iguais.

**O que não copiar.** Razão como escala pública (difícil de explicar a eleitor leigo); rosa/azul.

**Justificativa.** Resolve a decisão "legenda divergente de 2 cores + neutro" com argumento técnico e indica a correção do volume.

---

### 16. Datawrapper — "What to consider when choosing colors for political parties"

**URL:** https://www.datawrapper.de/blog/partycolors (aberta).

**O que vi.** Quatro abordagens: cores dos partidos, cores políticas (vermelho socialismo etc.; "vary by country"), arbitrárias/mnemônicas (NYT: "Red begins with R"), e **cores não usadas por ninguém**; critérios: "sufficiently different" e "consistent across all newsrooms". Observa que dar cor mais saturada a um partido é **escolha editorial que muda a percepção** (caso AfD em Spiegel/FT/538).

**Princípio.** Cor é posicionamento editorial; saturação = destaque.

**Aplicação.** Reforça a regra do projeto: **escala sem cores partidárias**. Com céu × ocre (derivado de sol) e centro creme, os dois polos têm saturação equivalente — nenhum candidato "brilha mais" por cor. O sol amarelo puro fica reservado para **atividade/presença** (momento 5, agenda), e não para um candidato.

**O que não copiar.** Mapear PT/PL para vermelho/azul "porque todo mundo faz".

**Justificativa.** Sustenta uma decisão já tomada (regra de cartografia) com argumento de fonte externa, útil para o `DECISIONS.md`.

---

### 17. Datawrapper — "Data visualizations for the German election 2021"

**URL:** https://www.datawrapper.de/blog/data-visualizations-german-election-2021-with-datawrapper (aberta).

**O que vi.** Inventário de formatos de redações (ZEIT, NZZ, Tagesspiegel, Guardian, Politico, Economist, ZDF, SPIEGEL): linhas de pesquisas com **pontos individuais para mostrar que a linha é média**; intervalos sombreados ("these are not the final results"); coropléticos de share por partido e de "quem mais ganhou eleitores vs. 2013"; **"you can always place a few maps next to each other to show the vote shares of multiple parties"** (Berliner Morgenpost; "patterns especially apparent for smaller parties"); tooltip mostrando **margem entre 1º e 2º** para destacar disputas apertadas.

**Princípio.** Pequenos múltiplos por candidato/variável; tooltip com margem, não só valor.

**Aplicação.** Pequenos múltiplos 2022 × 2026 (dois mapas de Minas, mesma escala, mesma legenda) e, na página de território, múltiplos por cargo (presidente, governador, senador) em miniatura. Tooltip/painel do município: **margem 1º–2º em p.p.** na primeira linha.

**O que não copiar.** Linhas de pesquisa (o produto não publica pesquisas); cores por partido.

**Justificativa.** Documenta a convenção "pequenos múltiplos para 2022×2026" em uso em redações.

---

### 18. LabCidade/FAUUSP — "Cartografias para disputar o voto" (Outras Palavras)

**URL:** https://outraspalavras.net/outrasmidias/cartografias-para-disputar-o-voto/ (aberta).

**O que vi.** Pedro Rezende, Aluízio Marino, Pedro Lima e Raquel Rolnik criticam os mapas "vencedor leva tudo" da imprensa: "Essa operação esconde a quão acirrada ou concentrada foi a disputa dentro desses perímetros"; o método só faz sentido em sistema distrital; "é o número de eleitores a informação que realmente importa". Propõem **mapas de diferença** (Lula − Bolsonaro, % dos válidos) em versão regular e **anamorfose por eleitores aptos** ("as regiões com mais eleitores têm margens mais apertadas"), **mapas de abstenção**, e mapas por **zona eleitoral** nas metrópoles agrupando brancos, nulos, abstenção e eliminados. Conclusão: "**não existem nem municípios, nem bairros petistas ou bolsonaristas**".

**Princípio.** O mapa sólido mente por omissão; margem + volume + não-voto são três mapas diferentes; o bairro não tem partido.

**Aplicação.** É a **tese do momento 1→2→3 escrita por geógrafos brasileiros**: (1) sólido; (2) diferença por município; (3) abstenção/brancos/nulos/outros. Citar em "Metodologia" e usar a frase "não existem bairros petistas ou bolsonaristas" como ética do mapa de bairros (nunca rotular bairro como "nosso/deles"; sempre margem + abstenção). A ideia de agrupar "quem não votou em nenhum dos dois" é exatamente o momento 3.

**O que não copiar.** Anamorfose (sem geometria oficial de bairro e com público leigo, é ilegível no celular); o tom de artigo acadêmico.

**Justificativa.** Referência brasileira, de 2022, que valida a estrutura narrativa do produto e dá vocabulário para a nota metodológica.

---

### 19. Outras Cartografias — "Um mapa mais real da votação no Brasil?" (Outras Palavras)

**URL:** https://outraspalavras.net/estadoemdisputa/um-mapa-mais-real-da-votacao-no-brasil/ (aberta).

**O que vi.** Nove autores (Fonseca, Oliva, Lévy et al.) com **cartogramas em anamorfose** em que "São Paulo ocupa uma área proporcional à sua população"; "Como é a população que vota e não os territórios, esses são realmente mapas eleitorais"; mapas como "linguagens visuais construídas"; classificação REGIC/IBGE (metrópole → centro local) e "urbanidade" como chave de leitura; ressalvas explícitas ("poderia ser totalmente ocasional").

**Princípio.** Território ≠ eleitorado; mostrar peso populacional é uma escolha de linguagem, com ressalvas declaradas.

**Aplicação.** Momento 2: além do mosaico, uma linha que diga **quantos eleitores** estão nos municípios de margem apertada (não só quantos municípios) — correção de leitura sem anamorfose. Página de território: ordenar bairros por **eleitores aptos** como padrão (os grandes primeiro), e rotular "aproximado".

**O que não copiar.** Anamorfose e classificação REGIC (complexidade sem ganho para o eleitor).

**Justificativa.** Segunda fonte brasileira para o mesmo princípio, com ênfase em **declarar ressalvas**, o que o produto já faz ("não implica transferência de votos").

---

### 20. Congresso em Foco — mapa interativo do 2º turno 2022 por município

**URL:** https://www.congressoemfoco.com.br/area/pais/quantos-votos-lula-e-bolsonaro-receberam-em-cada-municipio/ (aberta).

**O que vi.** Mapa dos 5.568 municípios colorido pelo vencedor ("As cidades marcadas em Vermelho foram vencidas pelo candidato do PT… as de azul deram a vitória a Bolsonaro"), seleção por estado ("aguarde alguns segundos para o mapa carregar e passe o cursor por cada município"), busca por cidade, comparação com 2018; números nacionais no texto (60.345.999 = 50,90%). Arte: Thiago Freitas.

**Princípio (negativo).** É o **anti-exemplo** do momento 1: vencedor-leva-tudo, dependente de hover, carregamento lento, sem margem.

**Aplicação.** Serve para a comparação lado a lado do momento 2: o "mapa que assusta" é este padrão; o nosso mostra margem e empate. Também lembra que a **busca por cidade** é uma expectativa real do leitor brasileiro — já existe na home do staging; manter proeminente.

**O que não copiar.** Pintar por vencedor; instruções do tipo "aguarde o mapa carregar"; hover como único acesso ao valor.

**Justificativa.** Documenta o padrão dominante na imprensa brasileira em 2022, contra o qual a narrativa se posiciona.

---

### 21. Gazeta do Povo — "Mapa do voto" (1º turno 2022)

**URL:** https://www.gazetadopovo.com.br/eleicoes/2022/mapa-do-voto-como-foi-o-desempenho-de-lula-e-bolsonaro-em-todos-os-municipios-do-pais/ (aberta).

**O que vi.** Mapa municipal em que "a coloração mais escura indica um porcentual mais elevado de votação no candidato" (vencedor + intensidade), e um segundo gráfico com "a proporção de votos de acordo com o tamanho da população de cada município". Números de abertura: Lula venceu em 3.376 municípios, Bolsonaro em 2.194.

**Princípio.** Intensidade por share do vencedor (a codificação que a Datawrapper mostra que exagera polarização) e, em compensação, um gráfico por **porte de município**.

**Aplicação.** O gráfico "votos por porte de município" é uma boa peça para "Por que Minas decide": barras por faixa de população (até 20 mil, 20–100 mil, 100–500 mil, BH/RMBH) com % de Lula e de Flávio Bolsonaro — mostra onde a campanha presencial rende.

**O que não copiar.** Intensidade pelo share do vencedor; contar "municípios vencidos" como manchete sem o número de eleitores ao lado.

**Justificativa.** Mostra que até o padrão "melhorado" da imprensa (intensidade) tem o defeito que a ref. 15 descreve, e oferece o recorte por porte como alternativa.

---

### 22. Pindograma — jornalismo de dados eleitoral brasileiro

**URL:** https://pindograma.com.br/ (aberta).

**O que vi.** "Jornalismo de dados sem papo-furado". Home com dois ensaios grandes (imagem, título, autor, resumo de uma linha), **caixa "ranking de institutos"** com notas (A, B−) atualizada em setembro de 2024, lista "recentes" cronológica com data/miniatura/autor, newsletter quinzenal. Sem mapas na home; peças sobre desempenho de pesquisas, prosódia de candidatos, partidos.

**Princípio.** Página de entrada **tipográfica, cronológica e com uma caixa de referência** que sintetiza o produto.

**Aplicação.** A home do Minas Decide pode ter uma "caixa de referência" equivalente: o **placar de Minas** (válidos, abstenção, margem 2022) em três números, sempre no mesmo lugar, sem card decorativo. Agenda: lista cronológica com data em destaque e autor/organizador omitido (PII).

**O que não copiar.** Ranking (nada de ranking político, por regra de cartografia); tom polêmico.

**Justificativa.** Referência nacional de layout sóbrio para dados eleitorais; mostra que a lista cronológica é suficiente.

---

### 23. Tupinambá Lambido — lambe-lambe político (entrevista, Meer)

**URL:** https://www.meer.com/pt/63750-tupinamba-lambido (aberta).

**O que vi.** Coletivo carioca de lambes políticos pós-2016: "nos apropriamos dos símbolos, logos e imagens das instituições de poder" para usá-los "contra eles de forma crítica"; **letras reescritas para formar novas palavras** ("O Golpe (O Globo)", "Satan (Santander)"); mistura de antropofagia e "mídia tática"; colagem sobre "pontos de colagens de campanhas publicitárias" nas zonas norte, oeste, sul e centro do Rio; tradição ligada aos cartazes de shows e teatro. Cores e técnica de impressão **não declaradas** na entrevista (não citam serigrafia nem xerox).

**Princípio.** O cartaz urbano fala com **uma palavra grande, um símbolo reconhecível e um gesto de apropriação**; é colado onde o olhar já passa.

**Aplicação.** Hero e selos em Anton: **uma palavra ou frase curta por selo** ("EU VOU", "MINAS DECIDE", "DEMO"), nunca parágrafo em display. Momento 5 e agenda: a linguagem do lambe (bloco de cor chapada, tipografia grande, sem gradiente) para o **selo de atividade** ("PANFLETAGEM · SÁB 10h · PRAÇA SETE"). Cadastro: botão "Quero participar" como cartaz: fundo sol, texto oliva, sem ícone.

**O que não copiar.** Apropriação de logos de terceiros (risco jurídico e de marca); estética "xerox sujo" aplicada a dados (reduz legibilidade e contraste em mapas); anonimato/ilegalidade como estilo.

**Justificativa.** É a referência de **linguagem**, não de execução: justifica o Anton em selos e o bloco chapado de cor, e delimita o que fica fora da área de dados. A busca acadêmica (Intercom/UNESP/USP) confirmou a ligação lambe ↔ tipografia móvel ↔ xilogravura, mas os PDFs não abriram (ver registro).

---

### 24. Xilogravura de cordel — da capa utilitária ao objeto de arte (URCA, Revista Cadernos do Nordeste)

**URL:** https://revistas.urca.br/index.php/rcn/article/download/361/241/1251 (aberta via proxy).

**O que vi.** Capas dos folhetos dos anos 1920 tinham "apenas vinhetas tipográficas e informações sobre o conteúdo"; nos anos 1940 entram ilustrações em **zincogravura** para tornar o produto atraente; em 1949 a tipografia São Francisco (Juazeiro do Norte) adota a **xilogravura por ser mais rápida de produzir** (Walderêdo Gonçalves, Mestre Noza); leitores reclamaram ("Os leitores de cordel não querem saber de princesas com traços rudes"); Suassuna (1952) e o MAUC (1961) a consagram como arte.

**Princípio.** A xilogravura nasce de **restrição de produção** (rapidez, custo) e vira identidade; a capa é "texto visual" que antecipa o conteúdo (busca complementar: Galvão 2001 — "a ilustração das capas atrai o leitor e antecipa o assunto").

**Aplicação.** Ilustrações do hero e das seções (sol, montanhas) em **traço de corte único, duas cores (oliva sobre creme) + um acento (sol)**, como vinheta de capa — pequenas, repetíveis, geradas uma vez (SVG), não fotografia nem gradiente. "Por que Minas decide": o mini-SVG de cada item no mesmo traço de xilo. Cadastro/obrigado: vinheta de fechamento (como capa de folheto) em vez de ícone de check.

**O que não copiar.** Traço "rude" em elementos de dados (barras, mapas) — a xilo é para vinhetas, não para gráficos; falsas texturas de madeira/ruído; estilização medievalizante.

**Justificativa.** Dá base histórica para "cartaz político brasileiro" além do lambe: a restrição de produção (poucas cores, formas simples, SVG leve) é também uma restrição de desempenho e acessibilidade do produto.

---

### 25. La Nación Data (Argentina) — "Draw your own election adventure" (Source/OpenNews)

**URL:** https://source.opennews.org/articles/draw-your-own-election-adventure/ (aberta; o blog da La Nación recusou conexão).

**O que vi.** Para as eleições de 2015 em Buenos Aires, o leitor **desenha uma forma sobre o mapa** e recebe os resultados agregados dos locais de votação dentro dela, porque as comunas "meant little to many people, who identified with neighborhoods and smaller sub-neighborhoods" — o problema de bairro sem limite oficial. Cada local de votação tem **uma seta comparando com a primária**, "using the party's color for gains and black for losses". Basemap no Mapbox Studio que **esconde nomes de rua e bairro em zoom alto** "so the results stayed the focus". Só uma seleção por vez ("multiple shapes could confuse"). Stack: Leaflet + D3 + CartoDB.

**Princípio.** Quando o bairro não tem limite oficial, agregue por **locais de votação** e deixe o leitor definir a área; basemap recua quando o dado entra em foco.

**Aplicação.** Mapa de bairros aproximados: o rótulo "bairro aproximado (Voronoi de locais de votação)" deve ser visível, e, na página de território, oferecer **"ver os locais de votação deste bairro"** como lista (sem desenhar forma — complexidade demais). Basemap MapLibre: **estilo próprio que esconde labels de rua ao mostrar a camada de dados** e volta a mostrar ao escolher atividade (agenda). Comparação 2022→2026 por local: seta com cor por direção e **preto/oliva para queda** — padrão não partidário.

**O que não copiar.** Ferramenta de desenho (manutenção, acessibilidade por teclado); Fusion Tables/CartoDB (fora da arquitetura: snapshots estáticos).

**Justificativa.** Referência latino-americana que enfrentou **exatamente** o problema "bairro sem polígono" com local de votação como unidade — a mesma aproximação metodológica do SOURCE.

---

### 26. Atlas digitais brasileiros — Atlas Socioeconômico do RS e IBGE Cidades (MG)

**URLs:** https://atlassocioeconomico.rs.gov.br/inicial e https://cidades.ibge.gov.br/brasil/mg/panorama (ambas abertas; só a página de entrada).

**O que vi.** Atlas RS: menu lateral em **seis capítulos** (Apresentação, Infraestrutura, Meio ambiente, Demografia, Indicadores sociais, Economia) com subgrupos recolhíveis; "Anexos" (e-book, Ficha Técnica, Referências e Sites, Notas Técnicas); botão de alto contraste; 8ª ed., atualização nov/2024. IBGE Cidades: lista de indicadores em sete grupos com **ano de referência entre colchetes no rótulo** ("População no último censo [2022]", "Salário médio mensal dos trabalhadores formais [2023]"); rótulos sem unidade no texto extraído; alguns anos "[undefined]".

**Princípio.** Atlas = capítulos nomeados + ficha técnica + notas; **ano e fonte presos ao rótulo do indicador**; alto contraste como controle explícito.

**Aplicação.** Página de território: cada indicador carrega **ano/turno e base** no rótulo ("Abstenção [1º turno 2026] — % dos aptos"), seguindo o IBGE mas com unidade (o IBGE não mostra). "Metodologia" vira **Ficha técnica + Notas técnicas** como no Atlas RS. Status do snapshot (`validated|partial|demo`) exibido como no cabeçalho do atlas ("8ª ed., atualização nov/2024").

**O que não copiar.** Menu de capítulos para um público de campanha; "[undefined]" (sempre ter fallback de texto para dado ausente, ex.: "sem dado").

**Justificativa.** Mostra o mínimo institucional (ano, fonte, nota técnica) que um "atlas público" precisa para ser levado a sério, e o erro de omitir unidade.

---

## Princípios consolidados para o redesign

1. **Um gráfico por ideia; cada gráfico apresentado por uma frase e lido por outra** (Pudding, SWD). Títulos de gráfico são conclusões, não rótulos ("2022 foi decidido aqui", não "Resultado 2022").
2. **Unidade e base no mesmo lugar do título** ("% dos aptos", "% dos válidos", "p.p."), nunca inferidas (Nexo, IBGE, FT). Bases diferentes nunca compartilham o mesmo eixo nem o mesmo tratamento visual.
3. **Três tamanhos de tipo e no máximo dois elementos grandes por tela**; Anton só em hero e selos de uma frase (NN/g ×2, lambe).
4. **Anotar sobre o dado em vez de embalar em card**: o número é o elemento maior, o rótulo o segundo, a fonte o terceiro; contêiner só quando o espaço não resolve (NN/g, SWD).
5. **Uma cor de ênfase (sol) por gráfico**; o resto em oliva/creme. Sol fica reservado a presença/atividade e ênfase editorial — nunca a um candidato (SWD, Datawrapper partycolors).
6. **Escalas de mapa derivadas dos tokens em OKLCH**: divergente céu ↔ creme ↔ ocre (derivado escuro de sol), centro mais claro e extremos mais escuros; sequencial creme → céu escuro para abstenção; sem vermelho/azul partidário (Observable, Datawrapper ×2, regra de cartografia).
7. **Coroplético só para taxas (p.p., %)**; totais por símbolo proporcional (local de votação) (FT, Datawrapper, LabCidade). Pintar por vencedor é o anti-padrão que a narrativa denuncia (Berlim, Congresso em Foco, Gazeta).
8. **Legenda com classes, valores redondos, classe "empate técnico" explícita e unidade**, ≤ 5 classes, bordas finas entre áreas para cumprir 3:1 (Datawrapper, WCAG 1.4.11).
9. **Mudança no tempo como setas/slope/lollipop com 2022 e 2026 lado a lado**, lidas em p.p.; nunca dois coropléticos sem escala comum; pequenos múltiplos com a mesma legenda (Nexo, AnyChart, Datawrapper 2021).
10. **Bairro é aproximação, sempre dito**: rótulo "aproximado", polígonos com borda, opção "pontos (locais de votação)", lista por eleitores aptos; "não existem bairros petistas ou bolsonaristas" como ética do mapa (LabCidade, La Nación, Nexo).
11. **Scroll só quando a transição carrega informação**; no celular, poucos passos, anotação fixa em vez de hover, empilhar quando `prefers-reduced-motion` ou quando a transição não acrescenta (Pudding ×2, WCAG 2.3.3).
12. **Reflow a 320 px**: comparações lado a lado empilham; alvos ≥ 44 px (já), foco nunca sob o bottom sheet (WCAG 1.4.10, 2.4.11, 2.5.8).
13. **Basemap recua quando o dado entra**: sem rótulos de rua na camada eleitoral; rótulos voltam na agenda (La Nación, Datawrapper "crop/hide").
14. **Linguagem de cartaz nas vinhetas, não nos dados**: xilo/lambe em hero, selos, botões e ilustrações SVG de duas cores; gráficos e mapas ficam limpos (Tupinambá Lambido, URCA, Datawrapper).
15. **Ficha técnica como parte do gráfico**: fonte, ano/turno, base, método de aproximação e status do snapshot no rodapé de cada peça e na página de Metodologia (Nexo, Atlas RS, Pudding "Methodology").

## Decisões que esta pesquisa sustenta

| Intervenção concreta | Seção | Princípios / referências |
|---|---|---|
| **Momento 1** vira "guia de leitura": mapa sólido de Minas numa cor + **spine/diverging bar** 48,2% · outros 8,4% · 43,3% com a escala céu–creme–ocre apresentada uma vez e reutilizada no resto | Narrativa (1) | 1, 4, 6, 12 |
| **Momento 2**: comparação **lado a lado mapa sólido × mapa por município pela margem em p.p.** com legenda divergente de 2 cores + neutro e classe "empate técnico (±2 p.p.)" na cor mais clara; anotação sobre um município apertado; frase com **quantos eleitores** (não só quantos municípios) estão na classe de empate; empilha em 320 px | Narrativa (2) | 9, 10, 15, 18, 19, 20, 13 |
| **Momento 3**: três **gridplots/isotype** separados (abstenção/aptos; brancos+nulos/comparecimento; outros/válidos), cada um com sua base no título, sem eixo comum; cor única (céu) + neutro | Narrativa (3) | 2 (empilhar), 4, 18 |
| **Momento 4**: a margem de 49.650 votos / 0,4 p.p. como **número protagonista anotado** sobre um slope 2022 (2º turno) → 2026 (1º turno) com aviso "bases diferentes, não implica transferência" | Narrativa (4) | 4, 7, 12, 19 |
| **Momento 5**: mapa com sóis (sol reservado a atividade) + selo em Anton "EU VOU" em bloco chapado; CTA como cartaz | Narrativa (5), agenda | 5 (cor), 23, 24 |
| **"Por que Minas decide"**: números protagonistas com anotação em vez de cards; rótulo de uma linha com número; mini-SVG em traço de xilo duas cores; peça adicional "votos por porte de município" | Infográfico | 7, 8, 12, 21, 24 |
| **Coroplético**: legenda sobre o mapa com classes rotuladas e unidade; ≤ 5 classes; bordas finas; hachura para `partial/demo`; inset de Minas; descrição `sr-only` do mapa; alternância "Áreas aproximadas / Pontos (locais de votação)"; tooltip abre com a margem 1º–2º | Mapa | 9, 10, 13, 5, 17 |
| **Camadas por pergunta**: "quem lidera" (categórica 2 polos + neutro), "por quanto" (p.p., divergente), "quem não veio" (abstenção, sequencial) — três controles, não uma legenda híbrida | Mapa | 3, 15 |
| **2022 × 2026**: pequenos múltiplos com legenda idêntica **ou** mapa de setas por município (direção = lado, comprimento = p.p., oliva para queda); lollipop/dumbbell por bairro na página de território | Mapa, território | 5, 14, 15, 17, 25 |
| **Bairros**: rótulo "aproximado" no título, ordenação por aptos, lista de locais de votação por bairro, nunca rotular bairro por candidato | Território | 18, 19, 25, 26 |
| **Basemap** próprio sem rótulos de rua na camada eleitoral; rótulos retornam na agenda | Mapa, agenda | 25, 10 |
| **Agenda**: lista cronológica "data em coluna estreita + título + local + selo de tipo em caixa alta colorida"; sem cards com sombra; organizador nunca exibido | Agenda | 3, 5, 22, 7 |
| **Cadastro/participar**: rótulo colado ao campo, erro colado abaixo, grupos por espaço; botão-cartaz sol/oliva; vinheta xilo na página de obrigado; foco visível ≥ 3:1 e nunca sob o sheet | Cadastro | 7, 13, 23, 24 |
| **Ficha técnica** no rodapé de cada gráfico ("Fonte: TSE; malhas IBGE; bairros aproximados por Voronoi de locais de votação; snapshot validado em …") e página Metodologia como "Ficha técnica + Notas técnicas" | Todas | 5, 15, 26, 1 |
| **Tokens de dados**: gerar `--map-fill-*` e a escala divergente em OKLCH a partir de céu/sol/creme/oliva, com **ocre escuro derivado** para o polo "sol" (o amarelo puro é claro demais para extremo), e checar deuteranopia e 3:1 entre classes adjacentes | Tokens | 11, 9, 13 |

## Registro de acesso (o que foi lido e o que falhou)

**Lidas com sucesso (conteúdo examinado):**
- https://pudding.cool/2024/07/ai/
- https://pudding.cool/
- https://pudding.cool/process/introducing-scrollama/
- https://pudding.cool/process/responsive-scrollytelling/
- https://pudding.cool/process/how-to-implement-scrollytelling
- https://www.nngroup.com/articles/principles-visual-design/
- https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- https://www.datawrapper.de/academy/what-to-consider-when-creating-choropleth-maps
- https://www.datawrapper.de/academy/customizing-your-choropleth-map
- https://www.datawrapper.de/blog/partycolors
- https://www.datawrapper.de/blog/data-visualizations-german-election-2021-with-datawrapper
- https://www.datawrapper.de/blog/weekly42-berlin-election-result-map/
- https://www.datawrapper.de/blog/arrow-maps
- https://old.observablehq.com/blog/crafting-data-colors
- https://www.storytellingwithdata.com/blog/swd-ai-design-effective-graphs-and-slides
- https://www.w3.org/WAI/WCAG22/quickref/ (duas leituras, offset 0 e 100000)
- https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary
- https://www.reuters.com/graphics/ (somente via proxy de texto r.jina.ai; lista de peças e layout)
- https://graphics.reuters.com/USA-ELECTION/RESULTS/zjpqnemxwvx/ (via proxy; só o feed de chamadas, sem gráficos)
- https://www.anychart.com/blog/2024/11/08/us-election-maps/
- https://www.nexojornal.com.br/ (via proxy)
- https://www.nexojornal.com.br/grafico/2026/10/06/lula-bolsonaro-estados-2022-2026 (via proxy + HTML bruto com metadados)
- https://www.nexojornal.com.br/grafico/2026/09/30/votacao-presidente-por-municipio-eleicoes (via proxy)
- https://www.nexojornal.com.br/serie/2026/10/05/graficos-nexo-eleicoes-2026-primeiro-turno (via proxy)
- https://periodicos.ufpb.br/index.php/tematica/article/download/68340/38280/204447 (PDF via proxy)
- https://ijnet.org/pt-br/story/com-reportagens-inteligentes-e-explicativas-jornal-brasileiro-cria-nicho-%C3%BAnico-de-not%C3%ADcias
- https://outraspalavras.net/outrasmidias/cartografias-para-disputar-o-voto/
- https://outraspalavras.net/estadoemdisputa/um-mapa-mais-real-da-votacao-no-brasil/
- https://www.congressoemfoco.com.br/area/pais/quantos-votos-lula-e-bolsonaro-receberam-em-cada-municipio/
- https://www.gazetadopovo.com.br/eleicoes/2022/mapa-do-voto-como-foi-o-desempenho-de-lula-e-bolsonaro-em-todos-os-municipios-do-pais/
- https://www.terra.com.br/noticias/brasil/politica/veja-o-mapa-dos-votos-na-disputa-presidencial-por-municipio-no-brasil,... (texto; mapa não descrito pela página — não usada como referência numerada)
- https://pindograma.com.br/
- https://www.meer.com/pt/63750-tupinamba-lambido
- https://revistas.urca.br/index.php/rcn/article/download/361/241/1251 (via proxy; a primeira tentativa direta expirou)
- https://source.opennews.org/articles/draw-your-own-election-adventure/
- https://atlassocioeconomico.rs.gov.br/inicial
- https://cidades.ibge.gov.br/brasil/mg/panorama (via proxy)
- Staging: https://minas-em-movimento-staging.luq-marqs.workers.dev/ e /territorio/mg-3106200 (via proxy; só leitura)

**Falharam (não examinadas; substituídas conforme indicado):**
- https://www.reuters.com/graphics/ direto e https://graphics.reuters.com/ direto — bloqueio de host; peças individuais (Brazil election results 2026; wildfires Bordeaux/Madrid) retornaram 401/CAPTCHA mesmo via proxy → substituído pela lista da seção via proxy + resenha AnyChart.
- https://www.ft.com/vocabulary — bloqueio de host → substituído pelo repositório GitHub do Visual Vocabulary.
- https://www.nexojornal.com.br/ e peças do Nexo via WebFetch direto — SPA, só título → lidas via proxy r.jina.ai (acima). A peça "O mapa mais detalhado do 1º turno de 2026" (https://www.nexojornal.com.br/grafico/2026/10/04/mapa-mais-detalhado-1-turno-2026) devolveu só título mesmo via proxy; sua descrição (mapa de pontos por local de votação, vermelho/azul) vem do `alt`/teaser na página da série.
- https://www.nytimes.com/interactive/... (resultados 2020; red-shift 2024) — bloqueio/403 → NYT descrito só via AnyChart.
- https://www.bloomberg.com/graphics/ — 403 → Bloomberg descrito só via AnyChart.
- https://blogs.lanacion.com.ar/projects/data/elections-2015-argentina — conexão recusada → substituído pelo artigo da Source/OpenNews.
- https://www.atlasdaviolencia.org.br/ — DNS não resolveu → substituído por Atlas Socioeconômico RS + IBGE Cidades.
- https://flowingdata.com/2026/03/06/mapping-what-makes-us-happy/ — 403 (Happy Map do Pudding não examinado além do título na home).
- https://www.drclas.harvard.edu/nexo-jornal — 403.
- https://portalintercom.org.br/anais/nordeste2015/expocom/EX47-0905-1.pdf (lambe/tipografia móvel) — 403; a ligação lambe ↔ tipografia móvel ↔ xilogravura ficou apoiada só nos trechos de resultados de busca (UNESP, USP, Anhembi Morumbi, UFSM) e não foi lida na íntegra.
- https://www.anychart.com/blog/tag/dot-map — abriu, mas só o teaser; a versão completa do post foi lida na URL canônica.

**Limitações gerais.** Nenhuma página foi vista renderizada; cores, tipografia e layout são descritos a partir de texto, rótulos de legenda, `alt`, nomes de arquivo e notas das próprias páginas. Onde a fonte não declara, está escrito "não declarado". Nenhum arquivo além deste foi criado ou alterado no repositório.
