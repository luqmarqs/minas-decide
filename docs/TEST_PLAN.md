# TEST_PLAN

## Pirâmide

| Nível | Ferramenta | Onde | Comando |
|---|---|---|---|
| Unitário (shared, frontend) | Vitest 4 + Testing Library (jsdom) | `shared/**/*.test.ts`, `src/**/*.test.tsx` | `npm run test` |
| Rotas do Worker (repositório mockado) | Vitest (node) + `app.request()` | `worker/**/*.test.ts` | `npm run test` |
| Banco/RLS (real, TARGET dev) | Vitest + supabase-js | `supabase/tests/**` | `npm run test:db` |
| E2E | Playwright (desktop + mobile) | `e2e/**` | `npm run test:e2e` |
| Dados | scripts de validação | `scripts/validate-data` | `npm run data:validate`, `npm run check:isolation` |
| Visual | Playwright screenshots | `docs/screenshots/` | manual/`visual-review` |

## Mapeamento dos casos obrigatórios (spec §14.2)

| ID | Onde é coberto | Status (ver relatório) |
|---|---|---|
| T01 busca homônima | `src/features/territory/*.test.tsx` | — |
| T02 município sem bairros | `src/features/territory/*.test.tsx` | — |
| T03 e-mail inválido | `worker/routes/registrations.test.ts` | — |
| T04 Turnstile ausente/inválido | `worker/middleware/turnstile.test.ts` | — |
| T05 cadastro válido → sessão provisória | spike real documentado no relatório | — |
| T06 provisória cria atividade → 403 | `worker/routes/activities.test.ts` | — |
| T07 verificado cria → pendente invisível | idem | — |
| T08 admin aprova atividade | `worker/routes/admin.test.ts` | — |
| T09/T10/T11 RSVP | `worker/routes/rsvp.test.ts` | — |
| T12/T13 proposta/aprovação de grupo | `worker/routes/groups.test.ts`, `admin.test.ts` | — |
| T14 resposta pública sem PII | `worker/routes/groups.test.ts` + `supabase/tests/rls.test.ts` | — |
| T15 admin sem MFA | `worker/middleware/auth.test.ts` | — |
| T16 HTML em descrição | `shared/schemas/sanitize` + rota | — |
| T17 token Turnstile reutilizado | `worker/middleware/turnstile.test.ts` | — |
| T19 API fora, mapa segue | snapshot estático; e2e smoke | — |
| T20 sem WebGL | `src/features/electoral-map/*.test.tsx` | — |
| T22 admin sem permissão → 403 | `worker/routes/admin.test.ts` | — |
| T23 Data API direta | `supabase/tests/rls.test.ts` | — |
| T24 link profundo | e2e / unit de URL state | — |
| T26 URL fora dos hosts | `shared/contracts/groups.test.ts` | — |
| T27 contato público off | `worker/routes/activities.test.ts` | — |
| T28 dupla aprovação | função SQL `WHERE status='pending'` + teste | — |
| T29 tiles com falha | `MapShell` estado de erro | — |
| T30 teclado/leitor de tela | revisão manual + axe no e2e | — |

A coluna Status é preenchida no `docs/RELATORIO_PRIMEIRA_RODADA.md` com números reais.
