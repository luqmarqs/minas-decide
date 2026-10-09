# API — contratos implementados (Worker Hono, `/api/v1`)

Fonte de verdade dos schemas: `shared/contracts/*.ts`. Implementação: `worker/`. Estado em 2026-10-08 (BE-1).

**Envelope.** Sucesso `{ data, meta: { request_id } }`; erro `{ error: { code, message, fields? }, meta }`. Status por código em `HTTP_STATUS_BY_CODE`. Zod → `VALIDATION_ERROR` com `fields` (caminho → mensagem). Nunca stack/SQL. Header `X-Request-Id` em toda resposta; `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`.

**Globais.** Corpo máx. 32 KB (`VALIDATION_ERROR`). `WRITES_ENABLED !== 'true'` → toda mutação responde 503 `WRITES_SUSPENDED` (GETs seguem). Rate limit best-effort por isolate, chave `CF-Connecting-IP` + bucket (`X-Forwarded-For` é ignorado). Log estruturado por requisição: `{request_id, route, method, status, ms, rate_limited}`.

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
| POST | `/groups/proposals` | opcional | `GroupProposalInput`; telefone → E.164; Turnstile (action `group_proposal`); território existe; idempotência por `idempotency_key` ou hash do conteúdo (território+URL+e-mail); sanitização | 5/10min | no-store | 201 nova, 200 repetida, 400, 429, 503 |
| GET | `/activities?bbox=&territory_id=&from=&to=&limit=&cursor=` | — | bbox ≤ 15° por lado; `from` padrão = agora − 6h; município inclui bairros; cursor opaco (base64url de `starts_at`+`id`); só `published`/`cancelled` | — | public 60s | 200, 400 |
| GET | `/activities/:id` | — | UUID; só publicada/cancelada | — | public 60s | 200, 404 |
| POST | `/activities/:id/rsvp` | opcional | `RsvpInput` (corpo pode ser vazio); identidade = `user_id` da sessão ou HMAC do cookie `mm_device` (criado se ausente) | 30/10min | no-store | 200, 401 (token inválido), 404 (não pública), 409 (cancelada), 429 |
| DELETE | `/activities/:id/rsvp` | opcional | só a mesma identidade | 30/10min | no-store | 200, 403 (sem identidade), 404 (identidade sem RSVP / não pública) |
| POST | `/registrations` | sessão **provisória** | `RegistrationInput`; Turnstile (action `registration`); território existe; e-mail de outra conta → 409 neutro; perfil + `updateUserById(email, email_confirm:false)` com compensação; envio de magic link | 5/10min | no-store | 201, 200 (reenvio idempotente), 400, 401, 409, 429, 500 |
| GET | `/me` | sessão | campos mínimos; e-mail mascarado | — | no-store | 200, 401 |
| PATCH | `/me` | sessão | `MePatch` (nome, território, opt-in); exige perfil | — | no-store | 200, 400, 401, 404 |
| GET | `/my-activities?limit=&cursor=` | organizador | só as próprias (todos os status) | — | no-store | 200, 401, 403 |
| POST | `/activities` | organizador | `ActivityInput`; início no futuro; fim > início; contato público validado (whatsapp E.164, e-mail, @instagram) só com opt-in; título/descrição/endereço sanitizados; território existe; Turnstile verificado **se enviado**; status `pending_review`; auditado | 20/10min | no-store | 201, 400, 401, 403, 429 |
| PATCH | `/activities/:id` | autor organizador ou admin | `ActivityPatch` + `version` (409 se divergir); só `draft`/`pending_review`/`published`; mudança em título/descrição/data/endereço/coordenadas/território de uma publicada feita pelo autor → `pending_review`; contato off → oculto na hora; auditado | 20/10min | no-store | 200, 400, 401, 403, 404 (não dono), 409 |
| POST | `/activities/:id/cancel` | autor organizador ou admin | `{version?, reason?}`; auditado | 20/10min | no-store | 200, 401, 403, 404, 409 |
| POST | `/auth/send-link` | — | `SendLinkInput`; Turnstile; `signInWithOtp(shouldCreateUser:false)`; resposta sempre neutra | 3/10min | no-store | 202, 400, 429 |
| POST | `/auth/confirm-email` **(nova)** | sessão | exige e-mail confirmado no Auth **e** `amr` da sessão com `otp`/`magiclink`; promove a permanente (`updateUserById(email igual, email_confirm:true)`), revoga as outras sessões, perfil → `verified`; retorna `MeResponse` + `requires_session_refresh` | — | no-store | 200, 401, 403 |
| GET | `/admin/queue?kind=groups\|activities&status=&limit=&cursor=` | admin+MFA | propostas com e-mail e telefone **mascarados**; atividades `pending_review` por padrão | — | no-store | 200, 400, 401, 403 |
| POST | `/admin/groups/:id/approve` | admin+MFA | `:id` = **id da proposta**; `{reason?}`; transacional (`approve_group_proposal`) | — | no-store | 200, 403, 404, 409 |
| POST | `/admin/groups/:id/reject` | admin+MFA | `ModerationDecision` (motivo obrigatório) | — | no-store | 200, 400, 403, 404, 409 |
| POST | `/admin/activities/:id/approve` | admin+MFA | `{reason?}`; só de `pending_review` | — | no-store | 200, 403, 404, 409 |
| POST | `/admin/activities/:id/reject` | admin+MFA | `ModerationDecision` | — | no-store | 200, 400, 403, 404, 409 |
| PATCH | `/admin/groups/:id` | admin+MFA | `AdminGroupPatch`; URL de convite oficial; auditado com motivo | — | no-store | 200, 400, 403, 404, 409 |
| POST | `/admin/groups/:id/managers` | admin+MFA | `GroupManagerInput`; telefone E.164; privado; auditado | — | no-store | 201, 400, 403, 404 |
| GET | `/admin/security-events?limit=&cursor=` | admin+MFA | só `id, created_at, route, event_type, block_code` | — | no-store | 200, 403 |

Admin negado gera um `abuse_event` (`admin_denied`, sem IP bruto).

## Validação feita

- `worker/tests/*.test.ts`: 64 testes com `app.request()` e fakes em memória.
- `scripts/db/smoke-worker.ts`: 33 verificações contra `wrangler dev` local + TARGET dev real, todas passaram em 2026-10-08.

## Mudanças de contrato desejadas (não aplicadas em `shared/contracts`)

1. `ActivityPatch = ActivityInput.partial()`: no Zod 4, `public_contact_opt_in.default(false)` continua valendo dentro do `partial()`, e todo PATCH chega com `public_contact_opt_in:false`. O Worker contorna isso aplicando só as chaves presentes no JSON bruto. Sugestão: construir o patch a partir de um schema sem `default`.
2. Rota nova `POST /auth/confirm-email` (resposta `MeResponse & { requires_session_refresh: true }`). Proposta: adicionar `ConfirmEmailResponse` em `registration.ts`.
3. Faltam no contrato os schemas de resposta: `/auth/send-link` (`{status, message}`), moderação (`{proposal_id, group_id, status}` / `{id, status, version}`) e as listas admin (`{kind, items, next_cursor}`).
4. `AdminActivity.description` hoje leva a versão sanitizada. Se a moderação precisar do texto bruto, explicitar isso no contrato.
