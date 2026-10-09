# ELECTORAL_EXPORT_REPORT — spike, exportação e snapshot (rodada 1)

**Data:** 2026-10-08/09 (America/Sao_Paulo) · **Origem:** alias `electoral-source-readonly` (ver `DATA_SOURCE_AUDIT.md`) · **Executor:** Fable (sessão principal), com autorização do proprietário para leitura via CLI autenticado.

**Resultado em uma linha:** `INTEGRADOS: Minas Gerais completa (853 municípios, 6.077 bairros aproximados), eleição 2026 1º turno, histórico 2022 para 2 candidaturas` — snapshot `mg-2026r1-20261008`, status `validated`, 903 arquivos, 68,7 MB, 0 erros de validação, 1 advertência.

## 1. Plano de extração

- Acesso: Management API via `supabase db query --linked --workdir ~/.minas-em-movimento/source-readonly` (fora do repo). Role `postgres`; guard = `BEGIN READ ONLY; SET LOCAL statement_timeout; SET LOCAL lock_timeout = '1s'; … COMMIT;` (verificado: DDL falha com 25006).
- Extrator: `scripts/import-electoral/export.ts` — recusa SQL que não seja `SELECT`/`WITH`, múltiplos statements ou palavras de escrita; verifica `transaction_read_only = on` e 6 tabelas eleitorais; recusa se o workdir for o repositório ou se o ref coincidir com o TARGET; pausa 400 ms entre consultas; sem paralelismo; `--max-rows` (5 M); timeouts 45–60 s.
- Consultas: `municipios` (MG) → `locais` (MG) → `totais_local` × 5 cargos → `candidaturas` (MG) → votos por candidatura × local em lotes keyset de 40 candidaturas (majoritárias em lote único) → `historico_votos` (2022, níveis município e bairro).
- Saída privada: `data/private/extract/<release>/` (gitignored) + `extract-manifest.json` (linhas, bytes, ms, SHA-256 por arquivo, saúde antes/depois).

## 2. Spike — Mariana (IBGE 3140001)

| Item | Valor |
|---|---|
| Escolha | 40 locais, 32 bairros, 160 seções (município médio, muitos bairros) |
| Consultas | 56 (dimensões + 5 totais + 47 lotes de votos + histórico) |
| Linhas | 9.752 |
| Tempo total de consultas (parede, inclui overhead do CLI ~2,4 s/consulta) | 152,7 s; máximo por consulta 6,1 s |
| Saúde do SOURCE antes → depois | conexões 9 → 8; ativas 1 → 1; 482 MB |
| Validação (manual, Python) | sem votos negativos; `aptos` e `comparecimento` idênticos entre cargos; Senador com 2 votos/eleitor; divergências Σcandidaturas−válidos de 5 a 107 votos por cargo (≤ 0,32 %) |
| Candidaturas rastreadas no município | 2026 vs 2022 município: Dep. Federal 1.186 vs 1.140; Dep. Estadual 434 vs 228; 31 linhas de bairro 2022 cada |

Snapshot do spike (`--out` temporário): 34 territórios, 51 arquivos, 0,6 MB, status `partial`, 0 erros.

## 3. Decisão GO/NO-GO

**GO.** Banco pequeno (482 MB), índices adequados, nenhuma consulta acima de 6,1 s, sem impacto nas conexões. Exportação completa executada em seguida.

## 4. Exportação completa — Minas Gerais

| Item | Valor |
|---|---|
| Release | `mg-2026r1-20261008` |
| Consultas | 56 sequenciais |
| Linhas extraídas | 2.023.422 (votos: 1.946.904 pares candidatura×local; totais: 50.365; locais: 10.073; histórico 2022: 13.450; candidaturas: 1.777; municípios: 853) |
| Bytes privados | 113 MB (JSON) |
| Tempo de consultas (parede) | 183,7 s; máximo por consulta 5,5 s |
| Saúde antes → depois | conexões 8 → 8; ativas 1 → 1 |
| Erros/timeouts | 0 |

## 5. Construção do snapshot público

