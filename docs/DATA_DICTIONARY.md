# Dicionário de dados — Supabase TARGET (`minas-em-movimento-dev`)

Migrations: `supabase/migrations/0001…0010` (0001–0009 aplicadas em 2026-10-08/09; `0010_round2_hardening.sql` aplicada via `npm run db:push` em 2026-10-09). Tipos gerados: `shared/types/database.ts`.

- **Coordenadas:** `double precision` lon/lat com CHECK de faixa. Atividades têm também `activities_location_mg_check` (bbox de MG: lon −51,1…−39,8; lat −23,0…−14,2) desde 0010. Sem PostGIS no MVP; bbox via índices btree.
- **IDs de território:** `mg`, `mg-<ibge7>`, `mg-<ibge7>-<slug>`.
- **Escrita:** nenhuma tabela tem grant de escrita para `anon`/`authenticated`. Toda escrita passa pelo Worker com `service_role`.

## Schema `public` (exposto na Data API)

### `territories`
Dados de referência, carregados de `public/data/<release>/territories-index.json` por `scripts/db/load-territories.ts` (upsert idempotente). No TARGET dev: 1 estado, 853 municípios, 6077 bairros.

- **Colunas:** `id` PK, `type` (state/municipality/neighborhood), `name`, `normalized_name`, `parent_id` → territories (restrict), `state_code` = MG, `ibge_code` (2 dígitos para o estado, 7 para município), `slug`, `municipality_name`, `centroid_lon`, `centroid_lat`, `data_quality`, `created_at`, `updated_at`.
- **Exposição:** SELECT para anon/authenticated (RLS `using (true)`).

