# RUNBOOK

## Ambientes

| Ambiente | Frontend/Worker | Banco | Turnstile | Status |
|---|---|---|---|---|
| local | `npm run dev` + `npm run dev:worker` | TARGET dev (remoto) | chaves de teste | ativo |
| staging | `wrangler deploy --env staging` (não executado) | TARGET staging (não criado) | widget de teste | NÃO CONFIGURADO |
| produção | — | — | — | NÃO AUTORIZADO |

## Operações

- **Suspender escritas em incidente:** `WRITES_ENABLED=false` nas vars do Worker (`wrangler.jsonc` ou `wrangler secret`). GETs e mapa continuam; mutações respondem 503 `WRITES_SUSPENDED`.
- **Rollback de snapshot:** restaurar `public/data/manifest.json` anterior e redeploy; diretórios de release antigos podem permanecer.
- **Rollback de Worker:** `wrangler rollback` (Cloudflare mantém versões).
- **Migrations:** só `npm run db:push`; nunca `db reset` fora de local. Rollback por migration de compensação documentada no topo de cada arquivo.
- **Atualizar dados eleitorais (2º turno):** seguir `docs/IMPORT_GUIDE.md`; nunca em cron.
- **Promover admin:** `npx tsx scripts/db/bootstrap-admin.ts` em local; em staging/prod, inserção manual em `app_private.admins` por operador autorizado + enrolamento MFA.

## Observabilidade mínima

Logs estruturados do Worker (`request_id`, rota, status, ms, `rate_limited`) via Workers Logs (`observability.enabled`). Métricas a acompanhar: 5xx, 429, erros Turnstile, propostas pendentes, falhas de Auth e-mail, carregamento do manifest.

## Incidentes de privacidade

1. Suspender escritas. 2. Identificar rota/consulta. 3. Verificar logs sem copiar PII. 4. Corrigir e registrar em `docs/SECURITY.md`. 5. Comunicar titulares se exigido.