`scripts/import-electoral/build-snapshot.ts` agregou por estado, município (`mg-<ibge7>`) e bairro (`mg-<ibge7>-<slug>`):

| Item | Valor |
|---|---|
| Territórios | 6.931 (1 estado, 853 municípios, 6.077 bairros) |
| Arquivos | 903 (índice 2,1 MB; 854 arquivos de métricas, mediana 45 KB, maior 2,2 MB = Belo Horizonte; 46 camadas de mapa ≤ 17 KB; candidatos 274 KB; metodologia) |
| Registros de resultado | ver `manifest.records_count` |
| Conteúdo | totais (aptos, comparecimento, abstenção, válidos, brancos, nulos) por território; todas as candidaturas majoritárias; top 10 proporcionais por território + rastreadas; comparação 2022→2026 para 2 candidaturas |
| Status | `validated` |
| Validação (`npm run data:validate`) | 903/903 arquivos com SHA-256 e contratos conferidos; 0 erros; 1 advertência |

### Verificações cruzadas e divergências (não corrigidas)

- **Totais de MG (Presidente):** aptos 16.372.372; comparecimento 12.637.274; abstenção 3.735.098 (22,81 %); válidos 11.976.235; brancos 268.302; nulos 392.176 → válidos+brancos+nulos = 12.636.713 vs comparecimento 12.637.274 (diferença 561, 0,004 %).
- **Dep. Federal (MG):** Σ candidaturas 11.474.265 vs válidos 11.380.151 → diferença **94.114 (0,75 %)**, idêntica à diferença entre válidos+brancos+nulos (12.533.053) e comparecimento (12.627.167). Interpretação: a fonte exclui dos válidos os votos de candidaturas anuladas sub judice. Registrado como `warnings` no estado e nos territórios afetados; 1 bairro (Capoeirão, IBGE 3121605) tem candidatura com 99 votos acima de 77 válidos.
- **Grafias de bairro unificadas pela normalização:** 2 casos (acentos), listados em `manifest.warnings`.
- **183 locais com coordenada aproximada** (excluídos do centroide do bairro; contados nos totais).
- **Comparação 2022→2026 (estado):** Dep. Federal rastreada 208.332 → 229.535 votos (+0,16 pp dos válidos); Dep. Estadual rastreada 51.304 → 104.524 (+0,47 pp). Resultados públicos TSE; a nota de metodologia esclarece que não indicam transferência de votos.
- **Amostragem de 10 municípios:** NÃO EXECUTADA formalmente nesta rodada (apenas Mariana validada manualmente + validador automático em 6.931 territórios). Pendência P-DATA-1.

## 5.1 Ressalva sobre o mecanismo do CLI (QA-1 F06)

Cada `supabase db query --linked` provisiona, via Management API, um **role de login temporário gerido pela plataforma** no projeto consultado antes de conectar pelo pooler como `postgres` (detalhes em `DATA_SOURCE_AUDIT.md` §7). Não houve alteração de schema, dados, políticas ou configuração, mas é preciso registrar que a leitura não foi feita com um usuário `SELECT`-only. Próximo passo: usuário somente leitura + `ELECTORAL_SOURCE_DATABASE_URL`.

## 6. Privacidade e isolamento

- Nenhum arquivo publicado contém e-mail, telefone, CPF, ID de usuário, token, connection string, ref ou URL do SOURCE (`build-snapshot` recusa escrever; `data:validate` e `check:isolation` reverificam).
- Nomes de candidaturas (`nm_urna`), partidos e números são dados públicos de candidatura (TSE).
- `data/private/` permanece fora do Git e fora de `public/`.
- O frontend e o Worker não têm qualquer caminho para o SOURCE; o Worker responde 404 em `/territories/:id/metrics` indicando o snapshot estático.

## 7. Reprodução

`docs/IMPORT_GUIDE.md`. Comandos executados nesta rodada:

```
npm run etl:export -- --dry-run
npm run etl:export -- --municipality 3140001 --release spike-mariana
npm run etl:export -- --all-mg --release mg-2026r1-20261008
npm run etl:build -- --extract data/private/extract/mg-2026r1-20261008
npm run data:validate
```

