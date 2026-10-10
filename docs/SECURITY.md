# Segurança — backend (BE-1 rodada 1, BE-2 rodada 2, BE-5 Clerk)

## Matriz de grants testada no TARGET dev (BE-5, migration 0012)
Rodada `QA_WORKER_URL=http://127.0.0.1:8793 npm run test:db` em 2026-10-09: `supabase/tests/rls.test.ts` **27 de 27 passaram**. Desde a 0012 o navegador não fala com o Supabase (ADR 0005): o papel `anon` não alcança nada, e não existem mais sessões `authenticated` (sign-in anônimo e signup do Supabase Auth desligados).

| Tentativa | Resultado real |
|---|---|
| anon lê `app_private.*` pelo caminho público / com `Accept-Profile: app_private` | negado (404 `PGRST205` / 406 `PGRST106`) |
| anon lê `territories`, `whatsapp_groups`, `whatsapp_groups_public`, `activities`, `activities_public` | negado (401/403 `42501`) — grants revogados em 0012 |
| anon INSERT/UPDATE em `activities` / `whatsapp_groups` | negado; nada muda |
| anon chama `svc_*` (inclusive `svc_grant_admin`, `svc_erase_user_data`) e `activity_rsvp_count` | negado (401/403) |
| `svc_dev_wipe_identities` (QA3-09, migration 0013) | removida do banco; teste em `rls.test.ts` espera `PGRST202` — **só passa depois de aplicar a 0013** |
| `POST /auth/v1/signup` com a anon key (e-mail+senha) | 422 `signup_disabled`, nenhum usuário criado (L13) |
| sign-in anônimo no Supabase Auth | recusado (Q03) |
| view `activities_public` (lida pelo Worker com service role) expõe criador, motivo ou contato bruto | não |
| contato público desligado | some imediatamente da view (colunas geradas, T27) |
| id de usuário fora do formato Clerk (`uuid`, injeção) em perfil/admin | `23514` (CHECK `*_clerk_id_check`) |
| `upsert_rsvp` repetido pela mesma identidade (cookie ou id do Clerk) | 1 linha; outra identidade cancelando → `PT404`; atividade cancelada → `PT409` |
| T28: dois admins aprovando a mesma proposta em paralelo | 1 sucesso, 1 `PT409`, 1 grupo |
| não admin chamando a aprovação | `PT403` (rechecagem dentro da função) |
| `consume_turnstile_token` com o mesmo hash 2× | `true`, `false` |

Resíduos dos testes: território sandbox `mg-9xxxxxx` apagado por cascata; identidades sintéticas e usuários de teste do Clerk apagados com `svc_erase_user_data` + `users.deleteUser`. `audit_events` fica (append-only, sem PII).

## Autenticação — Clerk (ADR 0005, BE-5)

**Desenho.** Identidade = Clerk (instância dev `pk_test_`/`sk_test_` em local e staging; produção exige instância `live`). Supabase é só banco: o Worker usa `service_role`; o navegador não recebe chave do Supabase para dados. O cadastro verifica o e-mail **antes** de existir sessão (código por e-mail no Clerk), então desaparecem a sessão provisória, o vínculo de e-mail sem confirmação, o magic link do Supabase, a promoção e a revisão de perfil (P-SEC-1). Rotas `POST /auth/send-link` e `POST /auth/confirm-email` removidas (404).

