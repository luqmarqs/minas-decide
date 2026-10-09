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

Os arquivos em `public/data/` são servidos como Static Assets pelo Worker. Rollback = restaurar o `manifest.json` anterior (os diretórios de release podem coexistir). Nunca copie `data/private/` para `public/`.

## Segurança

- O extrator recusa qualquer SQL que não comece com `SELECT`/`WITH`, contenha palavras de escrita ou mais de um statement.
- Recusa rodar se o workdir do SOURCE for o próprio repositório ou se o ref vinculado coincidir com o do TARGET.
- Nenhum log imprime URL com credencial; erros com host do Supabase são mascarados.