## 8. Próximos passos de dados

1. Amostragem manual de 10 municípios contra totais oficiais do TSE (P-DATA-1).
2. 2º turno 2026 após 25/10: repetir extração com `round` 2 quando o SOURCE for atualizado (o pipeline precisa de um parâmetro de eleição; hoje assume 1º turno).
3. Criar usuário `SELECT`-only no SOURCE e migrar o extrator para `ELECTORAL_SOURCE_DATABASE_URL`.
4. Avaliar mover `public/data` (69 MB) para R2 com cache; hoje está em Static Assets/Git.

## 9. Rodada 2 (DATA-2)

Esta seção acrescenta resultados; as seções anteriores não foram reescritas. Nenhuma consulta foi feita ao SOURCE (apenas o `--dry-run`, sonda de leitura: `read_only=on`, 6 tabelas); trabalhou-se com o extrato privado `mg-2026r1-20261008` e o snapshot publicado.

### 9.1 Amostragem contra o TSE (P-DATA-1) — executada

Detalhes e tabela completa em `docs/TSE_SAMPLE_REPORT.md` (`scripts/tse/sample-check.ts`). Fonte: Dados Abertos do TSE ("Resultados - 2026"; arquivos `detalhe_votacao_munzona_2026.zip` e `votacao_candidato_munzona_2026.zip`, gerados pelo TSE em 08/10/2026). A API `resultados.tse.jus.br/oficial/ele2026/...` respondeu 404 e não foi usada.

- 10 municípios: Belo Horizonte, Mariana, Contagem, Juiz de Fora, Uberlândia, Montes Claros, Poços de Caldas, Teófilo Otoni, Governador Valadares, Serra da Saudade (menor do estado). 339 indicadores comparados: **312 idênticos, 27 divergentes**.
- **Aptos, comparecimento, abstenção, brancos e válidos (5 cargos): 90 comparações, 0 divergências.** Conferência adicional no nível estado (todos os 853 municípios): aptos 16.372.372, comparecimento 12.637.274, abstenção 3.735.098, válidos 11.976.235, brancos 268.302 e válidos de Governador/Senador/Dep. Federal/Dep. Estadual — todos idênticos ao TSE.
- **Divergência 1 — Presidente "Nº 28" (sem nome/partido na fonte), 561 votos em MG.** O TSE contabiliza esses votos como **nulos técnicos** (`QT_VOTOS_NULOS_TECNICOS` = 561 em MG; em cada município da amostra a diferença nos nulos é exatamente igual aos votos de "Nº 28"). Efeitos no snapshot: (a) `null_votes` de Presidente fica 561 abaixo do oficial no estado (392.176 vs 392.737) — era a diferença de 561 entre comparecimento e válidos+brancos+nulos registrada na §5; (b) o candidato anônimo "Nº 28" aparece como candidatura (e camada de mapa) para Presidente. **Não corrigido** (regra: divergências mantidas e sinalizadas); correção sugerida na §9.4.
- **Divergência 2 — Governador 29 (Henrique Áreas, PCO): votos "Anulado sub judice" no TSE** (QT_VOTOS_NOMINAIS_VALIDOS = 0). O snapshot soma esses votos à candidatura (ex.: 238 em BH) enquanto os válidos do cargo coincidem com o oficial; portanto `share_of_valid` dessa candidatura está inflada e a soma de candidaturas supera os válidos (mesmo fenômeno já descrito para Dep. Federal na §5). Mantido e sinalizado.
- Nenhuma divergência ficou sem explicação nos campos do TSE. Ressalva: o arquivo do TSE foi gerado em 08/10 (16:32/19:31) e o extrato do SOURCE em 09/10 01:25 UTC; sub judice pode mudar após julgamentos, então a comparação vale para esse instante.

### 9.2 Parametrização por eleição/turno (P-DATA-3) — implementada

