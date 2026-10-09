# ADR 0001 — Dois projetos Supabase: SOURCE somente leitura e TARGET operacional

**Status:** aceito — 2026-10-08

## Contexto
Os dados eleitorais reais já existem em um projeto Supabase legado (`dashboard-eleicoes-2026`) que também contém tabelas de outras finalidades (Meta Ads, redes, painéis, usuários). A aplicação precisa de Auth, perfis, grupos, atividades e RSVP, e a especificação (v1.1, §4.9) exige que o legado nunca seja runtime público.

## Decisão
1. **SOURCE** (`dashboard-eleicoes-2026`): apenas inspeção e extração offline, com `SELECT` dentro de `BEGIN READ ONLY`, a partir de um workdir do CLI isolado **fora do repositório** (`~/.minas-em-movimento/source-readonly`). Nenhuma migration, DDL, escrita, configuração ou vínculo do repositório a ele.
2. **TARGET** (`minas-em-movimento-dev`, sa-east-1, criado nesta rodada com autorização): único banco ligado ao Worker e ao frontend. Repositório vinculado apenas a ele; `npm run db:push` confere o prefixo do ref antes de aplicar migrations.
3. **Snapshot estático**: o mapa lê JSON versionado em `public/data/` produzido pelo ETL; não há consulta a banco para métricas eleitorais.
4. **Isolamento verificável**: `npm run check:isolation` falha o CI se identificadores do SOURCE aparecerem em `src/`, `worker/`, `public/`, `dist/`, `wrangler.jsonc`, `.env.example`.

## Consequências
- Custo adicional de compute do TARGET (autorizado).
- Dados eleitorais atualizam-se por rodada explícita do pipeline, não automaticamente.
- Credenciais do SOURCE nunca entram no repositório; o extrator depende de sessão CLI do operador ou de `ELECTORAL_SOURCE_DATABASE_URL` em shell.
