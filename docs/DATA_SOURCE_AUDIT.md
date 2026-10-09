# DATA_SOURCE_AUDIT — inventário somente leitura da origem eleitoral (SOURCE)

**Data:** 2026-10-08 (America/Sao_Paulo, noite)
**Executor:** Claude Fable 5.1 (sessão principal), com autorização do proprietário para inspeção de leitura via sessão autenticada do Supabase CLI.
**Alias da origem:** `electoral-source-readonly` (projeto Supabase de nome `dashboard-eleicoes-2026`; project ref **omitido deliberadamente** deste documento).
**Status de acesso:** DISPONÍVEL — leitura via Management API (`supabase db query --linked`) a partir de um workdir isolado **fora do repositório**. A sessão roda como role `postgres`; por isso **todas** as consultas foram envolvidas em `BEGIN READ ONLY; SET LOCAL statement_timeout; … COMMIT;`. Prova do guard: um `CREATE TEMP TABLE` dentro da transação falhou com `ERROR 25006: cannot execute CREATE TABLE in a read-only transaction`.

## 1. Identificação do projeto

| Item | Valor |
|---|---|
| Projetos visíveis no CLI | 5 (três organizações). O proprietário confirmou que `dashboard-eleicoes-2026` é a origem. |
| Organização | mesma organização do novo projeto operacional (TARGET) |
| Região | us-east-2 |
| Postgres | 17.11 |
| Status | ACTIVE_HEALTHY |
| Vínculo local | `~/.minas-em-movimento/source-readonly` (fora do repo). O repositório `supabase/` está vinculado **apenas ao TARGET**. |

Nenhuma migration, DDL, escrita, `db reset`, `db push`, criação de índice, extensão, policy, view ou alteração de configuração foi executada no SOURCE. Nenhuma credencial do SOURCE existe em arquivo do repositório, `wrangler.jsonc`, `.env.example`, Worker ou frontend (`npm run check:isolation` verifica).

## 2. Saúde do banco (catálogo, medido antes e depois do spike)

| Métrica | Antes | Depois do spike |
|---|---|---|
| Tamanho do banco | 482 MB | — |
| Conexões (`pg_stat_activity`) | 9 | 9 |
| Consultas ativas | 1 | 1 |

O banco **não está saturado**: é pequeno (482 MB) e as tabelas eleitorais têm índices adequados para o recorte por município e por candidatura. A percepção de "banco pesado" provavelmente vem das tabelas `meta_*` (Meta Ads; 175 MB + 95 MB + 51 MB), **fora do escopo** deste projeto.

## 3. Schemas e tabelas

Schemas: `auth`, `extensions`, `graphql`, `graphql_public`, `public`, `realtime`, `storage`, `supabase_migrations`, `vault`. Sem views em `public`.

Tabelas em `public` por tamanho (estimativas de catálogo `pg_stat_user_tables`):

| Tabela | Total | Linhas est. | Relevância |
|---|---|---|---|
| `meta_localidades` | 175 MB | 822.798 | NÃO (Meta Ads) |
| `meta_anuncios` | 95 MB | 112.667 | NÃO (Meta Ads) |
| `meta_observacoes` | 51 MB | 112.667 | NÃO |
| **`votos_cand`** | 42 MB | 5.342 | **SIM** — votos por candidatura × local (arrays paralelos) |
| `meta_cache` | 39 MB | 572 | NÃO |
| `meta_entrega_regional` | 20 MB | 144.772 | NÃO |
| **`historico_votos`** | 17 MB | 116.267 | **SIM** — 2022, níveis município/bairro/local, só candidaturas rastreadas |
| **`totais_local`** | 11 MB | 144.585 | **SIM** — aptos/comparecimento/válidos/brancos/nulos por local × cargo |
| **`locais`** | 6,8 MB | 28.917 | **SIM** — locais de votação com lat/lon, bairro textual, zona, seções |
| `meta_mencoes` | 5,6 MB | 19.627 | NÃO |
| **`candidaturas`** | 2,2 MB | 5.342 | **SIM** — candidaturas 2026 (3 UFs) |
| `apocalipse_cache`, `apocalipse_cand`, `digital_*`, `fundo_cand`, `paineis`, `visitas`, `meta_*` | pequenas | — | NÃO (análises internas, financiamento, redes, painéis de usuários) |
| `auth.users` | 296 kB | ~22 | **NUNCA exportar** |