`--year`, `--round`, `--election-codes` em `export.ts` (`args.ts`); o SQL filtra `candidaturas.cd_eleicao`; `extract-manifest.json` ganha `year`, `round`, `election_codes`; `build-snapshot.ts` lê ano/turno do manifesto do extrato (legado = 2026 r1), nomeia camadas/`rounds`/metodologia e grava `<release>/release-manifest.json` (+ `--no-activate`). Hipótese e limitação (totais sem coluna de turno em `totais_local`) em `docs/IMPORT_GUIDE.md` §7. **Não validado contra o SOURCE**: não há 2º turno nele nem se pode consultá-lo nesta rodada.

Validação: snapshot de teste regenerado do extrato existente em `data/private/snapshot-test/` (com `PIPELINE_COMMIT=b42c921`) — 903 arquivos, **todos os SHA-256 e tamanhos idênticos** aos de `public/data/manifest.json`; o único campo diferente do manifesto é `generated_at`. (Sem `PIPELINE_COMMIT` e fora de um repositório git o campo seria `unknown`.) Ensaio com extrato clonado marcado como `round: 2`: camadas `2026-r2-*`, `rounds: [2]` e notas "2º turno" corretas (apenas teste de nomeação; os dados eram os do 1º turno e o ensaio foi descartado).

### 9.3 Novas validações (`npm run data:validate`, F17 e testes)

`validate-snapshot.ts` agora confere: Σ municípios = estado e Σ bairros = município (tolerância 0; aptos/comparecimento/abstenção/válidos/brancos/nulos de Presidente, válidos por cargo e votos por candidatura dos cargos majoritários — comparecimento por cargo e candidaturas proporcionais truncadas ao top-N não estão no contrato, logo não somáveis), `share_of_valid` ∈ [0,1] e = votos/válidos, `delta_pp` (±0,0051) e `delta_votes` coerentes com os votos armazenados, e ausência de `territory_id` órfão (índice ↔ métricas ↔ pais ↔ camadas).

Resultado contra `public/data`: `validate: release=mg-2026r1-20261008 status=validated files=903 checked=903 territories=6931 crosschecks=854 warnings=1 errors=0` (a advertência é a sub judice de Capoeirão). Verificação de que o validador reprova: cópia adulterada (eligible+1, share 1,2, delta_pp+1, chave de camada inexistente) → 39 erros.

F17: com `ELECTORAL_SOURCE_DATABASE_URL` o extrator usa o driver `postgres` em-processo (`BEGIN READ ONLY`, timeouts locais), sem segredo em argv; guards reforçados (`INTO`, `set_config`, `pg_sleep`, `dblink`, comentários). 38 testes unitários (`scripts/import-electoral/*.test.ts`) passam. **Caminho do driver não exercitado contra um banco real** (só funções puras são testadas).

### 9.4 Pendências / mudanças desejadas

1. Decidir tratamento do "Nº 28" (Presidente): reclassificar como nulos técnicos no build (e remover da lista de candidaturas) **ou** manter e documentar na metodologia; requer decisão do proprietário.
2. Sub judice por candidatura: expor um indicador (ex.: `votes_annulled`) ou excluir os votos anulados da candidatura; requer mudança em `CandidateResult`.
3. Contrato: `SnapshotManifest.releases[]` (para 1º e 2º turno no mesmo ponteiro) e `ComparisonPoint.votes_2026/valid_2026` → nomes neutros (`votes_current`) quando o 2º turno existir.
4. `ELECTORAL_SOURCE_DATABASE_URL` com role `SELECT`-only continua dependendo do proprietário.

## 10. Rodada 3: 2022 do TSE, comparação presidencial, highlights, POIs

Esta seção acrescenta resultados; as anteriores não foram reescritas. **Nenhuma consulta ao SOURCE** nesta rodada: trabalhou-se com o extrato privado `mg-2026r1-20261008` e com dados abertos do TSE e do OpenStreetMap baixados para `data/private/` (gitignored).