**Verificação no Worker** (`worker/middleware/auth.ts` + `worker/repositories/clerk.ts`):
1. `Authorization: Bearer <session token>` (JWT RS256, 60 s). `verifyToken` do `@clerk/backend` com `CLERK_SECRET_KEY` (JWKS buscado na Backend API e cacheado no isolate; opcional `CLERK_JWT_KEY` com a chave PEM para verificar sem rede). Folga de relógio 5 s (60 s só com `APP_ENV=local`: a máquina de dev estava ~33 s atrasada). **QA3-05:** falha de rede/JWKS/configuração (`jwk-remote-failed-to-load`, `secret-key-invalid` etc., ou erro sem `reason`) → 503 `SERVICE_UNAVAILABLE` ("Serviço de autenticação indisponível, tente de novo", `Retry-After: 5`), log só com o `reason`; token ruim (assinatura, expiração, `kid`) → 401.
2. `sub` precisa casar com o contrato `ClerkUserId` (`^user_[A-Za-z0-9]{1,64}$`, QA3-04); **`iss` precisa ser a Frontend API da instância** (QA3-04: `CLERK_ISSUER`, ou derivado de `CLERK_PUBLISHABLE_KEY` — o sufixo de `pk_test_`/`pk_live_` é base64 de `<host>$`; fora de `local`/`test` sem emissor conhecido a validação de configuração falha e todo token é recusado); `sts`, se presente, `active`; `azp` precisa estar em `PUBLIC_ORIGIN` + `ALLOWED_ORIGINS`. Token **sem** `azp` (emitido pela Backend API com a chave secreta — só usado pelos testes ao vivo) é aceito apenas em `local`/`test`.
3. E-mail e verificação: claims `email`/`email_verified` se o template de sessão as incluir (hoje **não** inclui — claims observadas: `exp, fva, iat, iss, nbf, sid, sts, sub, v`); senão `users.getUser(sub)` na Backend API. Medido: ~0,27–0,42 s por `GET /me` autenticado em dev (inclui banco). Só o e-mail **principal** conta; sem principal → e-mail nulo (QA3-11). Usuário apagado/banido/bloqueado → 401; Backend API com 429/5xx/sem resposta → 503 `SERVICE_UNAVAILABLE` (QA3-01/05; outros 4xx, como chave recusada → 500).
   - **Cache (QA3-01):** o resultado de `getUser` fica num `Map` em memória **por isolate** (`worker/services/user-cache.ts`): TTL 60 s, no máximo 500 entradas, LRU simples, só respostas positivas (404 nunca é cacheado), cópia rasa do objeto. Invalidado em `PATCH /me` e no webhook `user.deleted`. Consequência aceita: banimento/bloqueio ou troca de e-mail no Clerk aparece em até 60 s nas rotas com cache (o token em si já vale 60 s).
   - **Rotas sempre frescas (QA3-03):** `POST /registrations` e `POST /admin/group-proposals/:id/reveal-contact` ignoram o cache **e** as claims e consultam a Backend API a cada requisição (banido → 401 na hora). As demais aceitam a janela de 60 s.
4. Nenhum token, e-mail ou id completo vai para log.

**Níveis.**
- *Organizador:* e-mail principal verificado no Clerk + perfil criado por `POST /registrations` (Turnstile + consentimento) com `email_verification_state='verified'` e conta `active`. O cadastro exige que o `email` do formulário seja o e-mail do Clerk (perfil nunca guarda e-mail que a pessoa não provou). Se o e-mail principal mudar no Clerk (o Clerk só aceita principal verificado), `email_contact` é ressincronizado e auditado (`profile.email_changed`, sem PII); se outro perfil já usa o endereço → 409.
- *Admin (D35):* e-mail principal verificado + id do Clerk em `app_private.admins` + perfil (se existir) **não suspenso** (QA3-06: conta suspensa nunca é admin, e `GET /me` devolve `is_admin=false`), conferido a cada requisição em qualquer `APP_ENV`. **MFA não é exigido** (decisão do proprietário, contrária à spec §8.7); o Clerk permite ativar MFA na conta, mas o Worker não o exige. **Risco aceito:** quem comprometer o e-mail de um admin ganha moderação e contatos completos de proponentes. Mitigações: tabela mínima, ações e revelações auditadas, negações em `abuse_events` (`admin_denied`), remoção efetiva na requisição seguinte.
- **Promoção a admin:** sem rota pública. `scripts/db/bootstrap-admin.ts` (exige `APP_ENV=local` e chave `sk_test_`) resolve o id pelo e-mail na Backend API (`users.getUserList`), cria o usuário no Clerk se não existir (e-mail criado pela Backend API nasce verificado) e chama `svc_grant_admin`. Executado em 2026-10-09 para o e-mail do proprietário (`lu***@gmail.com`): usuário criado no Clerk e admin = true.

