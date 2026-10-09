# API — contratos implementados (Worker Hono, `/api/v1`)

Fonte de verdade dos schemas: `shared/contracts/*.ts`. Implementação: `worker/`. Estado em 2026-10-09 (BE-2, rodada 2).

**Envelope.** Sucesso `{ data, meta: { request_id } }`; erro `{ error: { code, message, fields? }, meta }`. Status por código em `HTTP_STATUS_BY_CODE`. Zod → `VALIDATION_ERROR` com `fields` (caminho → mensagem). Nunca stack/SQL. Header `X-Request-Id` em toda resposta; `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

**Globais.** Ordem dos middlewares em `/api/*`: request id → **validação de configuração** (I03: `RSVP_DEVICE_SECRET` com ≥ 32 caracteres e diferente do placeholder; senão 500 `INTERNAL_ERROR` + log `misconfigured` só com o nome da variável) → corpo máx. 32 KB (`VALIDATION_ERROR`) → **guarda de `Origin`** (F14: POST/PATCH/DELETE com `Origin` fora de `PUBLIC_ORIGIN` + `ALLOWED_ORIGINS` → 403 `FORBIDDEN`; sem `Origin` passa; com `APP_ENV=local` qualquer origem loopback é aceita) → `WRITES_ENABLED !== 'true'` → toda mutação responde 503 `WRITES_SUSPENDED` (GETs seguem). Rate limit best-effort por isolate, chave `CF-Connecting-IP` (+ identidade onde indicado) e bucket (`X-Forwarded-For` é ignorado). Log estruturado por requisição: `{request_id, route, method, status, ms, rate_limited}`.

**Cache de borda (F16).** Os GETs públicos (`/territories/search`, `/territories/:id`, `/groups`, `/activities`, `/activities/:id`) usam o Cache API do Worker (`caches.default`, chave = URL completa, TTL 60 s, só respostas 200) além de `Cache-Control: public, max-age=60`. Respostas trazem `X-Cache: HIT|MISS`; num HIT o corpo (inclusive `meta.request_id`) é o da requisição que preencheu o cache, mas o header `X-Request-Id` é novo. Invalidação best-effort **só no colo atual**: `/activities/:id` após PATCH/cancelamento/moderação/suspensão e `/groups?territory_id=<território>` e `<município>` após PATCH/suspensão de grupo. Listas com bbox/datas/cursor expiram em até 60 s.

**Auth.** `Authorization: Bearer <access token Supabase>`, validado com `auth.getUser`. Níveis:
- *sessão*: qualquer sessão válida, incluindo a provisória (anônima);
- *organizador*: `is_anonymous=false` (usuário **e** claim do JWT) + `email_confirmed_at` + `app_private.is_email_verified` no banco + conta não suspensa;
- *admin*: `app_private.admins` + `aal2` (MFA). Com `APP_ENV=local` existe bypass de MFA, registrado em log como `ADMIN_MFA_BYPASS_LOCAL` (ver SECURITY.md).

Token ausente → 401; token inválido ou expirado → 401; nível insuficiente → 403 (`EMAIL_NOT_VERIFIED` ou `FORBIDDEN`).

## Rotas

| Método | Rota | Auth | Validação / regras | Limite | Cache | Status reais |
|---|---|---|---|---|---|---|
| GET | `/health` | — | sem versão nem segredos | — | no-store | 200 |
| GET | `/territories/search?q=&limit=` | — | `q` 2–80, normalizado para `[a-z0-9 ]`; `limit` ≤ 20; ordem: prefixo > tipo > nome; `label` desambiguado (“Centro — Mariana/MG”) | — | public 60s | 200, 400 |
| GET | `/territories/:id` | — | `TerritoryId`; breadcrumb mg → município → bairro; `coverage_note` para bairro | — | public 60s | 200, 404 |
| GET | `/territories/:id/metrics` | — | **não consulta banco**: métricas só no snapshot estático `/data/...` | — | no-store | 404 `NOT_FOUND` |
| GET | `/groups?territory_id=` | — | `TerritoryId` obrigatório; só a view `whatsapp_groups_public` (status active); `fallback` `exact`/`municipality`/`none` | — | public 60s | 200, 400 |
| POST | `/groups/proposals` | opcional | `GroupProposalInput`; telefone → E.164; Turnstile (action `group_proposal`); território existe; idempotência (F11): `idempotency_key` vale 24 h; sem ela, hash do conteúdo (território+URL+e-mail) **escopado ao dia UTC**; em ambos os casos só deduplica contra proposta **pendente** e não expirada (rejeitada/aprovada → nova proposta 201); sanitização | 5/10min | no-store | 201 nova, 200 repetida, 400, 403 (Origin), 429, 503 |
| GET | `/activities?bbox=&territory_id=&from=&to=&limit=&cursor=` | — | bbox ≤ 15° por lado; `from` padrão = agora − 6h; município inclui bairros; cursor opaco (base64url de `starts_at`+`id`); só `published`/`cancelled` (suspensa nunca) | — | public 60s + edge | 200, 400 |
| GET | `/activities/:id` | — | UUID; só publicada/cancelada | — | public 60s + edge | 200, 404 |
| POST | `/activities/:id/rsvp` | opcional | `RsvpInput` (corpo pode ser vazio); identidade = `user_id` da sessão ou HMAC do cookie `mm_device` (criado se ausente) | 120/10min por IP **e** 10/10min por IP+atividade+identidade (F05) | no-store | 200, 401 (token inválido), 403 (Origin), 404 (não pública/suspensa), 409 (cancelada), 429 |
| DELETE | `/activities/:id/rsvp` | opcional | só a mesma identidade | idem POST (mesmos contadores) | no-store | 200, 403 (sem identidade / Origin), 404 (identidade sem RSVP / não pública) |
| POST | `/registrations` | sessão **provisória** | `RegistrationInput`; Turnstile (action `registration`); território existe; e-mail de outra conta → 409 neutro; perfil + `updateUserById(email, email_confirm:false)` com compensação; envio de magic link | 30/10min por IP (antes da sessão) + 5/10min por IP+usuário provisório (F05) | no-store | 201, 200 (reenvio idempotente), 400, 401, 409, 429, 500 |
| GET | `/me` | sessão | campos mínimos; e-mail e telefone mascarados (`phone_masked`); `profile_review_required` (P-SEC-1) | — | no-store | 200, 401 |
| PATCH | `/me` | sessão (só o próprio perfil) | `MePatch`: nome, território, opt-in, **`phone`** (E.164 via `BrazilPhone`), **`profile_reviewed: true`** (limpa a revisão); exige perfil; auditado sem PII (`profile.phone_change`, `profile.review`) | 60/10min | no-store | 200, 400, 401, 403 (Origin), 404, 429 |
| GET | `/my-activities?limit=&cursor=` | organizador | só as próprias (todos os status) | — | no-store | 200, 401, 403 |
| POST | `/activities` | organizador | `ActivityInput`; coordenadas no bbox de MG (lon −51,1…−39,8; lat −23,0…−14,2) (F09); início no futuro e no máximo 366 dias à frente; fim > início e duração ≤ 24 h (F12); contato público validado (whatsapp E.164, e-mail, @instagram) só com opt-in; título/descrição/endereço sanitizados; território existe; Turnstile verificado **se enviado**; status `pending_review`; auditado | 20/10min | no-store | 201, 400, 401, 403, 429 |
| PATCH | `/activities/:id` | autor organizador ou admin | `ActivityPatch` + `version` (409 se divergir); mesmos limites de MG/366 dias/24 h do POST; só `draft`/`pending_review`/`published` (suspensa → 409); mudança em título/descrição/data/endereço/coordenadas/território de uma publicada feita pelo autor → `pending_review`; contato off → oculto na hora; auditado | 20/10min | no-store | 200, 400, 401, 403, 404 (não dono), 409 |
| POST | `/activities/:id/cancel` | autor organizador ou admin | `{version?, reason?}`; auditado | 20/10min | no-store | 200, 401, 403, 404, 409 |
| POST | `/auth/send-link` | — | `SendLinkInput`; Turnstile; `signInWithOtp(shouldCreateUser:false)`; resposta sempre neutra | 3/10min | no-store | 202, 400, 429 |
| POST | `/auth/confirm-email` | sessão | exige e-mail confirmado no Auth **e** `amr` da sessão com `otp`/`magiclink`; promove a permanente (`updateUserById(email igual, email_confirm:true)`), revoga as outras sessões, perfil → `verified` **e, quando promove, `review_required_at = now()`** (P-SEC-1); retorna `MeResponse` + `requires_session_refresh` | 60/10min | no-store | 200, 401, 403, 429 |
| GET | `/admin/queue?kind=groups\|activities&status=&limit=&cursor=` | admin+MFA | propostas com e-mail e telefone **mascarados** e `group_id` (grupo criado na aprovação, ou `null`); atividades `pending_review` por padrão (`status=suspended` lista as suspensas) | — | no-store | 200, 400, 401, 403 |
| POST | `/admin/groups/:id/approve` | admin+MFA | `:id` = **id da proposta**; `{reason?}`; transacional (`approve_group_proposal`) | — | no-store | 200, 403, 404, 409 |
| POST | `/admin/groups/:id/reject` | admin+MFA | `ModerationDecision` (motivo obrigatório) | — | no-store | 200, 400, 403, 404, 409 |
| POST | `/admin/activities/:id/approve` | admin+MFA | `{reason?}`; só de `pending_review` | — | no-store | 200, 403, 404, 409 |
| POST | `/admin/activities/:id/reject` | admin+MFA | `ModerationDecision` | — | no-store | 200, 400, 403, 404, 409 |
| PATCH | `/admin/groups/:id` | admin+MFA | `AdminGroupPatch`; URL de convite oficial; auditado com motivo | — | no-store | 200, 400, 403, 404, 409 |
| POST | `/admin/groups/:id/managers` | admin+MFA | `GroupManagerInput`; telefone E.164; privado; auditado | — | no-store | 201, 400, 403, 404 |
| GET | `/admin/security-events?limit=&cursor=` | admin+MFA | só `id, created_at, route, event_type, block_code` | — | no-store | 200, 403 |
| POST | `/admin/groups/:id/suspend` **(nova)** | admin+MFA | `:id` = **id do grupo**; `ModerationDecision` (motivo obrigatório); `active`/`inactive` → `suspended`; some da view pública na hora; auditado (`group.suspend`) | — | no-store | 200 `{id,status,updated_at}`, 400, 401, 403, 404, 409 |
| POST | `/admin/groups/:id/unsuspend` **(nova)** | admin+MFA | `ModerationDecision`; `suspended` → `active` (já fora aprovado; sem nova rodada de moderação); auditado | — | no-store | 200, 400, 401, 403, 404, 409 |
| POST | `/admin/activities/:id/suspend` **(nova)** | admin+MFA | `ModerationDecision`; `draft`/`pending_review`/`published`/`cancelled` → `suspended`; some do público, recusa RSVP (404) e edição do autor (409); `review_reason` = motivo; `version+1`; auditado | — | no-store | 200 `{id,status,version}`, 400, 401, 403, 404, 409 |
| POST | `/admin/activities/:id/unsuspend` **(nova)** | admin+MFA | `ModerationDecision`; `suspended` → `pending_review` (precisa ser aprovada de novo); auditado | — | no-store | 200, 400, 401, 403, 404, 409 |
| POST | `/admin/group-proposals/:id/reveal-contact` **(nova)** | admin + **aal2 real** (sem bypass, nem em local) | corpo opcional `{reason?}` (3–500); devolve `AdminRevealContactResponse` (e-mail e telefone completos); leitura e `audit_events` (`proposal.reveal_contact`, `retention_class='security'`) na mesma transação; aal1 → 403 + `abuse_event` `reveal_denied_aal` | — | no-store | 200, 401, 403, 404 |

Admin negado gera um `abuse_event` (`admin_denied`, sem IP bruto).

## Validação feita

- `worker/tests/*.test.ts`: 99 testes + 1 `it.fails` (F10, decisão do proprietário) com `app.request()` e fakes em memória (2026-10-09).
- `scripts/db/smoke-worker.ts`: 53 verificações contra `wrangler dev --env local --port 8797` + TARGET dev real, todas passaram em 2026-10-09 (inclui revisão de perfil, Origin, limites de MG/366 dias, cache de borda, suspensão, revelação com aal2 real via TOTP e F11).
- `supabase/tests/round2.test.ts`: 6 testes da migration 0010 contra o TARGET dev.

## Mudanças de contrato desejadas (não aplicadas em `shared/contracts`)

1. `ActivityPatch = ActivityInput.partial()`: no Zod 4, `public_contact_opt_in.default(false)` continua valendo dentro do `partial()`, e todo PATCH chega com `public_contact_opt_in:false`. O Worker contorna isso aplicando só as chaves presentes no JSON bruto. Sugestão: construir o patch a partir de um schema sem `default`.
2. Rota nova `POST /auth/confirm-email` (resposta `MeResponse & { requires_session_refresh: true }`). Proposta: adicionar `ConfirmEmailResponse` em `registration.ts`.
3. Faltam no contrato os schemas de resposta: `/auth/send-link` (`{status, message}`), moderação (`{proposal_id, group_id, status}` / `{id, status, version}`) e as listas admin (`{kind, items, next_cursor}`).
4. `AdminActivity.description` hoje leva a versão sanitizada. Se a moderação precisar do texto bruto, explicitar isso no contrato.
5. (BE-2) Faltam schemas de resposta para as rotas de suspensão (`{id, status, updated_at}` para grupo; `{id, status, version}` para atividade) e um schema de entrada `{reason?}` para `reveal-contact`.
6. (BE-2) `AdminGroupProposal.status` usa `GroupStatus`, mas o status de **proposta** é só `pending|active|rejected`; sugerir um `GroupProposalStatus` próprio.
7. (BE-2) `AdminGroupPatch.status` aceita `active` e pode reativar um grupo `suspended` por fora de `/unsuspend` (fica auditado como `group.update`). Sugestão: documentar que PATCH não mexe em grupo suspenso ou restringir no contrato.
