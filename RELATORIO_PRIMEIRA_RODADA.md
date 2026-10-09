# RELATÓRIO DA PRIMEIRA RODADA — MINAS EM MOVIMENTO

**Data e hora (America/Sao_Paulo):** 2026-10-08 23:59
**Commit Git / branch:** `aefb63a (código) — o commit seguinte contém este relatório e as capturas finais` / `main` (10 commits locais; repositório criado nesta rodada; sem remoto configurado)
**Ambiente:** local (Windows 11, Node 24.14, npm 11.9, Supabase CLI 2.95.4) + **Supabase TARGET dev remoto** (`minas-em-movimento-dev`, sa-east-1, criado nesta rodada com autorização do proprietário)
**URL verificada, se existir:** **SEM DEPLOY.** Nenhuma URL pública. Validação em `http://127.0.0.1:8790` (Worker local com `wrangler dev --env local` servindo o build) e `http://127.0.0.1:5173` (Vite).
**Modelos utilizados e disponibilidade real:** sessão principal Claude Fable 5.1 (`claude-fable-5-1`); subagentes via `Agent` com `model: opus` (4 tarefas) e `model: sonnet` (1 tarefa). **Substituição registrada:** os arquivos `.claude/agents/*.md` foram criados conforme a spec, mas a instalação não os carrega durante a mesma sessão (só após reinício); usei `general-purpose` + override de modelo com o mesmo brief. Haiku não foi necessário (inventário feito pela sessão principal com comandos diretos). Aliases `claude-opus-5-5`/`claude-sonnet-5-5` confirmados disponíveis pelo harness.
**Agentes acionados, tarefas e resultados:**

| Agente (papel) | Modelo | Tarefa | Duração | Tokens | Resultado |
|---|---|---|---|---|---|
| orchestrator (sessão) | Fable 5.1 | Fase 0, contratos, tokens, ETL, snapshot, docs, revisão, correções QA, relatório | ~3h | — | concluído |
| backend-engineer (BE-1) | Opus | 9 migrations, RLS, Worker Hono, testes de rota/RLS/smoke, docs | 35 min | 317k | concluído; 64 testes worker, 27 RLS, 33 smoke |
| frontend-engineer (FE-1) | Opus | shell, design system, mapa, busca, páginas públicas, fixtures DEMO | 44 min | 379k | concluído; 52 testes unit, 55 capturas |
| feature-builder (FE-2) | Opus | cadastro, obrigado, proposta, retorno magic link, atividades, admin | 44 min | 341k | concluído; 44 testes novos, 24 capturas, validação real contra TARGET |
| qa-security (QA-1) | Opus | auditoria adversarial independente | 14 min | 234k | 0 críticos/altos, 7 médios, 11 baixos, 6 info; 7 corrigidos |
| visual-review (VR-1) | Sonnet | capturas finais, Lighthouse, axe | em execução no fechamento deste arquivo | — | ver §10 |

## 1. Resumo executivo (até 15 linhas)

**Operacional (local + TARGET dev real):** mapa de Minas Gerais com os 853 municípios (malha IBGE) coloridos por abstenção/comparecimento/votação/comparação, busca de município e bairro com desambiguação, painel de território com indicadores reais do 1º turno de 2026 e comparação 2022 para duas candidaturas; cadastro com Turnstile → sessão provisória → página de obrigado com grupo aprovado/fallback/proposta; proposta de grupo; retorno de magic link que promove a conta; criação e gestão de atividades por e-mail verificado; "Eu vou" sem login idempotente; painel admin com fila, aprovação/rejeição auditada, responsáveis privados e eventos de segurança. Tudo isso foi exercitado de verdade contra o Worker local e o Supabase TARGET dev (33 passos de smoke de API + 17 passos de UI no navegador).
**Dados eleitorais: INTEGRADOS — Minas Gerais completa (853 municípios, 6.077 bairros aproximados), eleição 2026 1º turno, histórico 2022 para 2 candidaturas.** Snapshot `mg-2026r1-20261008`, status `validated`, 903 arquivos, 68,7 MB, SHA-256 por arquivo, 0 erros de validação. Origem auditada em modo somente leitura; **nenhuma migration, escrita ou configuração no legado**.
**Demonstrativo/não operacional:** Turnstile com chaves de teste oficiais (Siteverify real implementado, mas "implementado" só vale após chave real); entrega real de e-mail não validada (cota do SMTP padrão do Supabase esgotada; links gerados via admin API para testar o fluxo); MFA TOTP de admin sem tela de enrolamento (admin só com bypass explícito `APP_ENV=local`); textos jurídicos em rascunho.
**Falta:** deploy (não autorizado), domínio, Cloudflare WAF, SMTP próprio, amostragem manual de 10 municípios contra totais TSE, 2º turno.
**Riscos bloqueantes para produção:** P-SEC-1 (pré-sequestro de perfil por e-mail alheio), P-SEC-3 (cota de e-mail esgotável), P-LEGAL-1 (revisão jurídica LGPD), P-DATA-2 (extrator deve usar usuário SELECT-only; o CLI provisiona "login role" no SOURCE).
**O que o proprietário deve testar:** §17.

## 2. Entregáveis por módulo

| Módulo | Status | Evidência |
|---|---|---|
| Fase 0: inventário, SOURCE identificado e auditado, TARGET criado | real | `docs/DATA_SOURCE_AUDIT.md`, `docs/DECISIONS.md` D01–D03 |
| ETL somente leitura + snapshot validado MG | real | `docs/ELECTORAL_EXPORT_REPORT.md`, `public/data/manifest.json`, `npm run data:validate` (903/903, 0 erros) |
| Contratos compartilhados (Zod) | real | `shared/contracts/*.ts`, 3 arquivos de teste |
| Design system e tokens | real | `src/styles/tokens.css`, `docs/DESIGN_SYSTEM.md`, `src/components/ui/*` |
| Mapa MapLibre + malha IBGE + camadas + legenda | real (dados validados) / demo (fallback rotulado) | `src/features/electoral-map/*`, capturas `docs/screenshots/` |
| Busca territorial | real | `src/features/territory/search.ts` + testes T01/T02 |
| Página de território e comparação 2022→2026 | real | `src/pages/TerritorioPage.tsx`, captura Mariana |
| Página de atividade + "Eu vou" | real (API) | `worker/routes/rsvp.ts`, `src/features/activities/RSVPButton.tsx`, testes T09–T11 |
| Cadastro + Turnstile + sessão provisória | real com Turnstile de **teste**; e-mail real **não validado** | `worker/routes/registrations.ts`, `src/features/registration/*`, smoke 201 |
| Obrigado (exato / município / nenhum) | real | `src/pages/ObrigadoPage.tsx`, 3 capturas |
| Proposta de grupo + moderação | real | `worker/routes/groups.ts`, `admin.ts`, função SQL transacional, T28 testado ao vivo |
| Magic link + confirm-email | parcial (fluxo validado com link gerado por admin API; entrega real não) | `worker/routes/auth.ts`, `src/pages/AuthRetornoPage.tsx`, `scripts/db/spike-anon-email-link.ts` |
| Criar/gerir atividades (verificado) | real | `worker/routes/activities.ts`, `src/features/activities/ActivityEditor.tsx` |
| Admin (fila, aprovação, responsáveis, eventos) | real com bypass de MFA local; **MFA real não iniciado** | `src/pages/admin/*`, `worker/middleware/auth.ts` |
| Schema TARGET + RLS + grants | real (aplicado no TARGET dev) | `supabase/migrations/0001–0009`, `npm run test:db` 27/27 |
| Isolamento do SOURCE (CI) | real | `scripts/validate-data/check-source-isolation.ts` (2.012 arquivos OK) |
| Headers de segurança da SPA (CSP) | real (verificado no navegador) | `public/_headers` |
| CI (GitHub Actions) | código escrito, **não executado** (sem remoto) | `.github/workflows/ci.yml` |
| Deploy staging | não iniciado (não autorizado) | D12 |
| Agentes/regras do Claude | real (`.claude/agents`, `.claude/rules`, hook) / `settings.json` **não aplicado** | `docs/claude-settings.proposed.json` (D10) |

