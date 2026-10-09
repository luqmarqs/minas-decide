# Segurança — backend (BE-1 rodada 1, BE-2 rodada 2)

## Matriz RLS / grants testada no TARGET dev
Rodada `npm run test:db` (`supabase/tests/rls.test.ts`) em 2026-10-08: **27 de 27 passaram, 0 pulados**.

Códigos observados:

| Tentativa | Resultado real |
|---|---|
| anon lê `app_private.*` pelo caminho público (`/rest/v1/profiles`) | 404 `PGRST205` |
| anon lê `app_private.*` com `Accept-Profile: app_private` | 406 `PGRST106` |
| anon `select=*` em `whatsapp_groups` / `activities` (base) | 401 `42501` |
| anon lê colunas internas (`creator_user_id`, `review_reason`, `description`, `public_contact_value`, `reviewed_by`, `created_by`, `approved_by`…) | negado |
| anon / sessão anônima vê grupo pendente (view ou colunas públicas da base) | 0 linhas |
| anon / sessão anônima vê atividade pendente (base ou view) | 0 linhas |
| organizador verificado vê a própria pendente / a de outro | 1 linha (colunas públicas) / 0 |
| anon INSERT em `activities` / `whatsapp_groups` | 401 `42501` |
| sessão anônima (e até organizador verificado) INSERT em `activities` | 403 `42501` |
| anon / sessão anônima chama `svc_*` (inclusive `svc_grant_admin`) | 401 / 403 `42501` |
| view `activities_public` expõe criador, motivo ou contato bruto | não; `select=creator_user_id` é negado |
| contato público desligado | some imediatamente da view (colunas geradas, T27) |
| `upsert_rsvp` repetido pela mesma identidade | 1 linha; outra identidade cancelando → `PT404`; atividade cancelada → `PT409` |
| T28: dois admins aprovando a mesma proposta em paralelo | 1 sucesso, 1 `PT409`, 1 grupo |
| não admin chamando a aprovação | `PT403` (rechecagem dentro da função) |
| `consume_turnstile_token` com o mesmo hash 2× | `true`, `false` |

Resíduos dos testes: todo o resto é limpo por cascata a partir de um território sandbox `mg-99xxxxx` e pela exclusão dos usuários de teste.
- `audit_events` fica (append-only, sem PII).
- O hash de Turnstile dos testes expira em minutos.

## Auth — spike real (2026-10-08)
`scripts/db/spike-anon-email-link.ts`. Os usuários de teste foram apagados ao final.

| Passo | Observado |
|---|---|
| A1 `signInAnonymously()` | `is_anonymous=true`, JWT `aal1` |
| A2 `admin.updateUserById(uid, {email, email_confirm:false})` | e-mail gravado sem confirmação, identity `email`, **segue anônimo**. A API admin **não envia** e-mail. |
| A3 refresh do JWT | `is_anonymous=true` |
| A4 `signInWithOtp` / `updateUser({email})` para `@example.org` | 1ª tentativa: 400 `email_address_invalid` (o Auth recusa o domínio example.org). Depois: 429 `over_email_send_rate_limit` (cota do SMTP padrão). **Entrega real de e-mail NÃO VALIDADA.** |
| A5 clique no magic link simulado (`generateLink` + `verifyOtp`) | mesmo usuário, `email_confirmed_at` preenchido, **`is_anonymous` continua true** (usuário e JWT); `amr=[otp]` |
| B1 / G1 vincular e-mail já usado por outro usuário (confirmado **ou** pendente) | **500 "Error updating user"** (não 422) |
| C1 `updateUserById({email, email_confirm:true})` em anônimo | `is_anonymous=false` |
| E2 `updateUserById({email_confirm:true})` sozinho | **não** promove |
| H1 `updateUserById({mesmo email, email_confirm:true})` após o clique | `is_anonymous=false`; refresh da sessão do link → JWT `is_anonymous=false` |
| E4/E5 `admin.signOut(token, 'others')` | a sessão anônima original fica revogada (`refresh_token_not_found`) |

**Desenho resultante:**
1. `POST /registrations` vincula o e-mail sem confirmação. Antes, checa no banco se o e-mail já é usado (`email_in_use`), porque o Auth responde 500; nesse caso devolve 409 neutro.
2. Em seguida dispara o magic link (`shouldCreateUser:false`). Se o envio falhar, o estado informado é `unverified`, sem sucesso falso.
3. `POST /auth/confirm-email` só promove se a **sessão atual** foi criada por prova de posse da caixa (`amr` contém `otp`/`magiclink`) e o e-mail está confirmado. A promoção revoga as demais sessões.