**Segredos.** `CLERK_SECRET_KEY` só no Worker (`.dev.vars` local; `wrangler secret put CLERK_SECRET_KEY --env <env>` em staging/produção), validada na primeira requisição (formato `sk_test_`/`sk_live_`; `sk_live_` obrigatório com `APP_ENV=production`, senão 500 + log `misconfigured` com o nome). `VITE_CLERK_PUBLISHABLE_KEY` é pública. `CLERK_JWT_KEY` (opcional) é a chave **pública** PEM da instância.

**Supabase Auth.** `enable_anonymous_sign_ins = false` e `enable_signup = false` (`supabase/config.toml`, aplicado com `supabase config push` em 2026-10-09). Usuários antigos do Supabase Auth do dev foram apagados (`cleanup-dev-data.ts --yes --all`).

**Riscos e pendências (BE-5).**
- Dependência do Clerk (disponibilidade da Backend API; JWKS). Mitigado pelo cache de 60 s por isolate + limite `account_read` (QA3-01) e pelo 503 explícito (QA3-05). Mitigação adicional possível: template de sessão com `email`/`email_verified` (zero chamadas por requisição) e/ou `CLERK_JWT_KEY` — exige alteração no painel do Clerk (não feita).
- Revogação: um token já emitido vale até 60 s; banimento/exclusão no Clerk é refletido em até 60 s (cache) nas rotas comuns e na hora nas rotas sempre frescas.
- `PATCH /me` de conta suspensa → 403 `FORBIDDEN` "Conta suspensa." (QA3-06).
- `GET /me` com conflito de e-mail (o novo e-mail principal do Clerk já está em outro perfil) **não falha**: devolve o perfil atual com `email_sync_conflict: true` e registra `{"level":"warn","event":"email_sync_conflict","request_id":…}` sem PII (QA3-02). As ações de organizador continuam com 409 nesse caso.
- LGPD: Clerk é novo operador (EUA) — registrar em `PRIVACY_LGPD_DRAFT.md` (fora do escopo do backend).
- **Webhook `user.deleted` (QA3-02):** `POST /api/v1/webhooks/clerk`, assinatura Svix verificada com `verifyWebhook` do `@clerk/backend` e `CLERK_WEBHOOK_SIGNING_SECRET` (secret do Worker; sem ele a rota responde 404 = desativado). Sem Turnstile e sem exigência de `Origin` (chamada servidor-a-servidor), mas `no-store`, limite `webhook_ip` (300/10 min por IP) e corpo ≤ 32 KB. Assinatura ausente/inválida/fora da tolerância de 5 min → 401. `user.deleted` → `svc_erase_user_data` + `audit_events` com ator `system:clerk-webhook` (ação `user.erase_by_clerk_webhook`); outros eventos → 200 ignorado. Isento do `WRITES_ENABLED` (só apaga). **Configuração no painel do Clerk pendente** (ver `STAGING_PLAYBOOK.md`); até lá, contas apagadas antes do webhook deixam perfis órfãos (apagar com `svc_erase_user_data` quando o id for conhecido).
- **`svc_dev_wipe_identities` removida (QA3-09, migration 0013, ainda não aplicada):** a limpeza total de dev está em `scripts/db/cleanup-dev-data.ts --yes --all`, com guardas `APP_ENV=local` + ref do TARGET (`wnclh…`, igual ao host de `SUPABASE_TARGET_URL`) + chave `sk_test_`; apaga pessoa a pessoa com `svc_erase_user_data` (ids do Clerk dev e criadores de atividades) e as atividades restantes. Limitação: perfis órfãos sem usuário no Clerk e sem atividade não são enumeráveis pela Data API.
- O RSVP anônimo (cookie) não é migrado para a conta após o cadastro (inalterado).

> Histórico (rodadas 1–3, Supabase Auth): spike de sessão anônima, P-SEC-1, QA2-01/02 e riscos residuais deixaram de se aplicar com a 0012/ADR 0005. Ver versões anteriores deste arquivo no histórico do repositório.

## Gestão de administradores (migration 0014)