## 3. Arquitetura implementada

Ver `docs/ARCHITECTURE.md` (diagrama) e ADRs `docs/adr/0001–0004`. Em resumo: SPA React 19 + Vite 7 servida por Cloudflare Workers Static Assets; Worker Hono 4 em `/api/v1/*`; Supabase TARGET (Auth + Postgres, schemas `public` exposto e `app_private` privado); dados eleitorais como snapshot estático versionado em `public/data/<release>/` (índice de territórios, 854 arquivos de métricas, 46 camadas de mapa, candidatos, metodologia, manifest com SHA-256); malha municipal IBGE em `public/geo/`; basemap OpenFreeMap. O SOURCE legado entra apenas no ETL offline (`scripts/import-electoral`).

**Desvios registrados:** TypeScript 5.9/React Router 7/Vite 7 em vez dos majors mais recentes (D09); sem PostGIS (lon/lat `double precision`); `motion` removido (animações em CSS com tokens); `.claude/settings.json` não gravado (D10); territórios replicados no TARGET a partir do snapshot para FK (D14); `wrangler.jsonc` seguro por padrão com `env.local`/`env.staging` (D16).

## 4. Estrutura agentica executada

Agentes definidos em `.claude/agents/` (backend-engineer, frontend-engineer, feature-builder, code-explorer, qa-security, visual-review) e regras em `.claude/rules/` (architecture, security, frontend, database, cartography, reporting). Delegações com o protocolo da spec §6.5 (objetivo verificável, arquivos permitidos/proibidos, critérios de aceite, formato de retorno). Paralelismo máximo: 2 agentes escrevendo ao mesmo tempo com conjuntos de arquivos disjuntos (BE-1 em `worker/`+`supabase/`; FE-1 em `src/`), sem worktrees (não houve conflito de edição). Conflitos observados: dois `wrangler dev` na mesma porta durante FE-2 (resolvido com portas distintas); `@eslint/js` faltante (adicionado por mim); uma correção de contrato (`z.partialRecord`) feita por mim enquanto FE-1 rodava. Decisões assumidas por Fable: escolha do município do spike, GO para exportação total, tratamento de sub judice como advertência, correções QA F01/F02/F03/F07/F08/F13/F15, menu de sessão no header, alinhamento de contratos ao Worker. Hook de contenção escrito em `scripts/hooks/guard-bash.mjs` (não ativo: depende de `settings.json`).

## 5. Schema e RLS

Migrations (todas aplicadas no TARGET dev com `npm run db:push`, que confere o prefixo do ref): `0001_extensions_and_schemas`, `0002_territories`, `0003_profiles_admins`, `0004_audit_abuse_turnstile`, `0005_groups`, `0006_activities_rsvps`, `0007_service_api`, `0008_territories_ibge_state_code`, `0009_default_privileges`. Dicionário completo em `docs/DATA_DICTIONARY.md`.

Relacionamentos: `territories` (text PK) ← `profiles.selected_territory_id`, `whatsapp_groups`, `group_proposals`, `activities`; `auth.users` ← `profiles`, `admins`, `activities.creator_user_id`, `activity_rsvps.user_id`; `activities` ← `activity_rsvps`; `whatsapp_groups` ← `group_managers`.

Matriz de acesso testada (`supabase/tests/rls.test.ts`, 27 testes ao vivo + `qa-security.test.ts`): anon/authenticated só têm SELECT em `territories`, nas views `whatsapp_groups_public`/`activities_public` e em colunas públicas das tabelas base; `app_private` sem USAGE; 21 funções `svc_*` e 11 `SECURITY DEFINER` (todas com `search_path=''`) sem EXECUTE para clientes; RLS ligada em todas as tabelas; views `security_invoker` + `security_barrier`. Testes negativos executados: leitura de `app_private.*` via REST (404/406), `select *` na base (401), INSERT como anon (401) e como sessão anônima (403), `svc_grant_admin` como anon/authenticated (401/403), proposta pendente invisível, criador/moderação invisíveis na view, T27, T28 (dois admins → 1 grupo), T17 (token único), `is_email_verified` lê `auth.users`.

Sem cobertura: concorrência real de aprovação dupla além do teste T28 (função com `WHERE status='pending'`), revogação efetiva de access tokens após `signOut('others')`, rotação de `RSVP_DEVICE_SECRET`.

## 6. Autenticação

Fluxo implementado e **observado no TARGET** (spike reproduzível: `scripts/db/spike-anon-email-link.ts`):
1. Cliente resolve Turnstile → `signInAnonymously()` (anonymous sign-in habilitado via `supabase config push`) → JWT `is_anonymous=true`, `aal1`.
2. `POST /api/v1/registrations` (Bearer + Turnstile Siteverify) cria `profiles` (`email_verification_state='pending'`), checa `email_in_use` (409 neutro se outro usuário já tem o e-mail), vincula o e-mail com `auth.admin.updateUserById(uid, {email, email_confirm:false})` (observado: **o usuário continua anônimo** e a API admin **não envia e-mail**) e dispara magic link via `signInWithOtp`. Se o envio falhar (cota), responde `email_verification_state: 'unverified'` — sem sucesso falso (observado 2 vezes).
3. Usuário abre o link → `/autenticacao/retorno` (aceita hash implícito, `token_hash` e `code` PKCE; limpa a URL) → `POST /auth/confirm-email` exige `email_confirmed_at` **e** `amr` com `otp`/`magiclink`; promove (`is_anonymous=false` via `updateUserById` com `email_confirm:true`), marca perfil `verified` e revoga outras sessões → cliente faz `refreshSession()`; JWT passa a `is_anonymous=false` (observado).
4. Organizador = JWT não anônimo + `email_confirmed_at` + `app_private.is_email_verified(uid)` + perfil ativo `verified` (QA F01). **Prova de que conta provisória não cria atividades:** teste T06 (403) no worker, teste RLS "anonymous session cannot create activities", smoke passo 3 (403) e validação de UI (tela "verifique seu e-mail").
5. Login futuro: `POST /auth/send-link` (Turnstile, 3/10min, `shouldCreateUser:false`, resposta neutra 202).
6. Admin: `app_private.admins` + `aal2`; bypass só com `APP_ENV=local` (logado como `ADMIN_MFA_BYPASS_LOCAL`); TOTP habilitado no projeto, sem UI de enrolamento.

**Teste real vs simulação:** criação de sessão anônima, vínculo de e-mail, geração de link por admin API, confirmação, promoção, refresh e revogação foram **reais** no TARGET dev. **Simulado/não validado:** entrega e clique a partir de caixa de entrada real (SMTP padrão com `over_email_send_rate_limit`; `example.org` recusado pelo Auth); MFA aal2 real; Turnstile com chave real.

## 7. Endpoints