## 4. Estrutura das tabelas eleitorais

- `municipios(cd_municipio char, cd_ibge int, nome, lat, lon, uf)` — índices por `cd_ibge` e `cd_municipio`.
- `locais(id int, cd_municipio, cd_ibge, nr_zona, nr_local, nome, endereco, bairro text NOT NULL, cep, lat, lon, coord_aproximada bool, qt_secoes, uf)` — índices `(cd_municipio, nr_zona, nr_local)`, `cd_municipio`, `id`, `uf`.
- `totais_local(local_id, cd_cargo smallint, aptos, comparecimento, validos, brancos, nulos)` — índice `(cd_cargo, local_id)`.
- `candidaturas(id, cd_eleicao, cd_cargo, ds_cargo, tipo nominal|legenda, numero, nm_urna, nm_candidato, nr_partido, sg_partido, sq_candidato, destinacao, votos_total, situacao, uf)`.
- `votos_cand(candidatura_id, locais int[], votos int[])` — arrays paralelos (local_id ↔ votos); média de 1.478 locais por candidatura; 7,9 M pares no total (3 UFs).
- `historico_votos(candidatura_id, ano, nivel municipio|bairro|local, cd_municipio, chave, votos, validos)` — índice `(candidatura_id, ano, nivel, chave)`. `chave` = `"<cd_municipio>|<BAIRRO>"` no nível bairro e `locais.id` no nível local (100% dos `chave` de nível local casam com `locais.id`).

**Não há geometrias** (polígonos) de municípios nem de bairros. Municípios têm apenas centroide (lat/lon). "Bairro" é o texto do endereço do local de votação.

## 5. Cobertura

| Dimensão | Valor |
|---|---|
| Eleição | 2026, **1º turno** (`cd_eleicao` 6257 = Presidente; 6259 = Governador/Senador/Dep. Federal/Dep. Estadual). **Sem 2º turno** (ainda não ocorrido na data da auditoria). |
| UFs | MG, RS, SP. Este projeto usa **apenas MG**. |
| MG | 853 municípios; 10.073 locais de votação; 52.062 seções; 6.079 pares município×bairro distintos; 183 locais com `coord_aproximada = true`. Mediana de 6 locais por município; máximo 446 (Belo Horizonte). |
| Cargos (MG) | Presidente (13 cand.), Governador (11), Senador (16), Dep. Federal (720 nominais + 26 legenda), Dep. Estadual (963 nominais + 28 legenda) = 1.777 candidaturas. |
| Histórico 2022 | Somente **7 candidaturas** rastreadas (2 em MG: uma candidatura a Dep. Federal e uma a Dep. Estadual), níveis município, bairro e local, com `votos` e `validos` (denominador). Cobertura municipal 2022 completa (853 municípios) para essas duas. **Não há** abstenção/comparecimento de 2022 no SOURCE. |
| Abstenção/comparecimento 2026 | Por local × cargo (`totais_local`), para os 5 cargos; `aptos` e `comparecimento` são idênticos entre cargos (mesmo eleitorado); `validos/brancos/nulos` variam por cargo. Senador tem 2 votos por eleitor em 2026. |

## 6. Consultas executadas (todas somente leitura, catálogo ou agregadas)