Decisões do proprietário aplicadas: (1) as candidaturas rastreadas deixam de ser destacadas — `comparison_2022 = []`, `has_history = false` em todas as candidaturas, camadas `comparison-<id>` não são mais geradas (e, como `has_layer` dependia de `has_history` para Dep. Federal/Estadual, as camadas `votes-100641` e `votes-101626` também deixaram de existir); `historico-2022.json` do extrato não é mais lido e `historico_votos` saiu de `source_tables`; (2) a comparação 2022 → 2026 passa a ser presidencial: Lula (PT, 13) e Jair Bolsonaro (PL, 22) em 2022 frente a Lula (PT, 13) e Flávio Bolsonaro (PL, 22) em 2026 — confirmados no `candidaturas.json` (ids 100001 `LULA`/PT e 100005 `FLAVIO BOLSONARO`/PL; o build aborta se número, nome ou partido não baterem); (3) `highlights.json` com números-chave calculados.

### 10.1 Fontes do TSE (2022 e contexto 2026) — `npm run tse:2022`

`scripts/tse/fetch-2022.ts` lê por HTTP Range (módulo compartilhado `scripts/tse/zip-range.ts`, agora também usado por `sample-check.ts`; CRC-32 verificado; ZIP64 suportado) e grava caches filtrados em `data/private/tse/2022/` e `data/private/tse/2026/`.

| Arquivo (cdn.tse.jus.br/estatistica/sead/odsele/…) | Entrada(s) | Last-Modified (HTTP) | Geração TSE |
|---|---|---|---|
| `votacao_candidato_munzona/votacao_candidato_munzona_2022.zip` (580.941.971 bytes) | `_BR` (Presidente); `_MG` lida só para confirmar: 0 linhas de Presidente | Fri, 09 Oct 2026 07:18:46 GMT | 09/10/2026 03:16:47 |
| `detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip` | `_BR` (Presidente); `_MG` (0 linhas de Presidente) | Thu, 08 Oct 2026 06:52:59 GMT ¹ | 08/10/2026 03:17:17 |
| `votacao_secao/votacao_secao_2022_BR.zip` (271.292.455 bytes; CSV de 1,59 GB) | `_BR.csv`, filtrado `SG_UF = MG`, `CD_CARGO = 1` | Thu, 24 Nov 2022 14:26:58 GMT | 01/11/2022 16:05:25 |
| `eleitorado_locais_votacao/eleitorado_local_votacao_2022.zip` | filtrado MG, turno 1 | Thu, 10 Sep 2026 18:22:35 GMT | 30/09/2024 02:00:32 |
| `detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip` | `_BR` (aptos por UF, Presidente, 1º turno) | Fri, 09 Oct 2026 08:46:09 GMT | 09/10/2026 05:32:15 |

¹ Um `HEAD` feito minutos antes respondeu `Last-Modified: Fri, 09 Oct 2026 07:05:48 GMT` para o mesmo arquivo: nós diferentes da CDN servem versões diferentes. O valor registrado é o da resposta efetivamente lida.

**Desvio do pedido:** `votacao_secao_2022_MG.zip` (295 MB, Last-Modified Mon, 22 Jun 2026 14:44:47 GMT) foi baixado e lido inteiro (6.285.638 linhas) e **não contém Presidente** (só cargos estaduais, `CD_ELEICAO 546`). Os votos de Presidente por seção estão em `votacao_secao_2022_BR.zip`, usado no lugar.

Totais lidos (Presidente; `QT_VOTOS_NOMINAIS_VALIDOS` para candidaturas, `QT_TOTAL_VOTOS_VALIDOS` para válidos; 0 linhas de voto em trânsito; 0 votos nominais não válidos para 13/22):

| Recorte | Aptos | Comparecimento | Válidos | Lula | Bolsonaro |
|---|---:|---:|---:|---:|---:|
| MG 2022 1º turno | 16.283.828 | 12.655.228 | 12.016.633 | 5.802.571 (48,29 %) | 5.239.264 (43,60 %) |
| MG 2022 2º turno | 16.284.615 | 12.866.284 | 12.332.270 | 6.190.960 (50,20 %) | 6.141.310 (49,80 %) |
| Brasil 2022 1º turno | 156.454.011 | 123.682.372 | 118.229.719 | 57.259.504 (48,43 %) | 51.072.345 (43,20 %) |
| Brasil 2022 2º turno | 156.454.011 | 124.252.796 | 118.552.353 | 60.345.999 (50,90 %) | 58.206.354 (49,10 %) |