Tabela completa (auth, validação, limites, cache, status) em `docs/API_CONTRACTS.md`. Resumo: 23 rotas em `/api/v1` — públicas: `health`, `territories/search`, `territories/:id`, `territories/:id/metrics` (404 por desenho: métricas vêm do snapshot), `groups`, `groups/proposals` (POST), `activities`, `activities/:id`, `activities/:id/rsvp` (POST/DELETE), `registrations` (POST), `auth/send-link` (POST); autenticadas: `me` (GET/PATCH), `my-activities`, `activities` (POST), `activities/:id` (PATCH), `activities/:id/cancel`, `auth/confirm-email` (nova); admin: `admin/queue`, `admin/groups/:id/{approve,reject}`, `admin/activities/:id/{approve,reject}`, `admin/groups/:id` (PATCH), `admin/groups/:id/managers`, `admin/security-events`. Todas **reais** (nenhuma mock no runtime); testadas com repositório falso (78 testes worker) e ao vivo (33 passos de smoke + 9 testes QA ao vivo). Envelope `{data, meta.request_id}` / `{error:{code,message,fields?}, meta}`; `no-store` em rotas privadas; `public, max-age=60` em listas públicas.

## 8. Proteção antiabuso

- **Turnstile:** Siteverify real (`success`, `hostname ∈ TURNSTILE_EXPECTED_HOSTNAMES`, `action` igual à esperada, uso único por hash em `app_private.turnstile_tokens_used`, TTL 5 min). **Configurado com chaves de TESTE** da Cloudflare (sempre passam; hostname/action não checados nesse modo; uso único pulado apenas em `local`). Secret de teste recusado fora de `local`/`test`. **INVIÁVEL NO PLANO ATUAL / NÃO EXECUTADO com chave real** (sem conta Cloudflare autorizada).
- **WAF/Bot management:** **não configurado** (sem conta/plano). Política realista para plano Free/Pro: regras WAF por rota de escrita + Bot Fight Mode genérico; `cf.bot_management.score` exige Enterprise — não assumido.
- **Rate limit:** em memória por isolate (best-effort, documentado): registrations 5/10min, proposals 5/10min, rsvp 30/10min, send-link 3/10min, cancel 20/10min; 429 com `Retry-After`; `abuse_events` sem IP bruto (hash). Risco CGNAT documentado (QA F05, pendente).
- **RSVP idempotente:** cookie `mm_device` (`HttpOnly; SameSite=Lax; Path=/api; Secure` fora de local), HMAC-SHA256 com `RSVP_DEVICE_SECRET`, índices parciais únicos; T09/T10/T11 testados com fakes e ao vivo (POST duplo conta 1; DELETE alheio 403/404).
- **Escritas suspensas:** `WRITES_ENABLED` (503 `WRITES_SUSPENDED`; GETs e mapa continuam). Padrão de produção no `wrangler.jsonc` = suspensas.
- **CSP e headers** na SPA (`public/_headers`) e no Worker (`nosniff`, `no-referrer`, `X-Request-Id`).
- **Limites do plano Cloudflare:** não medidos (sem deploy). Estimativa em §13.

## 9. Dados eleitorais e mapa

Documentos: `docs/DATA_SOURCE_AUDIT.md`, `docs/ELECTORAL_EXPORT_REPORT.md`, `docs/IMPORT_GUIDE.md`, ADRs 0001/0002/0004.

- **SOURCE (legado, somente leitura):** alias `electoral-source-readonly` (projeto `dashboard-eleicoes-2026`, confirmado pelo proprietário; ref omitido). Vinculado em `~/.minas-em-movimento/source-readonly` (fora do repo). Schema `public` com 6 tabelas eleitorais (`municipios`, `locais`, `totais_local`, `candidaturas`, `votos_cand`, `historico_votos`) e tabelas não relacionadas (`meta_*` Meta Ads, `digital_*`, `paineis`, `visitas`, `auth.users`) **não lidas além do catálogo**. Cobertura: 2026 1º turno (sem 2º turno), MG/RS/SP, 5 cargos; 2022 só para 7 candidaturas (2 em MG), níveis município/bairro/local; sem geometrias. MG: 853 municípios, 10.073 locais, 52.062 seções, 6.079 pares município×bairro. Estimativas: 482 MB no total; `votos_cand` 42 MB (7,9 M pares), `historico_votos` 17 MB, `totais_local` 11 MB.
- **Saúde antes/depois:** 9 conexões/1 ativa antes do spike; 8/1 depois da exportação completa; sem erros ou timeouts.
- **Consultas que rodaram:** 16 consultas de catálogo/agregadas na auditoria (≤ 3,3 s cada); spike Mariana 56 consultas (9.752 linhas, 152,7 s de parede, máx. 6,1 s); exportação completa 56 consultas (2.023.422 linhas, 183,7 s, máx. 5,5 s). Todas em `BEGIN READ ONLY; SET LOCAL statement_timeout; …; COMMIT;` (escrita bloqueada: comprovado com erro 25006).
- **Município amostral:** Mariana (IBGE 3140001; 40 locais, 32 bairros). Validação manual: sem negativos; aptos/comparecimento idênticos entre cargos; divergências Σcand−válidos entre 5 e 107 votos.
- **Decisão GO/NO-GO:** GO (executada).
- **Fonte publicada:** `public/data/manifest.json` → release `mg-2026r1-20261008`, `status: validated`, 903 arquivos, 68,7 MB, SHA-256 por arquivo, `pipeline_commit`, metodologia pt-BR. Conteúdo: totais por território (5 cargos), todas as candidaturas majoritárias, top 10 proporcionais por território + rastreadas, comparação 2022→2026 (2 candidaturas). **Advertências mantidas, não corrigidas:** Dep. Federal MG Σcand−válidos = 94.114 (0,75 %, sub judice na fonte; 1 bairro com candidatura acima dos válidos); 2 grafias de bairro unificadas; 183 locais com coordenada aproximada.
- **Fixtures:** só como fallback quando o manifest falha; rotuladas "DADOS DEMONSTRATIVOS" com municípios fictícios ("Vale Demo") e "Candidatura A/B/C" — **não são usadas com o snapshot presente**.
- **Prova de que o site não consulta o SOURCE:** `npm run check:isolation` (2.012 arquivos, inclusive `dist/`, sem ref/URL/nome/tabelas do SOURCE); Worker responde 404 em `/territories/:id/metrics`; rede do navegador só acessa `127.0.0.1`, `tiles.openfreemap.org` e o TARGET (`*.supabase.co`, apenas para Auth/API); CSP `connect-src` restringe a esses hosts.
- **Nenhuma migration, escrita ou configuração no SOURCE.** Ressalva honesta (QA F06): o CLI provisiona um **role de login temporário gerido pela plataforma** a cada consulta `--linked` (não altera schema/dados/config). Próxima extração com usuário SELECT-only (P-DATA-2).
- **TARGET operacional:** **criado em dev** (`minas-em-movimento-dev`, sa-east-1), migrations aplicadas, territórios carregados (1 + 853 + 6.077). Não conectado a staging.

## 10. UX e identidade visual

Tokens semânticos em `src/styles/tokens.css` (superfícies, texto, ação, estados, mapa sequencial/divergente, tipografia, espaçamento, raios, motion, z-index) com tema escuro e `prefers-reduced-motion` zerando durações; expostos ao Tailwind 4 via `@theme`. Componentes fundacionais (Button, Input, Field, Checkbox, Combobox, Select, Dialog, BottomSheet/SidePanel, Toast, Tabs, Badge incl. `demo`, Skeleton, Error/Empty, Tooltip) e de produto (TerritorySearch, TerritoryPanel, MetricBlocks, ComparisonBlock, DataQualityNote, GroupCard, MapShell/Canvas/LayerSelector/Legend, ActivityCard/Marker, RSVPButton, RegistrationForm, GroupProposalForm, ActivityEditor, AdminQueues). Motion em CSS com tokens (hover 140 ms, painel 240 ms, sheet 300 ms, flyTo 500 ms; instantâneo com reduced motion). Identidade provisória tipográfica (sem logotipo definitivo); plano de retematização e auditoria de identidade em `docs/DESIGN_SYSTEM.md` §13. Referências estudadas: spec §13.4.