- **Superfície nova:** `GET|POST /admin/admins` e `DELETE /admin/admins/:userId`. Todas exigem **admin fresco** (`requireFreshAdmin`: estado atual no Clerk, sem cache, banido → 401), `no-store`, `account_read` + `admin_write` (30/10 min por IP+usuário) nas escritas.
- **Concessão:** só a contas Clerk **existentes**, com e-mail **principal verificado**, localizadas por e-mail no servidor (404 neutro se não existir). O e-mail digitado nunca volta na resposta; listas mostram só e-mail mascarado.
- **Auditoria:** `admin.grant` / `admin.revoke` em `audit_events` (`actor_user_id` = quem agiu, `entity_id` = id Clerk do alvo, sem PII). Idempotente: re-conceder não gera nova linha.
- **Salvaguardas:** não é possível remover a si mesmo (400) nem o último administrador (409; o banco recusa esvaziar a tabela, inclusive em remoções simultâneas). `svc_*` só por `service_role`.
- **Risco aceito/mitigado:** um admin comprometido pode adicionar outros admins. Mitigações: e-mail verificado obrigatório, auditoria de cada concessão, rate limit, revogação imediata por outro admin e re-checagem fresca no Clerk a cada chamada. MFA segue opcional (D35); recomenda-se ativá-lo nas contas de admin no Clerk.

## Painel de métricas (migration 0015)

- **Superfície nova:** `GET /admin/metrics`. Admin **fresco**, `no-store`, `account_read`. Só **agregados**: contagens e séries por dia; nenhum e-mail, telefone, id de pessoa ou lista de quem clicou "Eu vou". `svc_admin_metrics` é `SECURITY DEFINER`, `search_path=''`, só `service_role`.
- **Umami (D44):** as credenciais (`UMAMI_USERNAME`/`UMAMI_PASSWORD`, usuário **somente leitura** do Umami) existem só como secrets do Worker; o navegador nunca as vê nem chama o Umami com elas. O JWT fica só em memória do isolate (~50 min). `UMAMI_API_URL` precisa ser `https` (ou localhost) e `UMAMI_WEBSITE_ID` é validado como UUID antes de entrar na URL. Falhas viram `site_status: 'unavailable'` com `warn` sem URL, token ou senha.
- **Risco:** o Umami é um serviço externo ao projeto; se as credenciais vazarem, o alcance é leitura das estatísticas do site (usuário view-only). Rotacione a senha no Umami e rode `wrangler secret put` de novo.

## Turnstile
Siteverify com `secret`, `response` e `remoteip` (`CF-Connecting-IP`). Checa:
- `success`;
- `hostname` ∈ `TURNSTILE_EXPECTED_HOSTNAMES`;
- `action`, quando a resposta trouxer uma.

Uso único: o sha256 do token fica em `app_private.turnstile_tokens_used` por 5 min **antes** de chamar o Siteverify (T17).

Chaves de **teste** da Cloudflare (`1x/2x/3x…AA`):
- devolvem hostname fixo (`example.com`), então hostname e action **não** são checados com elas;
- são recusadas quando `APP_ENV=production`.

Em local/dev o Turnstile **não é validação real** até existir uma chave real em staging.

## RSVP anônimo
- **Cookie `mm_device`:** 32 bytes aleatórios em base64url, `HttpOnly; SameSite=Lax; Path=/api; Max-Age=31536000`, `Secure` exceto com `APP_ENV=local`.
- **Hash:** `anonymous_subject_hash = HMAC-SHA256(RSVP_DEVICE_SECRET, "device:"+cookie)` via WebCrypto. Nunca vai para o cliente.
- **Identidade:** com sessão, vale o `user_id`.
- **Cancelamento:** DELETE só pela mesma identidade; sem identidade → 403; identidade sem RSVP → 404.
- **Limite honesto:** vários dispositivos ou cookies apagados inflam a contagem. É *intenção*, não presença; best-effort.
- **Pendência:** o vínculo do RSVP anônimo à conta após o cadastro ainda não existe (rodada 2).

