# Minas em Movimento

[![ci](https://github.com/luqmarqs/minas-decide/actions/workflows/ci.yml/badge.svg)](https://github.com/luqmarqs/minas-decide/actions/workflows/ci.yml)

Atlas eleitoral público de Minas Gerais (município e bairro) combinado com organização voluntária de atividades presenciais: busca territorial, mapa com indicadores de 2026 (e comparação 2022 para candidaturas com histórico), grupos de WhatsApp aprovados por território, atividades com "Eu vou" sem login e moderação administrativa.

> **Rodada 1 — corte vertical demonstrável; rodada 2 — hardening autônomo.** Relatório auditável (com adendo da rodada 2) em [`docs/RELATORIO_PRIMEIRA_RODADA.md`](docs/RELATORIO_PRIMEIRA_RODADA.md). Sem deploy. O que só o proprietário pode fazer: [`docs/STAGING_PLAYBOOK.md`](docs/STAGING_PLAYBOOK.md).

## Arquitetura em uma linha

React + Vite (SPA) servida por **Cloudflare Workers Static Assets**; API **Hono** no Worker em `/api/*`; **Supabase operacional novo** (Auth, perfis, grupos, atividades, RSVP) com RLS; dados eleitorais como **snapshot estático versionado** em `public/data/`, gerado offline a partir do Supabase legado (somente leitura, nunca em runtime). Detalhes: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), ADRs em [`docs/adr/`](docs/adr/).

## Rodar localmente

```bash
npm ci
cp .env.example .env            # valores públicos do projeto Supabase operacional (TARGET)
cp .dev.vars.example .dev.vars  # segredos do Worker (service role, Turnstile, HMAC) — nunca commitar
npm run dev:worker              # Worker Hono em http://127.0.0.1:8787 (lê .dev.vars)
npm run dev                     # Vite em http://127.0.0.1:5173 (proxy /api → 8787)
```

Sem `public/data/manifest.json` o mapa usa **fixtures DEMO rotuladas**. Para gerar o snapshot real: [`docs/IMPORT_GUIDE.md`](docs/IMPORT_GUIDE.md).

Banco (TARGET somente):

```bash
npm run db:push                 # aplica supabase/migrations após conferir o ref do TARGET
npx tsx scripts/db/load-territories.ts public/data/<release>/territories-index.json
npx tsx scripts/db/bootstrap-admin.ts   # APP_ENV=local; usa ADMIN_EMAILS de .dev.vars
```

## Qualidade

```bash
npm run typecheck && npm run lint && npm run format:check
npm run test            # unit (jsdom) + worker (node)
npm run test:db         # RLS contra o TARGET dev (precisa de .dev.vars)
npm run test:e2e        # Playwright (build + wrangler dev)
npm run check:isolation # falha se identificador do Supabase legado aparecer em src/worker/public/config
npm run data:validate   # valida hashes/contratos/somas cruzadas do snapshot publicado
npm run tse:sample      # confere 10 municípios contra os dados abertos oficiais do TSE (docs/TSE_SAMPLE_REPORT.md)
npm run ci              # tudo acima exceto e2e/db
```

## Variáveis

Ver [`.env.example`](.env.example) e [`.dev.vars.example`](.dev.vars.example). `VITE_*` é público. Chaves de serviço só no Worker. Nenhuma variável do Supabase legado existe no app; o extrator usa a sessão do CLI em um diretório isolado fora do repositório.

## Documentação

`docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DATA_DICTIONARY.md`, `docs/API_CONTRACTS.md`, `docs/SECURITY.md`, `docs/DESIGN_SYSTEM.md`, `docs/TEST_PLAN.md`, `docs/IMPORT_GUIDE.md`, `docs/DATA_SOURCE_AUDIT.md`, `docs/ELECTORAL_EXPORT_REPORT.md`, `docs/RUNBOOK.md`, `docs/DECISIONS.md`, `docs/adr/`.

## Licenças e atribuições

Basemap © OpenFreeMap © OpenMapTiles, dados © OpenStreetMap contributors. Malha municipal: IBGE. Resultados eleitorais: TSE (dados públicos), consolidados em base do projeto.
