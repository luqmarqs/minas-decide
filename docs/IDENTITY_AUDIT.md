# IDENTITY_AUDIT — arte oficial "MINAS DECIDE" (spec §13.2)

**Data:** 2026-10-09 · **Executor:** Fable · **Status:** auditoria concluída; **adaptação NÃO aplicada** até aceite do proprietário (item 10). A arte original fica em `brand/raw/` (gitignored); derivados web em `public/brand/` (gitignored até o aceite, pois o repositório é público).

## 1. Inventário de arquivos e uso

| Arquivo | Dimensões | Formato | Conteúdo | Licença/uso conhecido |
|---|---|---|---|---|
| `MG DECIDE LULA-1.png` | 1920 × 1080 (16:9) | PNG RGBA 8 bits, 3,6 MB | chave visual horizontal: céu azul texturizado, sol amarelo de raios ondulados nascendo atrás da serra ocre, morros verde-oliva, skyline ilustrado de Belo Horizonte, lockup "MINAS / DECIDE" | fornecido pelo proprietário em ZIP "MG DECIDE LULA"; **uso autorizado para este projeto presumido; direitos do ilustrador/tipógrafo e fontes não informados** — confirmar antes de produção |
| `MG DECIDE LULA-2.png` | 1080 × 1350 (4:5) | PNG RGBA 8 bits, 2,8 MB | mesma chave visual em formato retrato (redes sociais), skyline mais presente | idem |

Não há: vetor (SVG/AI), arquivo de fontes, logotipo isolado, manual de marca, versões monocromáticas, favicon. O nome do produto no código ("Minas em Movimento", provisório) **difere do nome da arte ("Minas Decide")** — e o repositório já se chama `minas-decide`. Ver decisão pedida no item 10.

## 2. Paleta medida (média por região, Chromium/canvas) e contraste WCAG

| Papel semântico proposto | Medido | HEX | Observação |
|---|---|---|---|
| Céu / ação principal | média do topo | **#067fa8** | azul-cerâmica com grão; variante profunda `#06688a` |
| Sol / destaque | pixels amarelos | **#e8ba1f** (retrato: #d7ac1e) | amarelo-ouro; `#c99a12` para bordas |
| Creme / superfície e tipografia sobre fundo escuro | pixels claros | **#ebd6ca** | creme rosado; clarear para superfície de página: `#f6ece4` |
| Ocre / serra | faixa da serra | **#7f5c34** | terroso; profundo `#5e4325` |
| Verde-oliva escuro / morros | base | **#262824** (retrato: #1e1f1c) | quase preto esverdeado — superfície escura ideal |
| Tinta | pixels mais escuros | **#202020** | contornos e texto |
| Terracota (telhados) | amostra | **#906850** | acento secundário discreto |

Contrastes (razão WCAG, meta texto ≥ 4,5:1; UI/texto grande ≥ 3:1):

| Par | Razão | Veredito |
|---|---|---|
| tinta #202020 sobre creme #ebd6ca / #f6ece4 | 11,6 / 14,0 | AA |
| creme sobre oliva #262824 | 10,6 | AA (tema escuro natural) |
| sol #e8ba1f sobre oliva / tinta | 8,1 / 8,9 | AA (destaque no tema escuro) |
| tinta sobre sol | 8,9 | AA (botão amarelo com texto escuro) |
| **branco sobre céu #067fa8** | 4,56 | AA (botão azul com texto branco: OK) |
| creme #ebd6ca sobre céu #067fa8 | 3,26 | só texto grande/UI — **não usar para texto corrido** |
| céu #067fa8 sobre creme | 3,26 | só UI/ícones/bordas; links em texto precisam de `#06688a` (4,47) ou mais escuro |
| ocre #7f5c34 sobre creme | 4,31 | quase AA; usar `#5e4325` (6,5) para texto |
| sol-escuro #c99a12 sobre creme | 1,85 | **falha** — amarelo nunca como texto em fundo claro |

Conclusão: a paleta funciona em **dois modos**: claro (creme + tinta, azul como ação com texto branco, amarelo só como superfície de destaque com texto escuro) e escuro (oliva + creme, amarelo como destaque). O par creme/azul exige cuidado: só em títulos grandes ou com azul escurecido.

## 3. Tipografia

- **"MINAS":** display condensada, pesada, cantos levemente arredondados, caixa alta, cheia em creme. Alternativas web com licença aberta: **Anton** (mais próxima), Bebas Neue, Archivo Black. 
- **"DECIDE":** display geométrica arredondada **em contorno** (outline), caixa alta, com contraformas fechadas (o "e" com barra). Alternativas abertas: **Bungee Outline** (muito próxima em espírito), Londrina Outline, Chango (cheia) + `-webkit-text-stroke` para o contorno.
- **Corpo:** a arte não define. Manter **Inter** (corpo) e trocar a display provisória (Fraunces, serifada) por Anton/Bungee apenas em títulos de hero e selos; manter serifada fora.
- **Nunca** redistribuir a fonte original da arte (desconhecida/não fornecida). Carregar Google Fonts via `@font-face` self-hosted com licença OFL registrada em `public/fonts/LICENSE`.

## 4. Logotipo, símbolos, proporções