## Rate limit (best-effort)
Janela deslizante em memória **por isolate**, chave = bucket + sujeito (IP de `CF-Connecting-IP`, combinado com identidade onde indicado):

| Bucket | Sujeito | Limite |
|---|---|---|
| registrations_ip | IP (antes de resolver a sessão) | 30/10min |
| registrations | IP + usuário (id do Clerk) | 5/10min |
| proposals | IP | 5/10min |
| rsvp_ip | IP | 120/10min |
| rsvp_identity | IP + atividade + identidade (`user_id` ou HMAC do dispositivo) | 10/10min |
| activities_write | IP | 20/10min |
| me_write (`PATCH /me`) | IP | 60/10min |
| account_read (`GET /me`, `GET /my-activities`, todo `/admin/*`) — QA3-01 | IP + usuário (id do Clerk), depois de resolver a sessão e antes da checagem de admin/organizador | 120/min |
| webhook_ip (`POST /webhooks/clerk`) | IP (antes da assinatura) | 300/10min |

**CGNAT / Wi-Fi de evento (F05).** Operadoras móveis brasileiras colocam muitos clientes atrás do mesmo IP público (CGNAT), e um ato presencial concentra dezenas de pessoas numa mesma rede. Por isso RSVP e cadastro são chaveados por IP **+ identidade**, com um teto por IP bem mais alto: 40 pessoas no mesmo IP marcando "Eu vou" na mesma atividade não se bloqueiam (teste `F05: 40 identities…`), enquanto a mesma identidade repetindo além de 10/10 min recebe 429. Limitações: (a) quem não envia cookie ganha identidade nova a cada pedido, então para esse caso só vale o teto por IP (120); (b) um evento com mais de ~120 RSVPs em 10 min atrás de um único IP será limitado; (c) contadores por isolate. Se isso aparecer em campo, o caminho é WAF/Rate Limiting da Cloudflare por rota (P-INFRA-1).

Isolates e colos não compartilham estado, então o limite global efetivo pode ser maior. As garantias reais são os únicos no banco e a idempotência. Cada bloqueio gera um `abuse_event` com o HMAC do IP. O Clerk tem limites próprios de cadastro/login (bot protection da instância).

## Outros
- **Logs:** `{request_id, route, method, status, ms, rate_limited}`; erros registram só nome da classe ou SQLSTATE. Smoke real: 0 ocorrências de `eyJ`, e-mails, `Bearer` ou `sb_` no log do wrangler.
- **Retenção:**
  - `purge_expired()` apaga tokens Turnstile expirados e abuse_events com mais de 90 dias, e anula fingerprints de propostas com mais de 30 dias;
  - **não há agendamento** (sem cron no MVP); rodar manualmente.