Isso neutraliza uma sessão anônima antiga de quem tenha "ocupado" o e-mail: ela nunca vira organizadora.

**Risco residual (rodada 1):** alguém pode vincular o e-mail de outra pessoa a um perfil provisório próprio. Se essa pessoa depois entrar por magic link, herda esse perfil (nome, telefone, território).

**P-SEC-1 (rodada 2, CORRIGIDO no backend):** a promoção em `/auth/confirm-email` grava `profiles.review_required_at = now()`; `GET /me` devolve `profile_review_required: true` e `phone_masked`; `PATCH /me` aceita `phone` (E.164) e `profile_reviewed: true`, que limpa o flag. Só o dono da sessão edita o próprio perfil (não existe rota admin que altere telefone/nome). As mudanças são auditadas sem PII (`profile.phone_change`, `profile.review`: só ator e id). As sessões do invasor continuam revogadas na promoção. O frontend exibe a etapa de revisão enquanto o flag estiver ligado e **o backend bloqueia** as ações de organizador com o flag ligado: `assertOrganizer` responde 403 (criar/editar/cancelar atividade, `/my-activities`) até `PATCH /me {profile_reviewed:true}` (correção do texto anterior — QA2-10).

**QA2-01 (BE-3, CORRIGIDO):** a promoção não depende mais de a sessão estar anônima no momento do `confirm-email`. O GoTrue pode tornar a identidade permanente sozinho (troca segura de e-mail de um usuário provisório: o invasor confirma o endereço atual, a vítima o novo) e então o Worker via `promoted=false` e não revisava nem revogava nada. Agora **qualquer** transição do perfil para `verified` — e qualquer divergência entre `profiles.email_contact` e o e-mail do Auth (sem diferenciar maiúsculas) — é tratada como promoção: revoga as outras sessões, liga `review_required_at` e re-sincroniza `email_contact` (auditoria `profile.email_changed`, só ator e id). Enquanto o e-mail do Auth divergir do perfil, `assertOrganizer` responde 403 pedindo a confirmação/revisão; `PATCH /me` **não** re-sincroniza o e-mail (só o `confirm-email`, que revoga as sessões). Validado ao vivo (Q02 em `supabase/tests/qa2-live.test.ts`: `review=true`, refresh do invasor → `refresh_token_not_found`). **QA2-02:** se a revogação das outras sessões falhar (com uma nova tentativa), o `confirm-email` responde 500 `INTERNAL_ERROR` e o perfil **não** vira `verified`; a próxima chamada refaz a promoção.

**Risco residual (QA2-01):** se o próprio invasor tiver uma sessão permanente com prova de e-mail (`amr` `otp`) anterior à troca e chamar o `confirm-email` antes da vítima, ele revoga a sessão da vítima e mantém a sua; o perfil fica com revisão pendente e o e-mail da vítima. Exige que a vítima clique no link de **troca de e-mail** de uma conta que não criou. Mitigação futura: exigir que a prova de e-mail da sessão seja posterior à troca (timestamp do `amr`) ou desabilitar a troca de e-mail para usuários provisórios. E-mail informativo ao dono: não implementado (depende de SMTP próprio, P-SEC-3).