MG 2022: abstenção 3.628.600 (1º) / 3.418.331 (2º); brancos 229.425 / 183.206; nulos 409.170 / 350.808. Contexto 2026: eleitorado apto nacional 158.745.502 (inclui 916.534 no exterior); MG 16.372.372 (= snapshot; o build aborta se divergir), 2ª maior UF depois de SP (34.122.892).

**Reconciliação seção × município:** somando os votos de seção por município, Lula, Bolsonaro e válidos coincidem com os arquivos `munzona` em **853 de 853 municípios, nos dois turnos**.

### 10.2 Bairro 2022 (aproximado) — executado

10.014 locais de votação de 2022 com votos para Presidente em MG (89 sem cadastro no `eleitorado_local`, portanto sem `NM_BAIRRO`). Associação ao bairro do snapshot (`matchLocal` em `scripts/tse/president-2022.ts`):

- (a) mesmo município + `nr_zona` + `nr_local` existente em `locais.json` → bairro desse local: **9.244 locais**. Salvaguarda acrescentada: se as duas coordenadas existem e distam mais de **1 km**, o casamento por número é rejeitado (prédio provavelmente diferente) e tenta-se (b): **310 rejeições**.
- (b) `NM_BAIRRO` 2022 normalizado com `slugify` (`shared/schemas/normalize.ts`) → `mg-<ibge>-<slug>` existente: **606 locais**.
- (c) descartados e contados: **164 locais**.
- **Taxa de casamento (votos válidos de Presidente, 1º turno 2022): 99,39 %** (73.758 votos válidos não associados). 761 municípios com 100 %, 831 com ≥ 95 %.
- **5 municípios abaixo de 80 %** → bairros com `precision: 'unavailable'` (os municípios continuam `exact`): Limeira do Oeste (0 %), Chiador (66,5 %), Santa Margarida (71,0 %), Moema (72,7 %), Iturama (76,4 %). São 20 bairros.
- Nos 6.077 bairros: 5.815 `approximate`, 242 `unavailable` por não terem nenhum local de 2022 associado, 20 `unavailable` pela regra dos 80 %. Como há locais descartados, a soma dos bairros de 2022 não reproduz o município (documentado na metodologia).

### 10.3 Snapshot — `npm run etl:build -- --extract data/private/extract/mg-2026r1-20261008`

Release **mantido como `mg-2026r1-20261008`**, reconstruído no lugar e ativado. Motivo: nenhum código depende do id, e `sample-check.ts --offline` usa o extrato de mesmo id. Antes, o release da rodada 2 foi copiado para `data/private/rollback/mg-2026r1-20261008-r2/` (com `root-manifest.json`); rollback = copiar de volta a pasta e o manifesto.