- **Sanitização:** título, descrição, endereço e nomes passam por `sanitizePlainText`; o front nunca renderiza HTML de usuário.
- **Sem CORS:** a SPA é servida pelo mesmo Worker.
- **Origin (F14):** mutações com header `Origin` fora de `PUBLIC_ORIGIN` + `ALLOWED_ORIGINS` (lista opcional separada por vírgula, variável de ambiente) → 403 e `abuse_event` `origin_denied`. Sem `Origin` (curl, scripts) passa; `Origin: null` é recusado. Com `APP_ENV=local`, origens loopback (`localhost`, `127.0.0.1`, `[::1]`, qualquer porta) são aceitas para Vite/wrangler. É defesa em profundidade: a autenticação é Bearer (não ambiente) e o cookie `mm_device` é `SameSite=Lax`.
- **Configuração (I03):** na primeira requisição de cada isolate o Worker valida `RSVP_DEVICE_SECRET` (≥ 32 caracteres e diferente do placeholder `change-me-to-a-random-32-byte-string` do `.dev.vars.example`) e `CLERK_SECRET_KEY` (BE-5) e, fora de `local`/`test`, o emissor do Clerk (`CLERK_ISSUER` ou `CLERK_PUBLISHABLE_KEY` decodificável, QA3-04). Se inválido, toda rota `/api/*` responde 500 `INTERNAL_ERROR` e registra `{"event":"misconfigured","settings":["RSVP_DEVICE_SECRET"]}` (nome, nunca valor).
- **Cache de borda (F16):** GETs públicos em `caches.default` por 60 s. **Chave canônica (QA2-04):** origem + caminho + só os parâmetros conhecidos da rota, em ordem fixa (parâmetros extras como `&x=1` não criam entrada que escape da purga). A invalidação após mutação é por colo: aprovação/rejeição de proposta (QA2-03), PATCH/suspensão/reativação de grupo purgam o território, o município e, para grupo municipal, todos os bairros do município (fallback); atividades purgam `/activities/:id`. Logo, um grupo/atividade suspenso some do banco/view na hora e do cache **no mesmo colo após a purga; até 60 s em outros colos** (aceito e documentado). Listas de atividades com bbox/datas/cursor também expiram em até 60 s.
- **Suspensão:** `POST /admin/groups/:id/suspend|unsuspend` e `/admin/activities/:id/suspend|unsuspend`, motivo obrigatório, admin (sem MFA, D35), auditados na mesma transação. Desde 0011 (QA2-09) o status anterior fica em `status_before_suspension`: grupo volta a `inactive` se estava inativo (senão `active`); atividade volta a `cancelled` se estava cancelada (senão `pending_review`, nova moderação).
- **Revelação de contato:** `POST /admin/group-proposals/:id/reveal-contact` exige admin; desde D35 **não exige `aal2`**. A leitura e o `audit_events` (`proposal.reveal_contact`, `retention_class='security'`) continuam na mesma transação (`svc_reveal_proposal_contact`).
- **Segredos em argv (F17):** os scripts de `scripts/db/` leem credenciais só de `.dev.vars`/ambiente e falam com o Supabase por HTTPS (supabase-js); nenhum aceita connection string nem segredo por argumento. O modo `db-url` do extrator (`scripts/import-electoral/`) passou a usar driver em processo, sem segredo em argv (D19, `docs/DECISIONS.md`) — F17 resolvido.
- **Limpeza do TARGET dev:** `scripts/db/cleanup-dev-data.ts` (exige `APP_ENV=local`, confere o ref vinculado contra a URL, `--dry-run` por padrão, `--yes` executa). Remove usuários de teste (`fe2-*`, `*@example.org`, `mm-qa*`, `qa-*`) e o que depende deles, propostas desses e-mails (via `svc_erase_group_proposals`, auditada), grupos ligados e territórios sandbox `mg-98*`/`mg-99*`. Mantém `admin.dev@minasemmovimento.local`, `audit_events` e `abuse_events`.
- **Corpo:** máx. 32 KB.

## Status dos achados da auditoria independente QA-1 (2026-10-09)

Auditoria adversarial executada por agente independente (`qa-security`, Opus) sobre Worker, migrations, RLS ao vivo no TARGET dev e isolamento. Nenhum achado crítico ou alto. Testes de regressão em `worker/tests/qa-security.test.ts` e testes ao vivo em `supabase/tests/qa-worker-live.test.ts` (rodam com `QA_WORKER_URL`).