## Organizador e admin
- **Organizador:** `!is_anonymous` (registro do usuário **e** claim do JWT) + `email_confirmed` (Auth) + `is_email_verified` (banco) + conta não suspensa.
- **Admin:** `app_private.admins` + `aal2` + (fora de `local`) **pelo menos um fator TOTP `verified`** consultado na API admin do Auth (`auth.admin.mfa.listFactors`, uma vez por requisição; erro → nega). TOTP MFA está habilitado no projeto (`[auth.mfa.totp]`). **QA2-12:** um admin recém-criado não tem fator; quem fizer o primeiro login (aal1) pode enrolar o TOTP. Por isso `scripts/db/bootstrap-admin.ts` avisa quando o admin não tem fator verificado: o próprio admin deve enrolar o TOTP no **primeiro acesso**, de um dispositivo confiável. Em 2026-10-09 o admin dev tinha 0 fatores — fora de `local` ele recebe 403 até enrolar.
- **`ADMIN_MFA_BYPASS_LOCAL`:** só com `APP_ENV=local` e sempre registrado em log. **Em staging/produção é impossível**: o código só aceita o bypass com `APP_ENV==='local'`, e o deploy tem de fixar outro valor. O `wrangler.jsonc` atual usa `local` e precisa de `env.staging/production` com `APP_ENV` próprio antes de qualquer deploy.
- **Promoção a admin:** não existe rota pública. Só `scripts/db/bootstrap-admin.ts` (exige `APP_ENV=local`) ou a RPC `svc_grant_admin`, executável apenas pelo service_role.

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
| registrations | IP + usuário provisório | 5/10min |
| proposals | IP | 5/10min |
| rsvp_ip | IP | 120/10min |
| rsvp_identity | IP + atividade + identidade (`user_id` ou HMAC do dispositivo) | 10/10min |
| send_link | IP | 3/10min |
| activities_write | IP | 20/10min |
| me_write (`PATCH /me`) | IP | 60/10min |
| confirm_email | IP | 60/10min |

**CGNAT / Wi-Fi de evento (F05).** Operadoras móveis brasileiras colocam muitos clientes atrás do mesmo IP público (CGNAT), e um ato presencial concentra dezenas de pessoas numa mesma rede. Por isso RSVP e cadastro são chaveados por IP **+ identidade**, com um teto por IP bem mais alto: 40 pessoas no mesmo IP marcando "Eu vou" na mesma atividade não se bloqueiam (teste `F05: 40 identities…`), enquanto a mesma identidade repetindo além de 10/10 min recebe 429. Limitações: (a) quem não envia cookie ganha identidade nova a cada pedido, então para esse caso só vale o teto por IP (120); (b) um evento com mais de ~120 RSVPs em 10 min atrás de um único IP será limitado; (c) contadores por isolate. Se isso aparecer em campo, o caminho é WAF/Rate Limiting da Cloudflare por rota (P-INFRA-1).

Isolates e colos não compartilham estado, então o limite global efetivo pode ser maior. As garantias reais são os únicos no banco e a idempotência. Cada bloqueio gera um `abuse_event` com o HMAC do IP. O Auth do Supabase tem limites próprios (e-mail, sign-in anônimo 30/h por IP).

## Outros
- **Logs:** `{request_id, route, method, status, ms, rate_limited}`; erros registram só nome da classe ou SQLSTATE. Smoke real: 0 ocorrências de `eyJ`, e-mails, `Bearer` ou `sb_` no log do wrangler.
- **Retenção:**
  - `purge_expired()` apaga tokens Turnstile expirados e abuse_events com mais de 90 dias, e anula fingerprints de propostas com mais de 30 dias;
  - **não há agendamento** (sem cron no MVP); rodar manualmente.