Capturas (79 arquivos em `docs/screenshots/`, nomeadas por tela/dispositivo/estado/data; commit das capturas FE-1 = `599130e`, FE-2 = `aefb63a`): home desktop/mobile (real e DEMO), sem WebGL + reduced motion, território, atividade, participar (vazio/erros), obrigado (3 estados), propor-grupo, criar-atividade (bloqueio/formulário/enviada), minhas-atividades, autenticação-retorno, admin (fila, revisões, eventos, grupo). **Conjunto final consolidado + Lighthouse + axe: 37 capturas em `docs/screenshots/final/` (`<tela>-<desktop1440|mobile390>-<estado>-20261009-aefb63a.png`: home com camada abstenção, foco no combobox, lista do combobox, município selecionado com painel/bottom sheet, tema escuro + reduced motion, DEMO; território Mariana e bairro Centro; atividade cancelada e não encontrada; participar padrão/erros/foco; obrigado sem grupo; propor-grupo; criar-atividade sem sessão; metodologia; 404) + `_resultados.json`, `lighthouse-home.json`, `lighthouse-territorio.json`; scripts reproduzíveis em `scripts/visual/{capture,extra,contrast}.mjs`. Achados VR-1: CLS 0,36 no território mobile (rodapé e lista de bairros deslocam; P-PERF-2), Performance mobile 36/30 (bundle 1,9 MB, TBT 5,4 s com CPU 4× local; P-PERF-1), contraste no tema claro (**corrigido** após VR-1: `--color-text-muted` #605d53, `--color-success` #256841, `--color-warning` #8a4f10, todos ≥ 4,5:1), ordem de títulos h1→h3 (**corrigido**: h2), alvos do resumo de erros (**corrigido**: min-height), bottom sheet cobre o mapa no mobile (P-UX-2), base do mapa clara no tema escuro (P-UX-3), atribuição cortada no modo DEMO desktop (P-UX-4), alvos de 21–32 px em links de atribuição/zoom (P-UX-5), rodapé com "[A definir]" (conteúdo). Pontos positivos: legenda com unidade, cálculo, fonte e versão; selos validado/DEMO; estados claros; sem overflow horizontal em 390 px; combobox operável por teclado (setas, Enter, Esc); reduced motion sem animações (`getAnimations()` = 0); tema escuro sem violações de contraste.**

## 11. Evidência de testes

| Comando ou caso | Executado? | Resultado | Log/arquivo |
|---|---|---|---|
| `npm run lint` | sim | 0 erros, 1 warning (fast-refresh em helper de teste) | — |
| `npm run format:check` | sim | OK | — |
| `npm run typecheck` (app, worker, node) | sim | OK | — |
| `npm run test` (unit jsdom + worker node) | sim | **20 arquivos, 171 passando, 3 expected-fail** (QA F05/F06/F07 pendentes, `it.fails`) | `worker/tests/*`, `src/tests/*`, `shared/**/*.test.ts` |
| `npm run test:db` (RLS real, TARGET dev) | sim | **27 passando, 9 pulados** (ao vivo do QA, exigem `QA_WORKER_URL`) | `supabase/tests/rls.test.ts`, `qa-worker-live.test.ts` |
| QA ao vivo (`QA_WORKER_URL` + wrangler 8798) | sim (pelo QA-1) | 9/9 | `supabase/tests/qa-worker-live.test.ts` |
| `scripts/db/smoke-worker.ts` (API ponta a ponta, TARGET real) | sim (BE-1) | 33/33 | `docs/API_CONTRACTS.md` |
| Validação de UI no navegador contra Worker+TARGET (FE-2) | sim | 17/17 passos (cadastro 201, proposta 201, verificação, retorno do link, atividade 201, admin aprova/rejeita, obrigado exato/município) | relato FE-2; capturas `docs/screenshots/*-2026-10-09.png` |
| `npm run test:e2e` (Playwright, build + wrangler `--env local`, Chromium 1248) | sim | **14 passando** (home smoke + registration smoke × desktop/mobile) | `e2e/*.spec.ts` |
| `npm run build` | sim | OK (index 632 KB / 198 KB gz; maplibre 1.024 KB / 277 KB gz lazy; supabase 218 KB / 57 KB gz lazy) | `dist/` |
| `npm run check:isolation` | sim | OK, 2.012 arquivos | — |
| `npm run data:validate` | sim | 903/903, 0 erros, 1 advertência (sub judice) | `public/data/manifest.json` |
| ETL `--dry-run`, spike Mariana, `--all-mg`, `etl:build` | sim | ver §9 | `docs/ELECTORAL_EXPORT_REPORT.md` |
| Verificação CSP no navegador (home + território via Worker) | sim | headers presentes, 1 canvas, **0 erros de console** | script temporário (não versionado) |
| Lighthouse 13.5 mobile (CPU 4×, local, via Worker) | sim (VR-1) | home: Perf 36 / A11y 96 / BP 96, LCP 7,6 s, TBT 5,4 s, CLS 0,007; território: Perf 30 / A11y 95 / BP 96, LCP 5,4 s, TBT 2,4 s, CLS 0,364 | `docs/screenshots/final/lighthouse-*.json` |
| axe-core (desktop; home, território, atividade, participar) | sim (VR-1) | serious: color-contrast (5/5/3/2 nós — corrigido nos tokens após a medição, **não re-medido**), target-size (4 links do resumo de erros — corrigido, não re-medido); moderate: heading-order (corrigido); home escuro: 0 violações | `docs/screenshots/final/_resultados.json` |
| Casos T01–T30 | ver `docs/TEST_PLAN.md` | cobertos: T01–T12, T14–T18, T20–T24, T26–T29; **T13** (link aprovado aparece) validado por UI; **T19** por desenho (snapshot estático) + e2e sem Worker não executado; **T25** não aplicável nesta rodada (sem horário de verão); **T30** parcial (ARIA por testes/inspeção; leitor de tela real NÃO EXECUTADO) | |
| CI GitHub Actions | NÃO EXECUTADO (sem remoto) | — | `.github/workflows/ci.yml` |
| Testes de carga/abuso | NÃO EXECUTADO (sem ambiente autorizado) | — | — |

## 12. Segurança e privacidade

Checklist: segredos só em `.dev.vars`/`.env` (gitignored) e `~/.minas-em-movimento/`; varredura de `eyJ`/`sb_secret`/refs nos arquivos commitados: nenhum; `VITE_*` só público; service role só no Worker; RLS default-deny com grants por coluna; views `security_invoker`; PII nunca em resposta pública (T14 + QA); logs sem PII/tokens (verificado nos logs do wrangler: 0 ocorrências); erros genéricos com `request_id`; CSP/`frame-ancestors 'none'`/Permissions-Policy na SPA; cookies `HttpOnly`/`SameSite=Lax`; sem open redirect no retorno (allow-list interna); sanitização de texto; Turnstile uso único (chave real); `check:isolation` no CI.

Revisão independente: QA-1 (§8 e `docs/SECURITY.md`), 0 críticos/altos; corrigidos F01, F02, F03, F07, F08, F13, F15; pendentes F04, F05, F09–F12, F14, F16, F17, I01, I03. `npm audit` NÃO EXECUTADO. Vulnerabilidades conhecidas: pré-sequestro de perfil (I01/P-SEC-1); cota de e-mail (F04); enumeração de e-mail no cadastro (F10, decisão). Pendências legais: política de privacidade/termos são rascunhos; base legal, controlador, retenção e canal do titular exigem revisão jurídica (P-LEGAL-1) **antes de qualquer cadastro real**.

## 13. Desempenho e custos

**Medido:** build Vite 7–12 s; chunk inicial 632 KB (198 KB gzip) + react 104 KB; MapLibre 1.024 KB (277 KB gzip) carregado sob demanda; supabase-js 218 KB (57 KB gz) sob demanda; índice de territórios 2,1 MB (JSON, comprimível); métricas por município mediana 45 KB (BH 2,2 MB); malha IBGE ver `public/geo/README.md`; testes unit+worker 6,4 s; e2e 27 s; consultas do ETL ≤ 6,1 s. Lighthouse mobile (local, CPU 4×): home Perf 36, A11y 96, BP 96, LCP 7,6 s, TBT 5,4 s, CLS 0,007; território Perf 30, A11y 95, BP 96, LCP 5,4 s, TBT 2,4 s, CLS 0,364. **Abaixo das metas da spec §12.15 (Perf ≥ 85, LCP ≤ 2,5 s)** — causas: MapLibre (1,05 MB) carregado na home (página do mapa) e index 648 KB; CLS do rodapé/lista de bairros. Medição local com throttling; INP não reportado em modo navegação (TBT usado).
**Estimado (sem deploy, sem medição real de Workers):** páginas e dados são Static Assets (sem custo de invocação); só `/api/*` invoca o Worker. Premissas: 10 mil visitas/mês ≈ 30–50 mil invocações de API (dentro do Free: 100 mil/dia); 100 mil visitas ≈ 0,3–0,5 M invocações/mês (Free ou Paid US$ 5); 1 milhão ≈ 3–5 M invocações (Paid, ~US$ 5–10). Supabase TARGET: projeto pago (compute cobrado por projeto, ver painel); SMTP próprio necessário. Dependências pagas atuais: apenas o projeto TARGET. `public/data` com 71 MB no Git/Assets: considerar R2 futuramente.

## 14. Alterações e diff

Commits (local, `main`): `b42c921` fundação; `1d3e10c` snapshot + relatório de exportação; `ee2b806` fix isolamento/tipagem; `.gitattributes`; `a05f428` backend; `599130e` frontend base; `9720592` correções QA; `becc51d` docs F06; `aefb63a` formulários/auth/admin; (+ este relatório). Principais árvores: `shared/` (contratos), `worker/` (32 arquivos), `supabase/` (9 migrations, config, seed, testes), `src/` (114 arquivos), `scripts/` (ETL, validação, db, hooks), `public/data` (903 arquivos), `public/geo`, `docs/` (16 documentos + ADRs + capturas), `e2e/`. Dependências: ver `package.json` (fixadas; `motion` removido; `@eslint/js` adicionado). Mudanças potencialmente incompatíveis: `wrangler dev` agora exige `--env local`; `ActivityPatch` sem defaults; `SendLinkResponse`/`ConfirmEmailResponse` alinhados ao Worker. ~22,6 mil linhas de TS/TSX/SQL/CSS (sem tipos gerados).

## 15. Pendências priorizadas

| ID | Gravidade | Impacto | Como corrigir | Responsável sugerido |
|---|---|---|---|---|
| P-SEC-1 | alta | E-mail alheio vinculado a perfil provisório; vítima herda nome/telefone/território ao entrar | Na promoção, exigir revisão/reset dos dados do perfil; permitir editar telefone em `PATCH /me`; e-mail informativo ao dono | backend-engineer + Fable |
| P-SEC-3 (F04) | alta | Cota global de e-mail esgotável → ninguém confirma/loga | SMTP próprio; throttle por hash de e-mail; captcha nativo do Auth | proprietário (SMTP) + backend |
| P-LEGAL-1 | alta (bloqueia cadastro real) | LGPD: base legal, controlador, retenção, textos | Revisão jurídica; finalizar `/privacidade` e `/termos` | proprietário |
| P-DATA-2 (F06) | média | Extrator usa `postgres` via login role do CLI | Criar usuário SELECT-only no SOURCE; `ELECTORAL_SOURCE_DATABASE_URL` | proprietário + Fable |
| P-AUTH-1 | média | MFA TOTP sem enrolamento; admin só com bypass local | Tela de enrolamento/verificação TOTP; remover bypass fora de local (já) | feature-builder |
| P-SEC-4 (F05) | média | Rate limit por IP penaliza eventos presenciais/CGNAT | Chavear RSVP por IP+atividade+identidade | backend-engineer |
| P-INFRA-1 | média | Sem deploy/staging/Turnstile real/WAF | Autorizar Cloudflare; `wrangler login`; widget Turnstile; `env.staging` | proprietário |
| P-DATA-1 | média | Amostragem manual de 10 municípios vs TSE não feita | Script de conferência contra totais oficiais | Fable + Haiku |
| P-SEC-5 (F09/F12/F14/F10/F11) | baixa | Coordenadas fora de MG, `starts_at` sem teto, `Origin`, enumeração, oráculo de idempotência | Validações adicionais (testes `it.fails` já prontos) | feature-builder |
| P-UX-1 | baixa | Rascunho de atividade perdido em outra aba; sessão provisória antiga sem "começar de novo"; `/admin` fora da allow-list de redirect | Persistir rascunho em `localStorage` com TTL; botão "sair e recomeçar"; incluir `/admin` | feature-builder |
| P-PERF-1 | média | Perf mobile 36/30, LCP 5–7,6 s, TBT alto | Adiar init do MapLibre até após LCP (placeholder estático), code-splitting do index, remover 330 KiB de JS não usado, preconnect dos tiles | frontend-engineer |
| P-PERF-2 | média | CLS 0,36 no território mobile | Reservar altura/skeleton para a lista de bairros e rodapé | frontend-engineer |
| P-UX-2..5 | baixa | Bottom sheet cobre o mapa; mapa claro no tema escuro; atribuição cortada no DEMO; alvos pequenos de atribuição/zoom | Estados recolhido/meio; estilo escuro do basemap; descontar selo na altura do mapa; aumentar alvos | frontend-engineer |
| P-DATA-3 | baixa | 2º turno 2026 e parâmetro de eleição no pipeline | Parametrizar `round`/`cd_eleicao` após 25/10 | Fable |
| P-OPS-1 | baixa | `.claude/settings.json` não aplicado; CI não rodou | Copiar `docs/claude-settings.proposed.json`; criar remoto e rodar CI | proprietário |

## 16. Decisões pedidas ao proprietário

1. **Enumeração de e-mail no cadastro (F10):** manter 409 (UX clara; recomendado para o MVP, risco baixo e documentado) ou responder sempre 202 neutro (mais privado; UX pior). **Recomendação:** manter 409.
2. **Conteúdo do snapshot para proporcionais (D07):** top 10 + rastreadas por território (atual; leve) ou todas as 1.737 candidaturas (arquivos 5–10× maiores). **Recomendação:** manter top 10 e oferecer busca por candidatura em rodada futura.
3. **Onde publicar `public/data` (71 MB):** Static Assets/Git (simples, atual) ou R2 (menor repo, custo baixo). **Recomendação:** manter nesta fase; R2 quando houver 2º turno.
4. **SMTP transacional e domínio remetente** (necessários para qualquer cadastro real).
5. **Credencial SELECT-only no SOURCE** para a próxima extração.
6. **Autorizar Cloudflare (conta, Turnstile real, staging)** para converter "código escrito" em "integração validada".

## 17. Instruções para executar e testar

```bash
npm ci
cp .env.example .env && cp .dev.vars.example .dev.vars   # preencher com o TARGET (já preenchidos nesta máquina)
npm run dev:worker          # http://127.0.0.1:8787 (wrangler dev --env local)
npm run dev                 # http://127.0.0.1:5173 (proxy /api)
# ou build + Worker servindo tudo:
npm run build && npx wrangler dev --env local --port 8790
```

Rotas para validar: `/` (buscar "Mariana", trocar camadas, clicar município/bairro, copiar link e reabrir), `/territorio/mg-3140001`, `/territorio/mg-3140001-centro`, `/participar?territorio=mg-3140001-centro` (Turnstile de teste passa sozinho), `/obrigado`, `/propor-grupo?territorio=…`, `/criar-atividade` (sem sessão → orientação; provisória → verificação), `/admin` (precisa de admin: `APP_ENV=local npx tsx scripts/db/bootstrap-admin.ts` com `ADMIN_EMAILS` em `.dev.vars`; sessão via link gerado: ver `scripts/db/spike-anon-email-link.ts`), `/metodologia`, `/privacidade`, `/404`.

Testes: `npm run ci` (lint, format, typecheck, unit+worker, isolamento, validação de dados, build); `npm run test:db` (RLS real); `npm run test:e2e`; `QA_WORKER_URL=http://127.0.0.1:8790 npx vitest run --config vitest.db.config.ts supabase/tests/qa-worker-live.test.ts` (ao vivo). Dados: `npm run etl:export -- --dry-run`; reconstrução em `docs/IMPORT_GUIDE.md`. Modo DEMO: `VITE_SNAPSHOT_BASE=/sem-snapshot npm run dev`.

Dados de teste residuais no TARGET dev (sem PII real, e-mails `@example.org`/`mailinator`/`.local`): usuários `fe2-*`, admin `admin.dev@minasemmovimento.local`, grupos inativos, 1 atividade cancelada, `audit_events`/`abuse_events` append-only. Podem ser apagados via painel/admin API antes de uso real.

## 18. Próxima rodada sugerida

1. **Hardening de Auth e e-mail:** P-SEC-1, P-SEC-3, P-AUTH-1 (MFA TOTP), fluxo de recuperação. Aceite: testes negativos de sequestro passam; e-mail real entregue por SMTP próprio; admin exige aal2 em staging.
2. **Staging na Cloudflare:** `wrangler login`, Turnstile real, WAF por rota, `env.staging`, deploy e URL verificada. Aceite: Siteverify real com action/hostname; smoke e e2e contra staging; Lighthouse ≥ metas.
3. **Dados:** usuário SELECT-only, amostragem de 10 municípios vs TSE, parametrização de turno, R2 se necessário. Aceite: relatório de amostragem com ≤ 0,1 % de divergência explicada; pipeline roda com `db-url`.
4. **Pendências de validação e UX:** F05/F09/F10–F12/F14/F16, rascunho persistente, "começar de novo", `/admin` no redirect, status "suspenso", endpoint auditado para revelar contato. Aceite: `it.fails` convertidos em testes verdes.
5. **Jurídico e conteúdo:** política de privacidade/termos finais, organização responsável, canal de contato, metodologia revisada; auditoria de identidade quando a arte chegar (`docs/IDENTITY_AUDIT.md`).

## 19. Checklist de veracidade

- [x] Nenhum mock foi declarado como real. (Turnstile de teste, e-mail não entregue, MFA bypass e fixtures DEMO estão explicitados.)
- [x] Nenhum teste foi alegado sem execução. (Números por suíte em §11; NÃO EXECUTADOS marcados.)
- [x] Nenhuma URL de staging foi inventada. (SEM DEPLOY.)
- [x] Riscos de segurança estão destacados. (§12, §15, `docs/SECURITY.md`.)
- [x] Screenshots correspondem à versão/commit relatados. (FE-1 `599130e`, FE-2 `aefb63a`, finais em `docs/screenshots/final/` com commit no nome.)
- [x] Dados eleitorais têm origem identificada; status demo/parcial/real é inequívoco. (`validated`, MG completa, 2026 1º turno; 2022 só 2 candidaturas.)
- [x] O projeto SOURCE foi identificado. (Alias + nome; ref omitido.)
- [x] Nenhuma escrita, migration, `db reset`, modificação de configuração ou upgrade ocorreu no SOURCE. (Ressalva: role de login temporário gerido pela plataforma pelo CLI, documentado em §9 e `DATA_SOURCE_AUDIT.md` §7.)
- [x] Os relatórios `DATA_SOURCE_AUDIT.md` e `ELECTORAL_EXPORT_REPORT.md` existem.
- [x] Não há segredo ou conexão do SOURCE no frontend/Worker/CI pública. (`check:isolation` em 2.012 arquivos.)
- [x] O relatório foi gerado em arquivo .md. (Este arquivo; cópia na raiz `RELATORIO_PRIMEIRA_RODADA.md`.)

---

# ADENDO — RODADA 2 (execução autônoma após "toca tudo que pode tocar sem mim")

**Data e hora (America/Sao_Paulo):** 2026-10-09 02:21 (adendo) / fechamento após QA-2 e correções no commit seguinte · **Commits da rodada 2:** `10e9169` … `9bb44d0` (integração), `df3a5b3` (QA2-06/11), fechamento BE-3 · **Ambiente:** local + TARGET dev · **SEM DEPLOY** (não autorizado).
**Agentes:** BE-2 (Opus, 27 min, 287k tokens), FE-3 (Opus, 121 min, 521k), DATA-2 (Sonnet, 16 min, 187k), QA-2 (Opus, ver §R2-6). Os agentes customizados de `.claude/agents` passaram a ser reconhecidos pela instalação durante esta rodada (QA-2 rodou como `qa-security`).

## R2-1. O que mudou (tudo real, validado contra Worker local + TARGET dev)

| Área | Entrega | Evidência |
|---|---|---|
| P-SEC-1 pré-sequestro de perfil | `confirm-email` marca `review_required_at`; `GET /me` expõe `phone_masked`/`profile_review_required`; `PATCH /me` aceita telefone e `profile_reviewed`; organizador bloqueado (403) até revisar; tela "Confira seus dados" no retorno do magic link; gate em `/criar-atividade` e `/minhas-atividades` | `worker/tests/round2.test.ts`, `src/features/account/*`, validação real 17/17 (`docs/screenshots/final-r2/_validacao-real.json`) |
| P-AUTH-1 MFA TOTP | `/conta/seguranca` (enrolar/verificar/remover fator), `MfaGate` em `/admin`; `reveal-contact` exige aal2 **sem bypass** | enrolamento real + código RFC 6238 gerado em Node → JWT aal2 → `/admin` sem bypass (Worker temporário com `APP_ENV=staging`: aal1 → 403) |
| F05 rate limit | RSVP por IP+atividade+identidade (10/10min) com teto por IP 120/10min; cadastro por IP+sujeito; CGNAT documentado | `worker/tests/round2.test.ts` |
| F09/F12/F14/F11/F16/I03 | bbox MG e tetos de data (Worker + CHECK no banco); validação de `Origin`; idempotência escopada por dia e liberada após decisão; cache de borda 60 s com purga; checagem de `RSVP_DEVICE_SECRET` | testes QA F05/F07 convertidos de `it.fails` para verdes; smoke 53/53 |
| Suspensão e revelação | `POST /admin/{groups,activities}/:id/{suspend,unsuspend}`, `POST /admin/group-proposals/:id/reveal-contact` (auditado, `retention_class='security'`), `AdminGroupProposal.group_id`; PATCH não reativa grupo suspenso | smoke; `supabase/tests/round2.test.ts`; UI com filtros "Suspensos", confirmação e aviso de auditoria |
| Limpeza TARGET dev | `scripts/db/cleanup-dev-data.ts` (dry-run → `--yes`): 2 usuários, 2 perfis, 2 propostas, 2 grupos, 1 atividade removidos; `audit_events` preservado (118) | relato BE-2 |
| P-PERF-1/2 | mapa inicia após LCP + idle com placeholder; índice de territórios sob demanda; supabase-js só com sessão; chunk inicial 648 KB → **349 KB (110 KB gz)**; CLS do território **0** | Lighthouse mobile (CPU 4×, mediana de 3): home Perf 38 → **69**, LCP 6,7 s → **1,9 s**; território 25 → **62**, LCP 7,0 → 3,0 s, CLS 0,287 → **0**; A11y 100/100 (`docs/screenshots/final-r2/_lighthouse-*.json`) |
| P-UX-1..5 | rascunho em `localStorage` (7 dias), "usar outro e-mail" no 409, bottom sheet 3 estados, basemap escuro, swatch "sem dado" com contorno, alvos ≥ 44/24 px, `--color-border-strong` ≥ 3:1 | capturas `docs/screenshots/final-r2/*-20261009-0a2c6cf.png` |
| Acessibilidade | axe (WCAG 2.x A/AA + best-practice) em 7 telas × desktop/mobile + escuro + sheet: **0 violações** em 16 execuções | `docs/screenshots/final-r2/_resultados-r2.json` |
| P-DATA-3 | `--year/--round/--election-codes`; releases coexistem com `release-manifest.json`; `manifest.json` = ponteiro; `--no-activate`; rollback documentado | `docs/IMPORT_GUIDE.md` §7–8; 38 testes unitários de scripts |
| F17 | modo `db-url` com driver em processo, sem segredo em argv; `assertReadOnlySql` reforçado (`INTO`, `set_config`, `pg_sleep`, `dblink`, comentários) | `scripts/import-electoral/source.test.ts` |
| P-DATA-1 amostragem TSE | 10 municípios (BH, Mariana, Contagem, Juiz de Fora, Uberlândia, Montes Claros, Poços de Caldas, Teófilo Otoni, Gov. Valadares, Serra da Saudade) contra os dados abertos oficiais do TSE (zips de 08/10/2026 lidos por HTTP Range com CRC): **330 indicadores, 312 idênticos, 18 divergentes, todos explicados**; aptos/comparecimento/abstenção/brancos/válidos dos 5 cargos: 90/90 idênticos; total do estado idêntico ao TSE | `docs/TSE_SAMPLE_REPORT.md` |
| Validador | Σ municípios = estado, Σ bairros = município (tolerância 0), `share_of_valid`, `delta_pp`, órfãos; teste negativo com arquivo adulterado → 39 erros | `npm run data:validate`: 902/902, 0 erros |
| Snapshot | "Nº 28" (sem nome/partido; 561 votos; nulo técnico no TSE) deixou de ser listado como candidatura (D18); totais da fonte intactos | `public/data` reconstruído: 902 arquivos |

## R2-2. Evidência de testes (rodada 2)

| Comando | Resultado |
|---|---|
| `npm run ci` (lint, format, typecheck, unit+worker, isolamento, validação de dados, build) | verde; **313 testes passando, 1 expected-fail** (F10 enumeração — decisão do proprietário) após as correções da QA-2; isolamento OK em 2.088 arquivos |
| `npm run test:db` | **35 passando**, 16 pulados (ao vivo sem `QA_WORKER_URL`) |
| QA ao vivo (`qa-worker-live` + `qa2-live`) | 16/16 (BE-3) |
| `scripts/db/smoke-worker.ts` (porta 8797) | **53/53** (inclui aal2 real) |
| `npm run test:e2e` | **22 passando** (home, cadastro, rodada 2 × desktop/mobile) |
| Validação real de UI (`scripts/visual/r2-validate.mjs`) | 17/17 |
| Lighthouse / axe / CLS | ver R2-1 |
| `npm audit` | 0 vulnerabilidades |
| `npx tsx scripts/tse/sample-check.ts` | 330 comparações, 312 idênticas |
| **CI GitHub Actions** (`luqmarqs/minas-decide`, público) | run 4 em `13145d5`: `verify` (lint, format, typecheck, 313 testes, isolamento, validação, build) e `db-tests` **verdes**. Runs 1–3 falharam por: `secrets` em `if` de job (parse), e testes de formulário que dependiam do `.env` local para a sitekey do Turnstile — reproduzido em Linux via WSL e corrigido fixando `VITE_*` de teste no `vitest.config.ts` |

## R2-3. Descobertas sobre os dados (honestas)

- A fonte conta como "candidatura" um número sem nome nem partido (Presidente nº 28, 561 votos em MG) que o TSE classifica como **nulo técnico**; isso explica a diferença de 561 entre comparecimento e válidos+brancos+nulos (relatório §9). Decisão D18: não listar; totais intactos.
- Candidatura a Governador nº 29 (PCO) tem registro **anulado sub judice** no TSE: a fonte soma seus votos à candidatura, mas o TSE os exclui dos válidos. A fonte não traz esse status; a participação nos válidos dessa candidatura fica superestimada (ex.: 238 votos em BH). Documentado na metodologia; corrigir exigiria usar os dados do TSE como fonte complementar (decisão do proprietário).
- Perf local ≥ 70 ficou em 69 na home; o restante do TBT é o próprio MapLibre. Meta de produção (≥ 85) só mensurável com deploy.

## R2-4. Pendências que continuam exigindo o proprietário

SMTP transacional (P-SEC-3; a cota padrão voltou a estourar com 4 cadastros de teste); conta Cloudflare/Turnstile real/staging (`docs/STAGING_PLAYBOOK.md`); usuário SELECT-only no SOURCE (P-DATA-2); revisão jurídica (`docs/PRIVACY_LGPD_DRAFT.md`); decisões: 409 na enumeração (F10), top 10 proporcionais, Git vs R2, uso do TSE para marcar sub judice; copiar `docs/claude-settings.proposed.json`; remoto Git para o CI (**feito**: `https://github.com/luqmarqs/minas-decide`, CI verde).

## R2-5. Pendências técnicas restantes (sem bloqueio)

Deep link `?t=` no mobile abre o sheet no estado meio sem rolar ao mapa; fila do admin não recarrega sozinha após decisão (há botão); `GroupSuspensionResult`/`ActivitySuspensionResult` ainda espelhados em `src/features/admin/api.ts` (mover para `shared/contracts`); índice de territórios de 2,2 MB poderia ser dividido; `manifest.json` (162 KB) poderia separar os hashes; invalidação de cache entre colos (até 60 s); 2º turno depende de confirmar códigos e totais por turno no SOURCE; leitor de tela real/Safari/iOS não testados.

## R2-6. Auditoria QA-2

{QA2}

---

# ADENDO — STAGING NA CLOUDFLARE (2026-10-09)

**URL verificada:** https://minas-em-movimento-staging.luq-marqs.workers.dev (Worker `minas-em-movimento-staging`, versão `7c8b9a59…`, env `staging`, conta workers.dev `luq-marqs`).

| Item | Status | Evidência |
|---|---|---|
| Autenticação Cloudflare | API Token do proprietário (OAuth do Wrangler falhou 3× com `request_forbidden` — cookie CSRF do painel) | `wrangler whoami` com token; token guardado fora do repo |
| Turnstile real | widget **Managed** `minas-em-movimento-staging` criado via API (`/challenges/widgets`), domínios: host de staging, `localhost`, `127.0.0.1`; sitekey no `.env.staging`, secret como secret do Worker | resposta da API `success: true` |
| Secrets de staging | `SUPABASE_TARGET_URL/ANON/SERVICE_ROLE`, `TURNSTILE_SECRET_KEY` (real), `RSVP_DEVICE_SECRET` (novo), `ADMIN_EMAILS` | `wrangler secret list --env staging` = 6 |
| Vars de staging | `APP_ENV=staging`, `WRITES_ENABLED=true`, `PUBLIC_ORIGIN`, `TURNSTILE_EXPECTED_HOSTNAMES` = host de staging | `wrangler.jsonc` `env.staging` |
| Auth do TARGET | `additional_redirect_urls` += `https://minas-em-movimento-staging.luq-marqs.workers.dev/autenticacao/retorno` via `supabase config push` | `supabase/config.toml` |
| Deploy | `vite build --mode staging` + `wrangler deploy --env staging`: Worker 1.677 KB (305 KB gz), assets enviados em 35 s | saída do deploy |
| Verificação | `/api/v1/health` 200 (`writes_enabled: true`); CSP e `X-Frame-Options` na SPA; `/territories/mg-3140001` 200 (banco); `/groups` 200 com `X-Cache: MISS` e `max-age=60`; `/data/manifest.json` 200; RSVP em id inexistente → 404 | `curl` |
| E2E contra staging | **22/22** (`E2E_BASE_URL=…`) | Playwright |
| Cadastro real com Turnstile Managed em headless | **NÃO CONCLUÍDO**: o widget não liberou o token em navegador headless (comportamento esperado do modo Managed com automação); o formulário bloqueou o envio com a mensagem correta | `docs/screenshots/final-r2/staging-participar-resultado-20261009.png` |
| Cadastro real em navegador humano | **PENDENTE — proprietário** (abrir `/participar`, cadastrar, confirmar e-mail; depende também de SMTP próprio, P-SEC-3) | — |

**Limitações desta publicação:** banco de staging é o mesmo projeto TARGET dev (dados de teste vão para lá; criar projeto Supabase de staging antes de uso real); sem domínio próprio (workers.dev); HSTS gerido pela Cloudflare no `workers.dev`; admin em staging exige fator TOTP verificado (o admin dev ainda não tem — enrolar em `/conta/seguranca` após entrar por magic link, que por sua vez depende da cota de e-mail); token de API transitou pelo chat — **rotacionar**.

---

# ADENDO — RODADA 3: IDENTIDADE OFICIAL, CAMPANHA E NARRATIVA (2026-10-09 15:21)

**Commits:** `19cee85` (identidade Minas Decide como padrão), `4b79e9f`/`c55beca` (dados 2022 do TSE, margem, highlights, POIs), `a9739c7` (produto). **Staging:** https://minas-em-movimento-staging.luq-marqs.workers.dev (redeploy após cada etapa). **Decisões:** D21–D27 em `docs/DECISIONS.md`.

| Pedido do proprietário | Entrega | Evidência |
|---|---|---|
| Arte oficial "MINAS DECIDE" | auditoria (`docs/IDENTITY_AUDIT.md`), tema padrão com paleta medida (céu #067fa8, sol #e8ba1f, creme #ebd6ca, oliva #262824), Anton/Bungee Outline (OFL, self-hosted, só hero/selos/lockup), sol vetorial como marca e favicon, hero com a chave visual; rollback `?brand=0` | `docs/screenshots/brand/final/`, contraste 100 % na meta, axe 0 |
| Nome "Minas Decide" | interface, título, metadados, README, CLAUDE.md, agentes | `index.html`, `AppHeader`, `AppFooter` |
| Sem destaque para Duda/Iza | seção e camada de candidaturas rastreadas removidas; `comparison_2022: []` | snapshot reconstruído (904 arquivos) |
| Lula × Bolsonaro 2022→2026 | 2022 (1º e 2º turnos) dos **dados abertos do TSE**, município exato (853/853 batem com o oficial) e bairro aproximado (99,39 % dos votos casados; 20 bairros de 5 municípios `unavailable`); bloco no painel e camada `president_comparison`; MG: Lula 48,29 % → 43,33 % (−4,96 p.p.), Jair → Flávio Bolsonaro 43,60 % → 48,24 % (+4,64 p.p.) | `docs/ELECTORAL_EXPORT_REPORT.md` §10 |
| Cards "por que Minas" | `highlights.json` com 30 itens com fonte (MG = 16.372.372 aptos, 10,31 % do eleitorado nacional, 2º maior; 2022 r2: Lula venceu em MG por 49.650 votos, 0,40 p.p.; etc.) e `WhyMinasStrip` | `public/data/mg-2026r1-20261008/highlights.json` |
| Busca com zoom | hero → mapa rola, dá zoom e abre painel/sheet (e2e desktop e mobile) | `e2e/rodada3.smoke.spec.ts` |
| Atividades no mapa com "Eu vou" | marcadores sempre visíveis sobre qualquer camada, popover com RSVP e compartilhar; 3 atividades `[EXEMPLO]` publicadas (BH, Contagem, Juiz de Fora; coordenadas via Nominatim) | `scripts/db/seed-example-activities.ts`; staging devolve 3 |
| Terminais de grande circulação | camada `pois` com 380 terminais/estações do OpenStreetMap (ODbL) via Overpass; lista no território | `public/data/pois/terminais-mg.json` |
| Tema Lula | "Minas decide. Minas decide Lula." no hero; textos de mobilização; rodapé com responsável **[a definir]** (pendência legal) | capturas `docs/screenshots/rodada3/` |
| Conceito "o mapa sólido assusta" | `StoryIntro` em 5 passos com mapas SVG próprios de MG (margem 2026 r1 e 2022 r2 por município): Lula liderou em **452** municípios em 2026 r1 e em **564** em 2022 r2; **5.405.888 pessoas (33,02 % dos aptos) não votaram em nenhum dos dois** em 2026 r1 (abstenção 3.735.098 + brancos/nulos 661.039 + outras candidaturas 1.009.751, grupos distintos) | highlights + `src/features/story/` |
| Compartilhar via WhatsApp | `wa.me` com título, data/hora (America/Sao_Paulo), local e link em atividades; território e hero | `src/lib/share.ts`, testes |
| Abstenção alta onde Lula liderou | camada `mobilization` (abstenção só nos territórios liderados por Lula; escala neutra) + ranking "Onde a abstenção pesa mais" no estado e nos municípios, com abstenções absolutas e margem | `src/features/electoral-map/mobilization.ts`, `MobilizationBlock` |

**Validação:** `npm run ci` verde (377 testes unit/worker + 1 expected-fail), isolamento OK em 2.133 arquivos, `data:validate` 904/904 sem erros, amostragem TSE 312/330 (inalterada), E2E **30/30**, axe 0 violações em 10 telas (FE-6) e 18 execuções (FE-5), staging respondendo com as 3 atividades.

**Ressalvas honestas:** cores partidárias existem apenas na camada de margem e na narrativa (D25); a camada de mobilização é priorização territorial agregada, rotulada como não-inferência; o `BottomSheet` (vaul) esconde a página de leitores de tela no mobile — contornado, mas precisa de correção definitiva; o agente enviou uma vez o e-mail do proprietário no `User-Agent` de uma consulta ao Nominatim (sem outros dados; não se repete); as atividades `[EXEMPLO]` ficam publicadas até serem arquivadas; **responsável legal pelo conteúdo de campanha continua pendente e bloqueia divulgação**; cadastro real com Turnstile em navegador humano ainda não testado pelo proprietário; SMTP próprio pendente (P-SEC-3).