### `whatsapp_groups`
- **Colunas:** `id`, `territory_id` → territories (cascade), `display_name`, `join_url` (regex `chat.whatsapp.com`), `status` pending/active/inactive/rejected/**suspended** (0010), `source_proposal_id` UNIQUE (T28), `created_by`, `approved_by`, `approved_at`, `last_checked_at`, `created_at`, `updated_at`. Índice único de `join_url` ativo.
- **Exposição:**
  - sem SELECT de tabela para anon/authenticated;
  - **SELECT por coluna** só nas colunas públicas (`id, display_name, territory_id, join_url, status, updated_at`) + RLS `status='active'`;
  - `select=*` → 401/403 (42501).

### `whatsapp_groups_public` (view, `security_invoker`, `security_barrier`)
Projeção pública de grupos `active`. SELECT para anon/authenticated.

### `activities`
- **Colunas:** `id`, `creator_user_id` → auth.users (cascade), `territory_id` (cascade), `title`, `type`, `description` (bruta, privada), `description_sanitized`, `starts_at`, `ends_at` (> início), `timezone` = America/Sao_Paulo, `public_address`, `location_lon`, `location_lat` (bbox de MG), `location_precision`, `status` (draft/pending_review/published/rejected/cancelled/archived/**suspended**), CHECK `activities_duration_check` (`ends_at ≤ starts_at + 24 h`, 0010), `public_contact_opt_in`, `public_contact_type`, `public_contact_value`, `contact_public_type`, `contact_public_value` (**gerados**: nulos sem opt-in), `reviewed_by`, `reviewed_at`, `review_reason`, `cancelled_at`, `version`, `created_at`, `updated_at`.
- **Exposição:**
  - SELECT por coluna só nas públicas (nunca criador, revisor, motivo, descrição bruta ou contato bruto);
  - RLS: anon/authenticated veem `published`/`cancelled`; authenticated também vê as próprias (`creator_user_id = auth.uid()`), sempre com as mesmas colunas públicas;
  - sem INSERT/UPDATE/DELETE.

### `activities_public` (view, `security_invoker`)
- **Colunas:** `id, title, type, description_sanitized, starts_at, ends_at, timezone, location_public, location_lon, location_lat, territory_id, status, contact_public_type, contact_public_value, rsvp_count, updated_at`.
- **Conteúdo:** só `published`/`cancelled`.

### Funções públicas
- **`activity_rsvp_count(uuid)`:** SECURITY DEFINER, executável por anon/authenticated. Conta `going` apenas de atividades públicas.
- **`svc_*`:** pontos de entrada do Worker, executáveis **só por service_role** (EXECUTE revogado de public/anon/authenticated):
  - `svc_is_admin`, `svc_is_email_verified`, `svc_email_in_use`;
  - `svc_get_profile`, `svc_create_profile`, `svc_delete_profile`, `svc_update_profile`, `svc_grant_admin`;
  - `svc_create_group_proposal` (0010: `p_idempotency_ttl_seconds`, só deduplica contra pendente não expirada), `svc_list_group_proposals` (0010: inclui `group_id`), `svc_approve_group_proposal`, `svc_reject_group_proposal`, `svc_add_group_manager`;
  - **0010:** `svc_reveal_proposal_contact` (lê e audita na mesma transação), `svc_erase_group_proposals` (eliminação por id, auditada), `svc_suspend_group`, `svc_unsuspend_group`, `svc_suspend_activity`, `svc_unsuspend_activity`;
  - `svc_update_profile` (0010: `p_phone`, `p_review_required`);
  - `svc_approve_activity`, `svc_reject_activity`, `svc_upsert_rsvp`;
  - `svc_record_audit`, `svc_record_abuse`, `svc_list_security_events`, `svc_consume_turnstile_token`, `svc_purge_expired`.

  Motivo: `app_private` não está exposto, então o PostgREST do Worker só chega lá por essas funções.

## Schema `app_private` (NÃO exposto; sem USAGE para anon/authenticated)
Todas as tabelas: RLS ligada, nenhuma policy (nega tudo), grants só para `service_role`.

| Tabela | Colunas | Observações |
|---|---|---|
| `profiles` | `user_id` PK → auth.users (cascade), `display_name`, `email_contact` (**não prova identidade**), `email_verification_state` unverified/pending/verified, `phone_e164`, `selected_territory_id`, `consent_version`, `contact_opt_in_at`, `account_state` active/suspended, `review_required_at` (0010, P-SEC-1: preenchido na promoção por magic link; nulo após a revisão), timestamps | PII |
| `admins` | `user_id` PK, `created_at`, `created_by` | sem rota pública de promoção; bootstrap só por script local |
| `group_proposals` | território (cascade), `name_proposed`, `join_url_proposed`, `proposer_name`, `proposer_email`, `proposer_phone` E.164, `proposer_user_id`, `consent_version`, `status` pending/active/rejected, `group_id`, `reviewed_by`, `reviewed_at`, `review_reason`, `idempotency_key_hash` (único parcial), `idempotency_expires_at` (0010; 24 h; liberado quando a proposta é decidida ou expira), `fingerprint_hash` (HMAC do IP), `fingerprint_expires_at` (30 dias). `group_id` é preenchido por `approve_group_proposal` | PII |
| `group_managers` | `group_id` (cascade), `name`, `email`, `phone`, `role_label`, `created_by` | PII, só admin |
| `activity_rsvps` | `activity_id` (cascade), `user_id` ou `anonymous_subject_hash` (exatamente um), `status` going/cancelled, `source` session/device, `idempotency_key_hash` | únicos parciais `(activity_id,user_id)` e `(activity_id,anonymous_subject_hash)` |
| `audit_events` | `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `reason`, `before_hash`/`after_hash`, `retention_class` | append-only, sem PII |
| `abuse_events` | `subject_hash` (HMAC), `route`, `event_type`, `block_code`, `created_at` | sem IP bruto; retenção de 90 dias |
| `turnstile_tokens_used` | `token_hash` PK (sha256), `expires_at` | uso único (T17) |

### Funções `app_private`
Todas SECURITY DEFINER, com `search_path=''` e EXECUTE só para service_role.

- **Leitura de identidade:** `is_admin(uid)`, `is_email_verified(uid)` (lê `auth.users.email_confirmed_at`), `email_in_use(email, exclude)`.
- **Moderação de grupos:**
  - `approve_group_proposal(p_id, p_admin, p_reason, p_request_id?)` → uuid do grupo. Faz `UPDATE … WHERE status='pending' RETURNING`, rechecagem de admin e auditoria.
  - `reject_group_proposal(…)`.
- **Moderação de atividades:** `approve_activity(…)`, `reject_activity(…)`.
- **Suspensão (0010):** `set_group_suspension(id, admin, reason, request_id, suspend)` (`active|inactive` ↔ `suspended`; volta a `active`) e `set_activity_suspension(…)` (`draft|pending_review|published|cancelled` → `suspended`; volta a `pending_review`). Rechecam admin, exigem motivo (PT422), transição inválida → PT409, auditam `group.suspend`/`group.unsuspend`/`activity.suspend`/`activity.unsuspend`.
- **RSVP:** `upsert_rsvp(activity, user, subject_hash, going, idem)` → `{going, rsvp_count}`.
- **Manutenção:** `consume_turnstile_token(hash, ttl)`, `purge_expired()`, `touch_updated_at()` (trigger).

### Códigos de erro das funções
`PT400`, `PT403`, `PT404`, `PT409`, `PT422`. O Worker os mapeia para `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` e `UNPROCESSABLE`.

## Seed
`supabase/seed.sql` tem só dados sintéticos `DEMO`: município `mg-0000001`, um grupo ativo, uma atividade publicada e um organizador fictício `@demo.invalid`. Roda apenas em `supabase db reset` num stack local. **Não** é aplicado pelo `npm run db:push` e não deve ir para o TARGET sem decisão explícita. **NÃO EXECUTADO** (não há Docker).
