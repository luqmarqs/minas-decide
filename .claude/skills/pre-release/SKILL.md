---
name: pre-release
description: Checklist executável antes de considerar uma rodada/versão pronta (testes reais, isolamento do SOURCE, segredos, snapshot, relatório). Use ao fechar uma rodada ou antes de qualquer deploy.
---

Execute, nesta ordem, e registre números reais (nunca "OK" sem saída):

1. `npm run ci` — lint, format, typecheck, unit+worker, isolamento do SOURCE, validação do snapshot, build.
2. `npm run test:db` — RLS real no TARGET dev (precisa de `.dev.vars`).
3. `npm run test:e2e` — Playwright (build + `wrangler dev --env local`).
4. `git status --short` limpo; `git diff --cached --name-only | xargs grep -lE "eyJ[A-Za-z0-9_-]{20,}|sb_secret|postgres(ql)?://[^ ]+@"` sem resultado.
5. `supabase/.temp/project-ref` começa com `wnclh` (TARGET). Nenhum `--workdir` apontando para fora do repo em scripts versionados.
6. `wrangler.jsonc`: top-level = produção (`APP_ENV=production`, `WRITES_ENABLED=false`); `env.local`/`env.staging` explícitos.
7. `public/data/manifest.json` com `status` coerente (`validated` só após `npm run data:validate` sem erros).
8. Capturas atualizadas em `docs/screenshots/final*/` com o commit no nome.
9. `docs/RELATORIO_PRIMEIRA_RODADA.md` (ou o relatório da rodada) atualizado: §11 com números, §15 pendências, §19 checklist de veracidade.
10. Deploy só com autorização humana explícita; nunca `wrangler deploy` sem `--env staging` autorizado.