- `TerritoryMetrics.president_comparison` preenchido no estado (exact), em 853 municípios (exact) e em 6.077 bairros (ver 10.2). `delta_pp_r1 = (share_2026_r1 − share_2022_r1) × 100`, arredondado a 0,01 p.p.; `delta_votes_r1 = votos 2026 r1 − votos 2022 r1`. O 2026 r1 vem do próprio extrato (votos da candidatura ÷ válidos de Presidente do território).
- Estado: Lula 48,29 % (2022 r1) → 43,33 % (2026 r1), **−4,96 p.p.** (−613.635 votos); Jair → Flávio Bolsonaro 43,60 % → 48,24 %, **+4,64 p.p.** (+538.284 votos). Belo Horizonte: Lula −1,14 p.p., Bolsonaro +1,70 p.p.
- Camadas novas: `layers/2026-r1-president_comparison-lula.json` e `-bolsonaro.json` (`unit: 'pp'`, `candidate_id: 'lula' | 'bolsonaro'`, 853 municípios, domínios simétricos [−15,83, 15,83] e [−13,2, 13,2]). Em todos os 853 municípios o delta de Lula é negativo (máx. −0,03) e o de Bolsonaro, positivo (mín. +0,59).
- `highlights.json` (contrato `Highlights`, gerado por `scripts/tse/highlights.ts`): 20 itens e 5 frases `why_minas`, todos com `source`; percentuais em escala 0–100. Números: eleitorado MG 2026 16.372.372 = 10,31 % do eleitorado nacional com exterior (10,37 % sem), 2º de 27 UFs; 853 municípios; comparecimento 12.637.274 (77,19 %), abstenção 3.735.098 (22,81 %); 2026 r1 Lula 5.188.936 (43,33 %), Flávio Bolsonaro 5.777.548 (48,24 %), diferença −588.612 (−4,91 p.p.); margem de Lula em 2022 r1 +563.307 (+4,69 p.p.); margem de Lula em 2022 r2 **+49.650 votos (+0,40 p.p.)**; Brasil 2022 r2 50,90 % × 49,10 % (+2.139.645, +1,80 p.p.); MG teve 10,40 % dos válidos do país no 2º turno de 2022. Nenhuma afirmação histórica não verificável (ex.: "quem vence em Minas vence o Brasil") foi incluída.
- Metodologia 1.1.0: `comparison_note` cita a fonte (arquivos e Last-Modified), diz que o bairro 2022 é aproximado e que Jair e Flávio Bolsonaro são pessoas diferentes, sem implicar transferência de votos; nova fonte TSE em `sources`; limitações atualizadas. Manifesto: `years: [2022, 2026]`, nota de cobertura com a taxa de casamento.
- Arquivos do release: 902 → **901** (904 após DATA-4, §10.5.1) (−2 `comparison-*`, −2 `votes-*` de rastreadas, +2 `president_comparison-*`, +1 `highlights.json`). Saída: `wrote 901 files (71.2 MB) … status=validated warnings=2` (grafias de bairro unificadas em Montes Claros, já existentes).

### 10.4 POIs de grande circulação — `npm run pois:fetch`

`scripts/pois/fetch-overpass.ts` → `public/data/pois/terminais-mg.json` (`PoiFile`, `© OpenStreetMap contributors`, ODbL 1.0; fora do manifesto do release, validado à parte). Uma consulta combinada (`out center tags`, timeout 180 s). A 1ª tentativa em `overpass-api.de` respondeu **504** e a 2ª (após 15 s), 200. Base OSM de 2026-10-09T16:42:27Z; cache bruto em `data/private/overpass/terminais-mg-raw.json`.

- 532 elementos; 129 descartados sem `name`; 23 removidos por proximidade (< 60 m dentro da mesma família; ônibus e metrô não se fundem, para não esconder uma estação de metrô ao lado de um terminal); **380 publicados**.
- Por categoria: `bus_terminal` 354, `metro_station` 22, `bus_station` 4. Em MG quase todo `public_transport=station` também tem `amenity=bus_station`, o que pela regra pedida o classificaria como terminal. **Ajuste:** `network` contendo MOVE/BRT → `bus_station` (só 4 objetos têm essa tag). Muitas estações MOVE de BH estão no OSM sem `network` e aparecem como `bus_terminal`.
- Município por ponto-em-polígono (ray casting, `scripts/pois/geo.ts`) com `public/geo/mg-municipios.geojson`: 380 de 380 (o fallback por centroide não foi usado).
- Top 10 municípios: Belo Horizonte 97, Uberlândia 10, Poços de Caldas 5, Uberaba 5, Juiz de Fora 4, Contagem 4, Muriaé 4, São João del-Rei 3, Governador Valadares 3, Abadia dos Dourados 2.

### 10.5 Validação e testes

