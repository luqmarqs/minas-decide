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
