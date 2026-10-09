# Minas em Movimento — guia operacional para agentes

Atlas eleitoral público de Minas Gerais + organização voluntária de atividades presenciais.
Especificação-mestre: `ESPECIFICACAO_COMPLETA_MINAS_EM_MOVIMENTO (1).md` (ler quando houver dúvida de requisito).
Decisões e desvios: `docs/DECISIONS.md` e `docs/adr/`.

## Decisões-chave (vinculantes)

- **Dois Supabases.** SOURCE = `dashboard-eleicoes-2026` (legado, eleitoral, **somente leitura, nunca em runtime**). TARGET = `minas-em-movimento-dev` (operacional novo: Auth, perfis, grupos, atividades, RSVP). O repositório está vinculado **apenas ao TARGET** (`supabase/.temp/project-ref` começa com `wnclh`). O SOURCE está vinculado em um workdir isolado fora do repo (`~/.minas-em-movimento/source-readonly`).
- **Proibido no SOURCE:** qualquer escrita, DDL, migration, `db push`, `db reset`, índice, extensão, RLS, view, função. Só `SELECT` dentro de `BEGIN READ ONLY; ... COMMIT;` via `scripts/import-electoral/`.
- **Proibido no cliente/Worker/CI:** URL, ref, chave ou connection string do SOURCE. `npm run check:isolation` falha o build se encontrar.
- Mapa consome **snapshots estáticos** em `public/data/` (gerados pelo ETL offline). Nunca consulta banco em runtime.
- Dados pessoais (responsáveis de grupo, e-mail/telefone de proponente, perfis) **jamais** em resposta pública. Projeções públicas estão em `shared/contracts/`.
- Turnstile validado no servidor; chaves de teste oficiais da Cloudflare em local/dev (rotuladas).
- "Eu vou" sem login, idempotente por cookie assinado (HMAC) + unique no banco; é **intenção**, não presença.
- Sessão provisória (Supabase anonymous sign-in) ≠ e-mail verificado. Criar atividade exige `email_verified` real do Auth, nunca campo editável.
- Sem deploy de produção, sem domínio, sem contratação de serviço sem autorização humana.

## Stack

React 19 + Vite 7 + TS 5.9 estrito + React Router 7 + Tailwind 4 + tokens CSS (`src/styles/tokens.css`) + Radix/vaul + TanStack Query + Motion + MapLibre GL 6. Backend: Cloudflare Workers + Hono 4 + Zod 4 + supabase-js. Testes: Vitest 4, Playwright, testes de RLS contra TARGET dev.

## Comandos

```
npm run dev            # Vite (proxy /api -> wrangler dev em 8787)
npm run dev:worker     # wrangler dev (lê .dev.vars)
npm run typecheck | lint | format:check | test | test:db | test:e2e
npm run check:isolation   # garante ausência do SOURCE em bundle/worker/config
npm run etl:export -- --municipality 3140001 --dry-run   # ETL somente leitura
npm run etl:build      # gera public/data a partir de data/private/extract
npm run db:push        # push de migrations com verificação explícita do TARGET
npm run ci
```

## Layout

`src/` (app React por feature) · `worker/` (Hono API) · `shared/` (contratos Zod, helpers) · `supabase/migrations` (TARGET only) · `scripts/import-electoral` (ETL) · `scripts/validate-data` · `data/private` (gitignored) · `public/data` (snapshot publicado) · `docs/` · `e2e/`.

## Padrões

- TS estrito sem `any`. Contratos primeiro (`shared/contracts`), depois implementação dos dois lados.
- Toda resposta da API: `{ data, meta.request_id }` ou `{ error: {code,message,fields?}, meta }`.
- Erros públicos genéricos; nunca stack/SQL. Logs sem PII, sem tokens.
- Mutations só via Worker; browser nunca grava direto em tabelas operacionais (RLS + grants garantem).
- Migrations idempotentes, sequenciais, com testes negativos de RLS.
- Componentes consomem tokens; sem paleta solta. `prefers-reduced-motion` respeitado.
- Nunca declarar mock como real. Fixtures rotuladas visualmente ("DEMO").

## Regras por domínio

Ver `.claude/rules/*.md`. Em conflito, prevalece: proprietário > segurança/lei > especificação > ADR > convenção.