| ID | Sev. | Achado | Status |
|---|---|---|---|
| F01 | médio | Usuário verificado sem perfil (signup direto no GoTrue) virava organizador | **CORRIGIDO** — `assertOrganizer` exige perfil ativo com `email_verification_state='verified'` (teste F01 agora passa) |
| F02 | médio | PATCH do contato público em atividade publicada sem remoderação | **CORRIGIDO** — contato ligado/alterado e `type` são sensíveis; desligar continua imediato (T27) |
| F03 | médio | `wrangler.jsonc` publicava `APP_ENV=local` (bypass de MFA) | **CORRIGIDO**, depois **política alterada por D35** — top-level = produção (escritas suspensas), `env.local`/`env.staging` explícitos; `npm run dev:worker` usa `--env local`. O bypass de MFA deixou de existir porque MFA não é mais exigido |
| F04 | médio | Cota global de e-mail do Auth esgotável via `send-link`/cadastro | **SUPERADO (BE-5)** — `send-link` removida e e-mails enviados pelo Clerk (cota e bot protection do Clerk); o Supabase Auth não envia mais e-mail |
| F05 | médio | Rate limit só por IP penaliza CGNAT/Wi-Fi de evento | **CORRIGIDO** (BE-2) — RSVP por IP+atividade+identidade (10/10min) com teto por IP 120/10min; cadastro por IP+sujeito (5) com teto por IP 30; testes `F05: 40 identities…`, `F05: the same identity…`, `registration rate limit (F05)…` |
| F06 | médio | CLI provisiona "login role" temporário no SOURCE ao consultar | **CONFIRMADO e DOCUMENTADO** (`DATA_SOURCE_AUDIT.md` §7); próxima extração com usuário SELECT-only (P-DATA-2) |
| F07 | baixo | Secret de teste do Turnstile aceito em staging | **CORRIGIDO** — recusado fora de `local`/`test` |
| F08 | baixo | `action` do Siteverify não exigida quando ausente | **CORRIGIDO** — exigida sempre que a rota define action (chave real) |
| F09 | baixo | Coordenadas fora de MG aceitas | **CORRIGIDO** (BE-2) — contrato + Worker (POST e PATCH) + CHECK `activities_location_mg_check`; teste QA `F05: activity coordinates…` convertido em `it`, testes `F09/F12` e `round2.test.ts` (23514) |
| F10 | baixo | Enumeração de e-mail no cadastro (409 vs 201) | PENDENTE / decisão do proprietário (teste `it.fails` F06; ADR 0003) |
| F11 | baixo | Idempotência por conteúdo em propostas vira oráculo | **CORRIGIDO** (BE-2) — hash de conteúdo escopado ao dia UTC; chave explícita vale 24 h; nunca deduplica contra proposta decidida/expirada; testes `F11: a rejected proposal…`, `approved proposals…`, `explicit idempotency_key…` e DB `round2.test.ts`. Resíduo: no mesmo dia, reenviar o mesmo conteúdo ainda devolve 200 vs 201 enquanto a proposta original estiver pendente |
| F12 | baixo | `starts_at` sem teto | **CORRIGIDO** (BE-2) — início ≤ 366 dias à frente e duração ≤ 24 h (Worker, POST e PATCH; duração também por CHECK); teste QA `F07` convertido em `it` |
| F13 | baixo | SPA sem CSP/headers | **CORRIGIDO** — `public/_headers` (CSP allowlist, `frame-ancestors 'none'`, Permissions-Policy); verificado no navegador sem violações |
| F14 | baixo | Sem validação de `Origin` nas mutações | **CORRIGIDO** (BE-2) — `worker/middleware/origin.ts`; testes `F14: …` (positivo e negativo) e smoke |
| F15 | baixo | Default privileges concedem ALL a anon/authenticated em objetos novos | **CORRIGIDO** — migration `0009_default_privileges.sql` aplicada |
| F16 | baixo | GETs públicos sem cache de CDN/limite | **CORRIGIDO** (BE-2) — Cache API 60 s nos GETs públicos com invalidação por colo; limites 60/10min em `PATCH /me` e `confirm-email`; testes `F16: …` e smoke (`X-Cache=HIT`) |
| F17 | baixo | Connection string em argumento de processo no modo `db-url` | **CORRIGIDO** — modo `db-url` com driver em processo, sem segredo em argv (D19); scripts de `scripts/db/` também não recebem segredos por argv |
| I01–I06 | info | Pré-sequestro de perfil via e-mail alheio (I01); validação de `RSVP_DEVICE_SECRET` (I03); PKCE vs implícito (I06) | I06 resolvido no retorno do magic link; **I01 (P-SEC-1) CORRIGIDO no backend** (flag de revisão + telefone editável; testes `P-SEC-1: …`, smoke) — falta a tela de revisão no frontend; **I03 CORRIGIDO** (`worker/middleware/config-check.ts`; teste `I03: …`) |
| — | — | Status "suspenso" e revelação auditada de contato (rodada 2, item 8 do relatório) | **IMPLEMENTADO** (BE-2) — testes `suspension …`, `audited contact reveal …`, DB `round2.test.ts`, smoke com admin aal1 desde D35 (TOTP só como passo opcional) |

