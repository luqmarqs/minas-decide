# IMPORT_GUIDE — reconstruir o snapshot eleitoral a partir do SOURCE

Este guia permite que um **operador autorizado**, em qualquer máquina com acesso de leitura ao projeto Supabase legado (SOURCE), regenere o snapshot público sem credenciais versionadas e sem caminhos absolutos da máquina original.

## Pré-requisitos

- Node ≥ 22 e `npm ci` executado no repositório.
- Supabase CLI ≥ 2.95 autenticado (`supabase login`) com acesso ao projeto SOURCE, **ou** uma connection string `SELECT`-only.
- Nunca execute nada deste guia a partir do diretório `supabase/` do repositório: ele está vinculado ao TARGET.

## 1. Vincular o SOURCE em um diretório isolado (fora do repo)

```bash
mkdir -p ~/.minas-em-movimento/source-readonly
cd ~/.minas-em-movimento/source-readonly
supabase link --project-ref <REF_DO_SOURCE> --workdir "$PWD" --yes   # sem senha: só Management API
cd -   # volte ao repositório
```

Opcionalmente, para o extrator conferir que o vínculo é o esperado, salve o ref em `~/.minas-em-movimento/source.ref` (arquivo fora do repo).

Alternativa com usuário somente leitura (recomendado quando o proprietário criar um role `SELECT`-only no SOURCE):

```bash
export ELECTORAL_SOURCE_DATABASE_URL='postgresql://readonly_user:***@<host>:5432/postgres'   # somente no shell
```

## 2. Dry-run e spike de um município

```bash
npm run etl:export -- --dry-run
npm run etl:export -- --municipality 3140001 --release spike-mariana
```

O extrator: verifica `transaction_read_only = on` e a presença das 6 tabelas eleitorais; executa cada consulta dentro de `BEGIN READ ONLY` com `statement_timeout` (45–60 s) e `lock_timeout` 1 s; pausa 400 ms entre consultas; para com erro explícito em timeout, divergência de schema ou `--max-rows`. Saída em `data/private/extract/<release>/` (gitignored) com `extract-manifest.json` (linhas, bytes, ms, SHA-256 e saúde antes/depois).

## 3. Exportação completa de Minas Gerais

```bash
npm run etl:export -- --all-mg --release mg-2026r1-<AAAAMMDD>
```

≈ 56 consultas (dimensões + totais por cargo + votos por lotes de 40 candidaturas + histórico 2022), ~3–5 s cada via Management API. Não roda em paralelo.

## 4. Construir o snapshot público

```bash
npm run etl:build -- --extract data/private/extract/mg-2026r1-<AAAAMMDD>
npm run data:validate
```

`etl:build` agrega por estado/município/bairro, aplica as validações (negativos = erro; divergências ≤ 0,5 % = `warnings`), recusa escrever qualquer arquivo que contenha identificador do SOURCE e grava `public/data/<release>/…` + `public/data/manifest.json` com SHA-256 de cada arquivo. `data:validate` reconfere hashes, contratos, faixas numéricas e ausência de PII.

## 5. Carregar territórios no TARGET (opcional, para FK e busca no servidor)

```bash
npm run db:push                      # migrations (TARGET somente; o script confere o ref)
npx tsx scripts/db/load-territories.ts public/data/<release>/territories-index.json
```

## 6. Publicar

Os arquivos em `public/data/` são servidos como Static Assets pelo Worker. Rollback = apontar `manifest.json` para o release anterior (ver §8; os diretórios de release coexistem). Nunca copie `data/private/` para `public/`.

## 7. Escopo de eleição (ano/turno) — `--year`, `--round`, `--election-codes`

```bash
npm run etl:export -- --all-mg                                   # padrão: --year 2026 --round 1 (códigos 6257,6259)
npm run etl:export -- --all-mg --year 2026 --round 1 --election-codes 6257,6259
# 2º turno (quando o SOURCE tiver os dados; os códigos DEVEM ser confirmados no SOURCE):
npm run etl:export -- --all-mg --year 2026 --round 2 --election-codes <cd1,cd2> --accept-unverified-totals
```