- Não há logotipo isolado. O lockup "MINAS / DECIDE" + sol funciona como **marca**; o **sol de raios ondulados** é o símbolo mais reaproveitável (favicon, marcador de atividade, loader).
- Proposta: recortar o sol como SVG (vetorizar manualmente, 11 raios ondulados, amarelo #e8ba1f) com zona de respiro de 1 raio; lockup horizontal (sol + "MINAS DECIDE" em Anton/Bungee) para o header em 56 px de altura; versão mono (tinta e creme) para fundos fotográficos.
- Recorte provisório do sol (bitmap, com céu): `public/brand/minas-decide-sun-crop.png` — só para protótipo.

## 5. Padrões gráficos, textura, ilustração

- **Grão/serigrafia**: todas as áreas têm ruído visível; reproduzir com `background-image` de ruído SVG a 4–6 % de opacidade apenas em hero e divisórias (nunca em formulários nem no mapa).
- **Linha do horizonte da serra**: silhueta irregular — usável como **divisória** entre hero e conteúdo (SVG path, cor ocre sobre creme).
- **Skyline ilustrado**: só em hero/rodapé, nunca atrás de texto pequeno.
- Fotografia: nenhuma; a identidade é ilustrada. Manter o mapa real (basemap) sem texturas.

## 6. Tom visual/editorial e adequação a UI de dados

Tom: popular, solar, regional, otimista, com estética de cartaz serigrafado. Adequação: **boa para hero, selos, CTAs e marcadores; ruim para tabelas e legendas** se aplicada literalmente (texturas e amarelo reduzem legibilidade). Regra: expressivo nas bordas, neutro no miolo de dados (spec §13.3).

## 7. Componentes impactados e plano por tokens

Mapeamento proposto (`src/styles/tokens.css`, variante `:root[data-brand="minas-decide"]`, mantendo os nomes semânticos):

| Token | Hoje (provisório) | Proposto (claro) | Proposto (escuro) |
|---|---|---|---|
| `--color-surface` | #f6f3ee | **#f6ece4** (creme claro) | **#1e1f1c** (oliva) |
| `--color-surface-alt` | #ece7de | #ebd6ca | #262824 |
| `--color-text-primary` | #1b1a16 | #202020 | #ebd6ca |
| `--color-action-primary` | #1f4e3d (verde) | **#067fa8** (céu) com texto branco | #e8ba1f (sol) com texto #202020 |
| `--color-action-hover` | #173d30 | #06688a | #d7ac1e |
| `--color-accent` | #c2771a | **#e8ba1f** (sol; só superfícies, nunca texto em claro) | #e8ba1f |
| `--color-focus` | #c2771a | #06688a (anel 3 px; 4,47:1 sobre creme) | #e8ba1f |
| `--color-border-strong` | #857d6c | #7f5c34 (ocre) | #5e4325 |
| `--font-display` | Fraunces | **Anton** (títulos de hero/selos) + `.brand-outline` com Bungee Outline | idem |
| `--map-fill-*` | verdes | **manter** (escala estatística neutra; spec §13.3 proíbe cores políticas em dados); trocar só `--map-selected` para #e8ba1f e `--map-activity` para #06688a | idem |
| `--color-demo` | roxo | manter | manter |

Componentes afetados: AppHeader (lockup), HomePage hero (chave visual + horizonte), Button (azul/amarelo), Badge/selos (sol), ActivityMarker (sol), MapLegend (apenas seleção), favicon. Formulários, painel de território, tabelas e admin: só herdam tokens, sem textura.

## 8. Mapas, legendas, categorias de atividade, acessibilidade

- Mapa: basemap claro `positron`/escuro `dark` mantidos; contorno selecionado em amarelo-sol (3:1 sobre o basemap claro verificado visualmente no protótipo); marcador de atividade = sol pequeno (SVG) com halo.
- Legendas estatísticas continuam na escala sequencial verde-neutra; o amarelo e o azul **não** entram em escalas de dados (evita leitura partidária de abstenção/votos).
- Categorias de atividade: ícones monocromáticos (tinta/creme), não cores da marca.
- Acessibilidade: nenhum texto amarelo em fundo claro; creme sobre azul só ≥ 24 px; foco visível azul-escuro/amarelo; textura ≤ 6 % de opacidade; reduced motion sem parallax do hero.

## 9. Protótipo antes da implementação em lote

Plano: variante de tema `data-brand="minas-decide"` ativável por query `?brand=1` (sem afetar o padrão), hero da home com a chave visual (JPG 1600/800 responsivo, `object-position` no sol), horizonte como divisória, header com lockup, botões azul/amarelo, favicon-sol; capturas desktop/mobile de home, território, participar e atividade em `docs/screenshots/brand/`. Só depois do aceite: tornar padrão e commitar `public/brand/`.

## 10. Comparação, riscos, alternativas e aceite do proprietário

Riscos: (a) nome — a arte diz **"Minas Decide"**, o app diz "Minas em Movimento"; (b) fontes originais desconhecidas (usar alternativas OFL); (c) direitos do ilustrador e do nome na arte ("LULA" no nome do arquivo) — confirmar autorização de uso público; (d) amarelo tentador como texto (proibido pelo contraste); (e) o repositório é público: ao commitar `public/brand/` a arte fica pública (o site já é público em staging).

Alternativas: A) aplicar a identidade completa (hero + cores + tipografia + sol como marca) — recomendada; B) aplicar só cores e lockup, sem hero ilustrado (mais sóbria); C) manter a identidade provisória e usar a arte só na home.

**Decisões pedidas:** 1) nome do produto na interface: "Minas Decide"? 2) alternativa A/B/C; 3) autorização para commitar os derivados da arte no repositório público; 4) confirmação de direitos de uso da arte e do nome.