Ajuste adicional após QA-1: com a **secret de teste** do Turnstile e `APP_ENV=local`, o controle de uso único do token é pulado (o widget de teste devolve sempre o mesmo token e bloqueava todos os formulários por 5 min em desenvolvimento). Com secret real o uso único continua obrigatório (T17).

## Status dos achados da auditoria independente QA-2 (2026-10-09)

Auditoria adversarial (`qa-security`) da rodada 2. Testes de regressão em `worker/tests/qa2-security.test.ts` e ao vivo em `supabase/tests/qa2-live.test.ts` (com `QA_WORKER_URL`). Correções do backend na tarefa BE-3: migration `0011_qa2_fixes.sql`, testes adicionais em `worker/tests/be3-fixes.test.ts` e `supabase/tests/round2.test.ts`. A severidade só aparece onde foi informada ao BE-3; os demais detalhes estão no relatório da QA-2.

| ID | Sev. | Achado | Status |
|---|---|---|---|
| QA2-01 / 01b | médio | Promoção feita pelo GoTrue (troca segura de e-mail de usuário provisório) antes do `confirm-email` → `promoted=false`: sem revisão de perfil e sem revogar a sessão do invasor, que organiza com os dados que digitou | **CORRIGIDO** (BE-3) — qualquer transição para `verified` ou divergência `email_contact` × Auth é promoção; `assertOrganizer` recusa e-mail divergente (403). Testes `QA2-01`, `QA2-01b` (agora afirma 403) e `QA2-01: …` em `be3-fixes`; ao vivo, **Q02** convertido em `it` e passando. Risco residual documentado em P-SEC-1 |
| QA2-02 | — | Falha de `signOutOthers` era ignorada | **CORRIGIDO** (BE-3) — 1 nova tentativa; depois 500 `INTERNAL_ERROR` sem gravar `verified` |
| QA2-03 | — | Aprovar proposta não purgava `/groups` do território | **CORRIGIDO** (BE-3) — `svc_approve_group_proposal` devolve `territory_id` (0011); purga após aprovar, rejeitar, suspender e reativar |
| QA2-04 / 04b | — | Bairro em fallback e URL com parâmetro extra continuavam com o grupo suspenso em cache | **CORRIGIDO** (BE-3) — chave canônica + purga dos bairros do município; texto "na hora" corrigido |
| QA2-05 | — | `idempotency_key` explícita era global: a chave de outra pessoa engolia a proposta (200 com o id alheio) | **CORRIGIDO** (BE-3) — chave escopada por `user_id` ou HMAC do IP |
| QA2-06 | — | Bypass da denylist SQL do extrator (`U&""`, funções não listadas) | Fora do escopo do BE-3 (`scripts/import-electoral`, outro agente). Em 2026-10-09 o teste `QA2-06` já estava convertido em `it` e passou na execução do BE-3; a garantia real continua sendo a transação `READ ONLY` |
| QA2-09 | — | `unsuspend` reativava grupo que estava `inactive` e mandava atividade cancelada para `pending_review` | **CORRIGIDO** (BE-3) — `status_before_suspension` (0011) |
| QA2-10 | — | Esta página dizia que o backend não bloqueava organizador com revisão pendente | **CORRIGIDO** (doc) — o backend bloqueia (403) |
| QA2-11 | — | Rascunhos com endereço/contato deixados no dispositivo | Frontend (`src/lib/auth.ts`), fora do escopo do BE-3 |
| QA2-12 | — | Admin sem fator TOTP: quem fizer o primeiro login enrola o fator | **Política alterada por D35** — o fator TOTP deixou de ser exigido para admin (era MITIGADO no BE-3); a corrida do primeiro enrolamento deixa de dar acesso extra, já que o admin entra sem MFA. Risco aceito pelo proprietário: segurança do admin = segurança da conta de e-mail |
| F17 (QA-1) | baixo | Segredo em argv no modo `db-url` | **CORRIGIDO** (D19) |