- `--year`/`--round` entram no nome padrão do release (`mg-2026r1-AAAAMMDD`, `mg-2026r2-AAAAMMDD`) e em `extract-manifest.json` (`year`, `round`, `election_codes`). `etl:build` lê ano/turno do manifesto do extrato (extratos antigos sem esses campos são tratados como 2026 r1, com aviso) e nomeia `rounds`, `metrics[].year/round`, camadas (`layers/2026-r2-…`) e textos da metodologia a partir deles.
- O SQL filtra `candidaturas.cd_eleicao IN (<códigos>)`; as consultas de votos usam os ids dessas candidaturas.
- **Hipótese (não verificada)**: o 2º turno entrará no SOURCE com novos `cd_eleicao` em `candidaturas`. Nenhum código é inventado: fora de 2026 r1 o `--election-codes` é obrigatório. O esquema auditado de `totais_local` **não tem coluna de eleição/turno**; por isso, para `--round > 1` o extrator só roda com `--accept-unverified-totals` (o operador confirma antes, no SOURCE, que os totais refletem aquele turno). Se `totais_local` continuar sem turno, será preciso pedir ao proprietário uma tabela/coluna nova — nunca alterar o SOURCE.

## 8. Releases múltiplos e rollback

- Cada `etl:build` grava `public/data/<release>/…` **e** `public/data/<release>/release-manifest.json` (cópia do manifesto daquele release). Diretórios de release coexistem; hashes são por release.
- `public/data/manifest.json` é o **ponteiro do release atual**: é o único arquivo que o frontend lê primeiro. `etl:build` o atualiza, salvo com `--no-activate` (constrói o release novo sem trocar o atual — use para validar antes de publicar).
- Publicar um release construído com `--no-activate`: `cp public/data/<release>/release-manifest.json public/data/manifest.json`.
- **Rollback**: `cp public/data/<release-anterior>/release-manifest.json public/data/manifest.json` e `npm run data:validate`. Para validar um release não ativo: `npx tsx scripts/validate-data/validate-snapshot.ts --base public/data --manifest public/data/<release>/release-manifest.json`.
- Limitação atual: `SnapshotManifest` descreve **um** release e uma eleição (`years`, `rounds`). Mostrar 1º e 2º turno no mesmo mapa exigirá `releases[]` no manifesto (mudança de contrato pendente, ver relatório da rodada 2). Enquanto isso, o 2º turno é um release próprio (`mg-2026r2-…`) que substitui o ponteiro; o 1º turno continua acessível em seu diretório.
- Teste/ensaio: `--out data/private/snapshot-test` gera o snapshot fora de `public/` (gitignored); `PIPELINE_COMMIT=<sha>` fixa `pipeline_commit` quando não há `.git`.

## 9. Modo `db-url` (usuário SELECT-only) — sem segredo em argv

Com `ELECTORAL_SOURCE_DATABASE_URL` definida (somente no ambiente do shell), o extrator **não usa o CLI**: abre a conexão em-processo com o driver `postgres` (`max: 1`), dentro de `BEGIN READ ONLY` + `SET LOCAL statement_timeout/lock_timeout`, de modo que a connection string nunca aparece na lista de argumentos de nenhum processo. Os guards permanecem: `assertReadOnlySql` (SELECT/WITH, sem `;`, sem comentários, sem `INTO`/`set_config`/`pg_sleep`/`dblink`…), sonda `transaction_read_only = on` e verificação das 6 tabelas. Mensagens de erro têm URL, host e senha mascarados. Sem a variável, usa-se o CLI no workdir isolado (nenhum segredo trafega em argv nesse modo também).

```bash
export ELECTORAL_SOURCE_DATABASE_URL='postgresql://readonly_user:***@<host>:5432/postgres'
npm run etl:export -- --dry-run
```

## 10. Conferência com o TSE e validador

- `npx tsx scripts/tse/sample-check.ts` (10 municípios; cache em `data/private/tse/`; `--offline` reusa o cache) → `docs/TSE_SAMPLE_REPORT.md`. Usa os dados abertos do TSE (zips em `cdn.tse.jus.br`, lidos por HTTP Range, CRC-32 verificado; o conteúdo baixado só é lido como CSV).
- `npm run data:validate` agora também confere Σ municípios = estado e Σ bairros = município (tolerância 0), `share_of_valid` ∈ [0,1] e igual a votos/válidos, `delta_pp`/`delta_votes` coerentes e ausência de `territory_id` órfão (índice, métricas, pais, camadas). Testes unitários: `npx vitest run --project unit scripts`.

## Segurança

- O extrator recusa qualquer SQL que não comece com `SELECT`/`WITH`, contenha palavras de escrita ou mais de um statement.
- Recusa rodar se o workdir do SOURCE for o próprio repositório ou se o ref vinculado coincidir com o do TARGET.
- Nenhum log imprime URL com credencial; erros com host do Supabase são mascarados.
