# Regras de arquitetura

- Um frontend SPA (Vite) servido por Workers Static Assets; um Worker Hono em `/api/*`; um Supabase operacional (TARGET). Sem SSR, Next, Redis, filas, n8n, Edge Functions redundantes, cron de sincronização.
- Contratos em `shared/contracts/*.ts` são a fonte de verdade de request/response. Mudar contrato = atualizar os dois lados + testes no mesmo PR; não mudar contrato unilateralmente em tarefa delegada.
- Worker: `worker/app.ts` monta rotas; `worker/routes/*` por recurso; `worker/middleware/*` (request_id, rate limit, auth, turnstile, writes flag); `worker/services/*` lógica; `worker/repositories/*` acesso Supabase. Não criar camadas que só embrulham outras.
- Frontend: `src/features/<feature>/` (componentes + hooks + tipos), `src/components/ui` (fundacionais), `src/pages/` (rotas), `src/lib/` (api client, supabase client, formatters), `src/fixtures/` (demo rotulado).
- Dados eleitorais: `scripts/import-electoral` (SOURCE → `data/private/extract`), `scripts/import-electoral/build-snapshot.ts` (→ `public/data/<release>/...` + `manifest.json`). Frontend lê `public/data/manifest.json` → arquivos. Worker não participa.
- IDs de território: `mg`, `mg-<ibge7>`, `mg-<ibge7>-<slug-bairro>`.
- Idempotência, controle de concorrência (versão/estado) e limites em toda criação de registro.
- Cache-Control: público com `max-age` curto para listas; `no-store` em conta/cadastro/admin.
- Registrar desvios da especificação em `docs/DECISIONS.md` / ADR, não silenciosamente.