- **Sanitização:** título, descrição, endereço e nomes passam por `sanitizePlainText`; o front nunca renderiza HTML de usuário.
- **Sem CORS:** a SPA é servida pelo mesmo Worker.
- **Origin (F14):** mutações com header `Origin` fora de `PUBLIC_ORIGIN` + `ALLOWED_ORIGINS` (lista opcional separada por vírgula, variável de ambiente) → 403 e `abuse_event` `origin_denied`. Sem `Origin` (curl, scripts) passa; `Origin: null` é recusado. Com `APP_ENV=local`, origens loopback (`localhost`, `127.0.0.1`, `[::1]`, qualquer porta) são aceitas para Vite/wrangler. É defesa em profundidade: a autenticação é Bearer (não ambiente) e o cookie `mm_device` é `SameSite=Lax`.
- **Configuração (I03):** na primeira requisição de cada isolate o Worker valida `RSVP_DEVICE_SECRET` (≥ 32 caracteres e diferente do placeholder `change-me-to-a-random-32-byte-string` do `.dev.vars.example`). Se inválido, toda rota `/api/*` responde 500 `INTERNAL_ERROR` e registra `{"event":"misconfigured","settings":["RSVP_DEVICE_SECRET"]}` (nome, nunca valor).
- **Cache de borda (F16):** GETs públicos em `caches.default` por 60 s. **Chave canônica (QA2-04):** origem + caminho + só os parâmetros conhecidos da rota, em ordem fixa (parâmetros extras como `&x=1` não criam entrada que escape da purga). A invalidação após mutação é por colo: aprovação/rejeição de proposta (QA2-03), PATCH/suspensão/reativação de grupo purgam o território, o município e, para grupo municipal, todos os bairros do município (fallback); atividades purgam `/activities/:id`. Logo, um grupo/atividade suspenso some do banco/view na hora e do cache **no mesmo colo após a purga; até 60 s em outros colos** (aceito e documentado). Listas de atividades com bbox/datas/cursor também expiram em até 60 s.
- **Suspensão:** `POST /admin/groups/:id/suspend|unsuspend` e `/admin/activities/:id/suspend|unsuspend`, motivo obrigatório, admin + aal2, auditados na mesma transação. Desde 0011 (QA2-09) o status anterior fica em `status_before_suspension`: grupo volta a `inactive` se estava inativo (senão `active`); atividade volta a `cancelled` se estava cancelada (senão `pending_review`, nova moderação).
- **Revelação de contato:** `POST /admin/group-proposals/:id/reveal-contact` exige `aal2` **real mesmo com `APP_ENV=local`** (o bypass de MFA local não vale aqui). A leitura e o `audit_events` (`proposal.reveal_contact`, `retention_class='security'`) estão na mesma transação (`svc_reveal_proposal_contact`).
- **Segredos em argv (F17):** os scripts de `scripts/db/` leem credenciais só de `.dev.vars`/ambiente e falam com o Supabase por HTTPS (supabase-js); nenhum aceita connection string nem segredo por argumento. O modo `db-url` do extrator (`scripts/import-electoral/`) passou a usar driver em processo, sem segredo em argv (D19, `docs/DECISIONS.md`) — F17 resolvido.
- **Limpeza do TARGET dev:** `scripts/db/cleanup-dev-data.ts` (exige `APP_ENV=local`, confere o ref vinculado contra a URL, `--dry-run` por padrão, `--yes` executa). Remove usuários de teste (`fe2-*`, `*@example.org`, `mm-qa*`, `qa-*`) e o que depende deles, propostas desses e-mails (via `svc_erase_group_proposals`, auditada), grupos ligados e territórios sandbox `mg-98*`/`mg-99*`. Mantém `admin.dev@minasemmovimento.local`, `audit_events` e `abuse_events`.
- **Corpo:** máx. 32 KB.

## Status dos achados da auditoria independente QA-1 (2026-10-09)

Auditoria adversarial executada por agente independente (`qa-security`, Opus) sobre Worker, migrations, RLS ao vivo no TARGET dev e isolamento. Nenhum achado crítico ou alto. Testes de regressão em `worker/tests/qa-security.test.ts` e testes ao vivo em `supabase/tests/qa-worker-live.test.ts` (rodam com `QA_WORKER_URL`).

| ID | Sev. | Achado | Status |
|---|---|---|---|
| F01 | médio | Usuário verificado sem perfil (signup direto no GoTrue) virava organizador | **CORRIGIDO** — `assertOrganizer` exige perfil ativo com `email_verification_state='verified'` (teste F01 agora passa) |
| F02 | médio | PATCH do contato público em atividade publicada sem remoderação | **CORRIGIDO** — contato ligado/alterado e `type` são sensíveis; desligar continua imediato (T27) |
| F03 | médio | `wrangler.jsonc` publicava `APP_ENV=local` (bypass de MFA) | **CORRIGIDO** — top-level = produção (escritas suspensas), `env.local`/`env.staging` explícitos; `npm run dev:worker` usa `--env local` |
| F04 | médio | Cota global de e-mail do Auth esgotável via `send-link`/cadastro | **PENDENTE** (P-SEC-3): SMTP próprio + throttle por e-mail + captcha nativo do Auth |
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
| — | — | Status "suspenso" e revelação auditada de contato (rodada 2, item 8 do relatório) | **IMPLEMENTADO** (BE-2) — testes `suspension …`, `audited contact reveal …`, DB `round2.test.ts`, smoke com aal2 real via TOTP |

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
| QA2-12 | — | Admin sem fator TOTP: quem fizer o primeiro login enrola o fator | **MITIGADO** (BE-3) — fora de `local`, admin exige fator TOTP `verified` (API admin do Auth, cache por requisição); `bootstrap-admin.ts` avisa para enrolar no primeiro acesso. A corrida do primeiro enrolamento continua sendo processo operacional |
| F17 (QA-1) | baixo | Segredo em argv no modo `db-url` | **CORRIGIDO** (D19) |