1. Tamanho do banco, conexões, versão (`pg_database_size`, `pg_stat_activity`).
2. Lista de schemas (`pg_namespace`).
3. Top 40 tabelas por tamanho (`pg_stat_user_tables`).
4. Colunas de 9 tabelas candidatas (`information_schema.columns`).
5. Views em `public` (`information_schema.views`) e índices (`pg_indexes`).
6. `GROUP BY` em `candidaturas` (5.342 linhas) por eleição/cargo/UF/tipo.
7. `GROUP BY` em `historico_votos` por ano/nível (17 MB, seq scan único).
8. Contagens por UF em `municipios`/`locais`.
9. Estatísticas de cardinalidade dos arrays de `votos_cand`.
10. Cobertura de `totais_local` por cargo (join com `locais`).
11. Amostra estrutural de 8 chaves de `historico_votos` (sem PII).
12. Prova do guard READ ONLY (`CREATE TEMP TABLE` falhou).
13. 7 candidaturas com histórico (dados públicos de candidatura TSE).
14. Casamento `historico_votos.chave` ↔ `locais.id`.
15. Municípios de MG com 25–40 locais (escolha do spike) e distribuição de locais por município.
16. **Spike Mariana (IBGE 3140001)**: 7 consultas, cada uma < 3,3 s de parede incluindo overhead do CLI/API; 9.831 linhas; ver `docs/ELECTORAL_EXPORT_REPORT.md`.

Latências observadas: 2,4–3,3 s por consulta via Management API (o overhead do CLI domina; as consultas em si são de milissegundos). Nenhum erro, timeout ou bloqueio.

## 7. Riscos, incertezas e limitações

- **Bairro ≈ aproximação**: eleitores de uma seção não necessariamente residem no bairro do local de votação. Todo indicador por bairro será rotulado como aproximado.
- **Sem polígonos**: o mapa usará malha municipal oficial do IBGE (fonte separada, com atribuição) e pontos para bairros. Não inventaremos limites de bairro.
- **Pequenas divergências do TSE**: Σ votos de candidaturas difere de `validos` por 5–107 votos no spike (votos sub judice/legenda) e `validos+brancos+nulos` difere de `comparecimento` por ~6–13 (por cargo). Serão registradas como `warnings`, nunca corrigidas.
- **2022 limitado**: comparação 2022→2026 só para as 2 candidaturas rastreadas em MG; sem abstenção 2022.
- **Sem 2º turno 2026** até que o SOURCE seja atualizado (eleição em 25/10/2026); o pipeline aceita `round` mas não há dados.
- **Role `postgres` via CLI e "login role" temporário (achado QA-1 F06, confirmado)**: `supabase db query --linked` não usa o endpoint de query da Management API; ele chama `POST /v1/projects/<ref>/cli/login-role` (operação gerida pela plataforma Supabase) para provisionar/renovar um **role de login temporário** (`cli_login_postgres.<ref>`) e conecta pelo pooler com privilégios de `postgres`. Portanto, **cada consulta desta auditoria e do extrator provocou uma operação de role gerida pela plataforma no SOURCE**. Nenhum schema, tabela, dado, índice, política, extensão ou configuração do projeto foi alterado; o guard contra escrita foi a transação `READ ONLY` (verificado). Isso foi observado no `--debug` contra o TARGET (mesmo comando) e em relatos públicos do CLI ([issue 4558](https://github.com/supabase/cli/issues/4558), [issue 4419](https://github.com/supabase/cli/issues/4419)); não executamos o `--debug` contra o SOURCE. **Recomendação (P-DATA-2):** o proprietário cria no SOURCE um usuário `SELECT`-only nas 6 tabelas eleitorais e o extrator passa a usar `ELECTORAL_SOURCE_DATABASE_URL` (modo `db-url`), eliminando o login role e o privilégio `postgres`.
- **Dados pessoais**: nada de `auth.users`, `visitas`, `paineis` ou `meta_*` foi lido além do catálogo (nomes e tamanhos). Nenhuma amostra de linha com PII foi extraída.
- Encoding: nomes de municípios com acentos estão corretos no banco (UTF-8); o terminal local mostrou mojibake apenas na exibição.

## 8. Decisão

**GO** para exportação completa de Minas Gerais em lotes (≈ 50 consultas de 3–5 s, pausa de 400 ms entre elas, `statement_timeout` 45–60 s, sem paralelismo), com validações e manifest com SHA-256. Ver `docs/ELECTORAL_EXPORT_REPORT.md` e `docs/IMPORT_GUIDE.md`.