- `npm run data:validate` → `release=mg-2026r1-20261008 status=validated files=901 checked=901 territories=6931 crosschecks=855 warnings=1 errors=0`; `president_comparison=6931 {"exact":854,"approximate":5815,"unavailable":262} pois=380`. Novas checagens: shares em [0,1] e = votos/válidos; `delta_pp_r1` (±0,0051) e `delta_votes_r1` coerentes; precisão por nível (estado/município não `approximate`, bairro não `exact`, `unavailable` sem 2022); 2026 = `results.president` e `valid_by_office.president`; Σ municípios 2022 = estado; camadas `president_comparison` = delta do município, domínio simétrico, `unit: 'pp'`; `highlights.json` (schema, `source` não vazio, ids únicos); POIs (schema, bbox de MG, ids únicos, `osm_url`, atribuição/licença, município no índice).
- Teste de reprovação: cópia adulterada (delta +1, share 1,2, votos 2022 +5 e precisão `approximate` em BH, `source` vazio, domínio assimétrico, POI fora de MG) → 854 erros.
- `npx tsx scripts/tse/sample-check.ts --offline` (após a refatoração para o módulo compartilhado) → 330 indicadores, 18 divergentes, **312 idênticos** (inalterado).
- `npx vitest run scripts/` → 4 arquivos, **56 testes passando** (18 novos em `scripts/tse/president-2022.test.ts` e `scripts/pois/geo.test.ts`).

### 10.5.1 DATA-4: margem presidencial por município e "nem um nem outro"

- Camadas novas (`layer: 'president_margin'`, `unit: 'pp'`, `candidate_id: null`, 853 municípios, domínio simétrico): valor = (votos Lula − votos Bolsonaro) ÷ válidos × 100, arredondado a 0,01 p.p. (positivo = Lula à frente).
  - `layers/2026-r1-president_margin.json`: Lula liderou em **452** municípios (52,99 %), Flávio Bolsonaro em **401** (47,01 %), 0 empates; extremos Monte Sião −54,89 e Guaraciama +59,79; domínio ±59,79.
  - `layers/2022-r1-president_margin.json`: Lula 630, Bolsonaro 223; extremos Monte Sião −47,05 e Presidente Kubitschek +70,18.
  - `layers/2022-r2-president_margin.json`: Lula **564** (66,12 %), Bolsonaro **289** (33,88 %); extremos Monte Sião −52,94 e Presidente Kubitschek +69,07.
- `highlights.json`: 20 → 30 itens, todos com `source`. 2026 r1 MG: outras candidaturas 1.009.751 votos (8,43 % dos válidos); brancos + nulos 661.039 (5,23 % do comparecimento; nulos = comparecimento − válidos − brancos = 392.737, igual ao TSE, incluindo os 561 nulos técnicos); abstenção 3.735.098 (22,81 % dos aptos); **não votaram em nenhum dos dois: 5.405.888 (33,02 % dos aptos)** = abstenção + brancos + nulos + outras (o build confere que = aptos − Lula − Flávio). 2022 r2 MG: brancos + nulos 534.014 (4,15 % do comparecimento), abstenção 3.418.331 (20,99 % dos aptos). As `note` dizem que são somas de grupos distintos e não indicam preferência.
- Validador: camadas `president_margin` conferidas contra os votos de `president_comparison` de cada município (±0,0051), 853 valores, domínio simétrico, `candidate_id` nulo (adulteração → 3 erros específicos + hash). Release com **904 arquivos**; `data:validate` → `errors=0`; testes de scripts 57/57; `sample-check --offline` 312/330 idênticos.

### 10.6 Pendências / mudanças desejadas (contratos não editados)

1. `HighlightItem.unit` não distingue "posição" (ranking); foi usado `count`. Sugestão: `'rank'`, e explicitar no contrato que `percent` é 0–100.
2. `PresidentialComparison` poderia levar `match_rate` (taxa do município) e `places_2022`, para o painel exibir a qualidade da aproximação sem parsear `note`.
3. As camadas `president_comparison` têm domínio simétrico; o frontend precisa de escala divergente (no nível municipal, os valores de Lula são todos negativos e os de Bolsonaro, todos positivos).
4. `PoiFile` não tem campo para a data da base OSM; hoje ela vai em `source`.
5. Frontend que ainda leia `comparison-<id>`, `votes-100641|101626` ou `has_history` precisa ser ajustado (não verificado nesta rodada).
