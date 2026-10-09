# Dicionário de dados — Supabase TARGET (`minas-em-movimento-dev`)

Migrations: `supabase/migrations/0001…0012` (0001–0009 aplicadas em 2026-10-08/09; `0010_round2_hardening.sql` e `0011_qa2_fixes.sql` (BE-3) e `0012_clerk_user_ids.sql` (BE-5, ADR 0005) aplicadas via `npm run db:push` em 2026-10-09). Tipos gerados: `shared/types/database.ts`.

## 0012 — identidade Clerk (ADR 0005)

- **IDs de usuário = id do Clerk** (`text`, formato `user_[A-Za-z0-9]{1,64}`, CHECK `<coluna>_clerk_id_check`), **sem FK** para `auth.users`: `profiles.user_id` (PK), `admins.user_id` (PK), `admins.created_by`, `activities.creator_user_id`, `activities.reviewed_by`, `activity_rsvps.user_id`, `group_proposals.proposer_user_id`, `group_proposals.reviewed_by`, `group_managers.created_by`, `whatsapp_groups.created_by`, `whatsapp_groups.approved_by`. `audit_events.actor_user_id` virou `text` (≤ 80) sem CHECK de formato (mantém uuids históricos). Índices (PKs, `activity_rsvps_user_uidx`, `activities_creator_idx`) foram reconstruídos pelo `ALTER TYPE`.
- **Sem cascata de identidade:** apagar um usuário no Clerk não apaga nada no banco; a eliminação é `svc_erase_user_data(p_user, p_request_id?)` (RSVPs, atividades criadas, perfil, linha de admin; anula `proposer_user_id`; auditada como `user.erase`, sem PII). `svc_dev_wipe_identities` apaga todas as identidades (só limpeza de dev).
- **`is_email_verified(uid)`** = `profiles.email_verification_state = 'verified'` **e** `account_state = 'active'` (o Worker só grava `verified` com o e-mail confirmado pelo Clerk e reconfere o Clerk a cada requisição). **`email_in_use`** olha `profiles.email_contact` de outros perfis (sem caixa).
- **`profiles.review_required_at`** (P-SEC-1) **descontinuado**: mantido, sempre nulo; `svc_update_profile` perdeu `p_review_required`.
- **Sem acesso direto do navegador:** 0012 revogou todo grant de `anon`/`authenticated` em `territories`, `whatsapp_groups`, `whatsapp_groups_public`, `activities`, `activities_public` e `activity_rsvp_count`; removeu a política `activities_owner_read` (`auth.uid()`). As políticas RLS restantes ficam como defesa em profundidade. Supabase Auth: `enable_anonymous_sign_ins = false` e `enable_signup = false` (config push).
- Rollback documentado no topo da migration (exige esvaziar as tabelas de identidade).

> As seções abaixo descrevem 0001–0011; onde citam `auth.users`, `auth.uid()`, grants a `anon`/`authenticated` ou `review_required_at`, vale o que está acima.

- **Coordenadas:** `double precision` lon/lat com CHECK de faixa. Atividades têm também `activities_location_mg_check` (bbox de MG: lon −51,1…−39,8; lat −23,0…−14,2) desde 0010. Sem PostGIS no MVP; bbox via índices btree.
- **IDs de território:** `mg`, `mg-<ibge7>`, `mg-<ibge7>-<slug>`.
- **Escrita:** nenhuma tabela tem grant de escrita para `anon`/`authenticated`. Toda escrita passa pelo Worker com `service_role`.

## Schema `public` (exposto na Data API)

### `territories`
Dados de referência, carregados de `public/data/<release>/territories-index.json` por `scripts/db/load-territories.ts` (upsert idempotente). No TARGET dev: 1 estado, 853 municípios, 6077 bairros.

- **Colunas:** `id` PK, `type` (state/municipality/neighborhood), `name`, `normalized_name`, `parent_id` → territories (restrict), `state_code` = MG, `ibge_code` (2 dígitos para o estado, 7 para município), `slug`, `municipality_name`, `centroid_lon`, `centroid_lat`, `data_quality`, `created_at`, `updated_at`.
- **Exposição:** desde 0012 só `service_role` (Worker). Antes: SELECT para anon/authenticated (RLS `using (true)`).

### `whatsapp_groups`
- **Colunas:** `id`, `territory_id` → territories (cascade), `display_name`, `join_url` (regex `chat.whatsapp.com`), `status` pending/active/inactive/rejected/**suspended** (0010), `status_before_suspension` (0011, `active`/`inactive` ou nulo; sem grant para anon/authenticated), `source_proposal_id` UNIQUE (T28), `created_by`, `approved_by`, `approved_at`, `last_checked_at`, `created_at`, `updated_at`. Índice único de `join_url` ativo.
- **Exposição:**
  - sem SELECT de tabela para anon/authenticated;
  - **SELECT por coluna** só nas colunas públicas (`id, display_name, territory_id, join_url, status, updated_at`) + RLS `status='active'`;
  - `select=*` → 401/403 (42501).

### `whatsapp_groups_public` (view, `security_invoker`, `security_barrier`)
Projeção pública de grupos `active`. SELECT para anon/authenticated.

### `activities`
- **Colunas:** `id`, `creator_user_id` (id do Clerk, 0012; antes → auth.users), `territory_id` (cascade), `title`, `type`, `description` (bruta, privada), `description_sanitized`, `starts_at`, `ends_at` (> início), `timezone` = America/Sao_Paulo, `public_address`, `location_lon`, `location_lat` (bbox de MG), `location_precision`, `status` (draft/pending_review/published/rejected/cancelled/archived/**suspended**), `status_before_suspension` (0011; sem grant para anon/authenticated), CHECK `activities_duration_check` (`ends_at ≤ starts_at + 24 h`, 0010), `public_contact_opt_in`, `public_contact_type`, `public_contact_value`, `contact_public_type`, `contact_public_value` (**gerados**: nulos sem opt-in), `reviewed_by`, `reviewed_at`, `review_reason`, `cancelled_at`, `version`, `created_at`, `updated_at`.
- **Exposição:**
  - SELECT por coluna só nas públicas (nunca criador, revisor, motivo, descrição bruta ou contato bruto);
  - RLS: anon/authenticated veem `published`/`cancelled`; authenticated também vê as próprias (`creator_user_id = auth.uid()`), sempre com as mesmas colunas públicas;
  - sem INSERT/UPDATE/DELETE.

### `activities_public` (view, `security_invoker`)
- **Colunas:** `id, title, type, description_sanitized, starts_at, ends_at, timezone, location_public, location_lon, location_lat, territory_id, status, contact_public_type, contact_public_value, rsvp_count, updated_at`.
- **Conteúdo:** só `published`/`cancelled`.

### Funções públicas
- **`activity_rsvp_count(uuid)`:** SECURITY DEFINER, executável só por service_role desde 0012 (antes anon/authenticated). Conta `going` apenas de atividades públicas.
- **`svc_*`:** pontos de entrada do Worker, executáveis **só por service_role** (EXECUTE revogado de public/anon/authenticated):
  - `svc_is_admin`, `svc_is_email_verified`, `svc_email_in_use`;
  - `svc_get_profile`, `svc_create_profile`, `svc_delete_profile`, `svc_update_profile`, `svc_grant_admin`;
  - `svc_create_group_proposal` (0010: `p_idempotency_ttl_seconds`, só deduplica contra pendente não expirada), `svc_list_group_proposals` (0010: inclui `group_id`), `svc_approve_group_proposal` (0011: devolve `{group_id, territory_id}`), `svc_reject_group_proposal` (0011: devolve `{proposal_id, territory_id}`), `svc_add_group_manager`;
  - **0010:** `svc_reveal_proposal_contact` (lê e audita na mesma transação), `svc_erase_group_proposals` (eliminação por id, auditada), `svc_suspend_group`, `svc_unsuspend_group`, `svc_suspend_activity`, `svc_unsuspend_activity` (0011: devolve `{version, status}`);
  - `svc_update_profile` (0010: `p_phone`; 0011: `p_email_contact`, re-sincroniza com o e-mail principal verificado no Clerk; 0012: sem `p_review_required`, `p_user text`);
  - **0012:** `svc_erase_user_data`, `svc_dev_wipe_identities`; todos os parâmetros de usuário (`p_user`, `p_admin`, `p_actor`, `p_exclude`, `p_proposer_user_id`, `p_created_by`) são `text`;
  - `svc_approve_activity`, `svc_reject_activity`, `svc_upsert_rsvp`;
  - `svc_record_audit`, `svc_record_abuse`, `svc_list_security_events`, `svc_consume_turnstile_token`, `svc_purge_expired`.

  Motivo: `app_private` não está exposto, então o PostgREST do Worker só chega lá por essas funções.

## Schema `app_private` (NÃO exposto; sem USAGE para anon/authenticated)
Todas as tabelas: RLS ligada, nenhuma policy (nega tudo), grants só para `service_role`.

| Tabela | Colunas | Observações |
|---|---|---|
| `profiles` | `user_id` PK (id do Clerk, 0012; antes → auth.users), `display_name`, `email_contact` (**não prova identidade**), `email_verification_state` unverified/pending/verified, `phone_e164`, `selected_territory_id`, `consent_version`, `contact_opt_in_at`, `account_state` active/suspended, `review_required_at` (0010; **descontinuado em 0012**, sempre nulo), timestamps | PII |
| `admins` | `user_id` PK, `created_at`, `created_by` | sem rota pública de promoção; bootstrap só por script local |
| `group_proposals` | território (cascade), `name_proposed`, `join_url_proposed`, `proposer_name`, `proposer_email`, `proposer_phone` E.164, `proposer_user_id`, `consent_version`, `status` pending/active/rejected, `group_id`, `reviewed_by`, `reviewed_at`, `review_reason`, `idempotency_key_hash` (único parcial), `idempotency_expires_at` (0010; 24 h; liberado quando a proposta é decidida ou expira), `fingerprint_hash` (HMAC do IP), `fingerprint_expires_at` (30 dias). `group_id` é preenchido por `approve_group_proposal` | PII |
| `group_managers` | `group_id` (cascade), `name`, `email`, `phone`, `role_label`, `created_by` | PII, só admin |
| `activity_rsvps` | `activity_id` (cascade), `user_id` ou `anonymous_subject_hash` (exatamente um), `status` going/cancelled, `source` session/device, `idempotency_key_hash` | únicos parciais `(activity_id,user_id)` e `(activity_id,anonymous_subject_hash)` |
| `audit_events` | `actor_user_id`, `action`, `entity_type`, `entity_id`, `request_id`, `reason`, `before_hash`/`after_hash`, `retention_class` | append-only, sem PII |
| `abuse_events` | `subject_hash` (HMAC), `route`, `event_type`, `block_code`, `created_at` | sem IP bruto; retenção de 90 dias |
| `turnstile_tokens_used` | `token_hash` PK (sha256), `expires_at` | uso único (T17) |

### Funções `app_private`
Todas SECURITY DEFINER, com `search_path=''` e EXECUTE só para service_role.

- **Leitura de identidade:** `is_admin(uid)`, `is_email_verified(uid text)` (0012: lê `profiles.email_verification_state` + `account_state`), `email_in_use(email, exclude)`.
- **Moderação de grupos:**
  - `approve_group_proposal(p_id, p_admin, p_reason, p_request_id?)` → uuid do grupo. Faz `UPDATE … WHERE status='pending' RETURNING`, rechecagem de admin e auditoria.
  - `reject_group_proposal(…)`.
- **Moderação de atividades:** `approve_activity(…)`, `reject_activity(…)`.
- **Suspensão (0010):** `set_group_suspension(id, admin, reason, request_id, suspend)` (`active|inactive` ↔ `suspended`; desde 0011 guarda `status_before_suspension` e volta ao status anterior) e `set_activity_suspension(…)` (`draft|pending_review|published|cancelled` → `suspended`; desde 0011 volta a `cancelled` se estava cancelada, senão a `pending_review`). Rechecam admin, exigem motivo (PT422), transição inválida → PT409, auditam `group.suspend`/`group.unsuspend`/`activity.suspend`/`activity.unsuspend`.
- **RSVP:** `upsert_rsvp(activity, user, subject_hash, going, idem)` → `{going, rsvp_count}`.
- **Manutenção:** `consume_turnstile_token(hash, ttl)`, `purge_expired()`, `touch_updated_at()` (trigger).

### Códigos de erro das funções
`PT400`, `PT403`, `PT404`, `PT409`, `PT422`. O Worker os mapeia para `VALIDATION_ERROR`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT` e `UNPROCESSABLE`.

## Seed
`supabase/seed.sql` tem só dados sintéticos `DEMO`: município `mg-0000001`, um grupo ativo, uma atividade publicada e um organizador fictício `@demo.invalid`. Roda apenas em `supabase db reset` num stack local. **Não** é aplicado pelo `npm run db:push` e não deve ir para o TARGET sem decisão explícita. **NÃO EXECUTADO** (não há Docker).

## Snapshot eleitoral público (`public/data/`) — arquivos e campos da rodada 3

Gerado offline (`npm run etl:build`), sem banco em runtime. Contratos em `shared/contracts/metrics.ts` e `shared/contracts/snapshot.ts`.

### `<release>/metrics/*.json` → `TerritoryMetrics.president_comparison`

| Campo | Tipo | Significado |
|---|---|---|
| `precision` | `exact` \| `approximate` \| `unavailable` | estado e municípios: `exact` (TSE); bairros: `approximate` (locais de 2022 associados) ou `unavailable` (município com < 80 % dos válidos de 2022 associados, ou bairro sem local de 2022) |
| `entries[]` | 2 itens, `key` = `lula` \| `bolsonaro` | Lula (13) 2022/2026; Jair Bolsonaro (22, 2022) / Flávio Bolsonaro (22, 2026) |
| `votes_2022_r1`, `valid_2022_r1`, `share_2022_r1` | int, int, 0..1 | 1º turno de 2022 (válidos de Presidente); `null` se `unavailable` |
| `votes_2022_r2`, `valid_2022_r2`, `share_2022_r2` | int, int, 0..1 | 2º turno de 2022 (referência) |
| `votes_2026_r1`, `valid_2026_r1`, `share_2026_r1` | int, int, 0..1 | 1º turno de 2026 (= `results.president` e `valid_by_office.president`) |
| `delta_pp_r1` | número | `(share_2026_r1 − share_2022_r1) × 100`, 0,01 p.p. |
| `delta_votes_r1` | int | `votes_2026_r1 − votes_2022_r1` |
| `note` | texto | fonte e ressalvas (aproximação, sem transferência de votos) |

`comparison_2022` permanece no contrato, sempre `[]`; `has_history` é sempre `false` em `results` e `candidates.json`.

### `<release>/layers/2026-r1-president_comparison-{lula,bolsonaro}.json` (`MapLayerValues`)

`layer: 'president_comparison'`, `unit: 'pp'`, `candidate_id: 'lula' | 'bolsonaro'`, `values` = `delta_pp_r1` por município (853), `domain` simétrico `[-m, m]` (m = maior |delta|). Camadas `comparison-<id>` não existem mais.

### `<release>/layers/{2026-r1,2022-r1,2022-r2}-president_margin.json` (`MapLayerValues`)

`layer: 'president_margin'`, `unit: 'pp'`, `candidate_id: null`, `values` = (votos Lula − votos Bolsonaro) ÷ válidos × 100 por município (853; positivo = Lula à frente), `domain` simétrico.

### `<release>/highlights.json` (`Highlights`)

`items[]`: `id`, `label`, `value`, `unit` (`people` \| `percent` \| `pp` \| `votes` \| `count`), `compare_value`/`compare_label` (número secundário: total nacional, % ou votos), `note`, `source` (rótulo **curto** para a interface, D32: `TSE` = apuração 2026 do extrato, `TSE 2022` = dados abertos 2022, `TSE · eleitorado 2026` = aptos/ranking, `IBGE` = malha/municípios, `OpenStreetMap` = POIs; sempre preenchido), `source_detail` (proveniência completa: arquivos, Last-Modified, snapshot — exibida só na metodologia). **`percent` em escala 0–100.** Ids: `mg_eligible_2026`, `mg_share_national_eligible_2026`, `mg_rank_eligible_2026` (posição; `compare_value` = nº de UFs), `mg_municipalities`, `mg_turnout_2026_r1`, `mg_abstention_2026_r1`, `mg_2026_r1_{lula,flavio}_{votes,share}`, `mg_2026_r1_margin_votes`, `mg_2022_r1_{lula,bolsonaro}_votes`, `mg_2022_r1_margin_votes`, `mg_2022_r2_{lula,bolsonaro}_votes`, `mg_2022_r2_margin_votes`, `br_2022_r2_{lula,bolsonaro}_share`, `br_2022_r2_margin_votes`, `mg_{2026_r1,2022_r2}_municipalities_led_{lula,bolsonaro}`, `mg_2026_r1_other_candidates_votes`, `mg_2026_r1_blank_null_votes`, `mg_2026_r1_abstention_votes`, `mg_2026_r1_neither_of_two`, `mg_2022_r2_blank_null_votes`, `mg_2022_r2_abstention_votes` (margens = Lula − Bolsonaro; negativo = Bolsonaro à frente). `why_minas[]`: `title`, `text` (frase com números calculados), `value`, `unit`, `source` (curto), `source_detail`.

### `pois/terminais-mg.json` (`PoiFile`, fora do release e do manifesto)

`generated_at`, `source` (endpoint Overpass, data da base OSM e da consulta), `license: 'ODbL 1.0'`, `attribution: '© OpenStreetMap contributors'`, `items[]`: `id` (`osm-<tipo>-<id>`), `name`, `category` (`bus_terminal` = `amenity=bus_station`; `bus_station` = estação BRT/MOVE ou `public_transport=station`+`bus=yes`; `metro_station` = `railway=station`+`station=subway`), `coordinates` `[lon, lat]`, `municipality_id` (ponto-em-polígono na malha IBGE), `osm_url`.

## Geometrias de bairro (`public/geo/bairros/`, fora do release e do manifesto) — D29 / DATA-6

Gerado por `npm run geo:bairros` (offline; arquivos locais + malha pública de bairros do IBGE em cache; nunca o SOURCE); validado por `npm run geo:validate`.

### `bairros/<ibge7>.geojson` (um por município com local de votação)

`FeatureCollection` de `Feature` com geometria **`MultiPolygon`** (lon/lat, 5 casas decimais). `properties`:

| Campo | Tipo | Descrição |
|---|---|---|
| `territory_id` | string | `mg-<ibge7>-<slugify(bairro)>` — sempre existe em `territories-index.json` (tipo `neighborhood`) |
| `name` | string | nome do bairro no índice do snapshot |
| `municipality_id` | string | `mg-<ibge7>` |
| `polling_places` | number | nº de locais de votação do bairro no extrato |
| `method` | `official-ibge-cd2022` \| `owner-provided` \| `voronoi-polling-places` | origem da área |
| `official` | boolean | `true` para limite oficial (IBGE CD2022 ou fornecido pelo proprietário) |
| `approx` | boolean | `true` ⇔ `method = voronoi-polling-places` (área aproximada, **não** é limite oficial) |
| `whole_municipality` | boolean | município com um único bairro e sem malha oficial: a área é o polígono municipal inteiro |
| `approx_coords_only` | boolean | área Voronoi calculada só com locais de `coord_aproximada = true` |
| `official_name` | string? | só oficiais: nome na malha oficial (`NM_BAIRRO`; vários unidos por " / " se o mesmo nome aparece em mais de um polígono) |
| `official_code` | string\|null? | só oficiais: `CD_BAIRRO` (vírgula se vários) |
| `match` | `direct` \| `prefix`? | só oficiais: casamento por slug idêntico ou após remover "Bairro "/"Vila " |

### `bairros/index.json`

`release`, `methods`, `decimals`, `note`, `attribution`, `sources[]` (`name`, `url`, `crs`), `totals` (`municipalities`, `neighborhoods_with_area`, `neighborhoods_without_area`, `by_method`, `municipalities_with_official_mesh`, `official_neighborhoods_in_mesh`, `official_matched`, `bytes`), `municipalities[]` (`ibge`, `municipality_id`, `file`, `neighborhoods`, `by_method`, `bytes`).

O relatório de casamento por nome (oficiais × índice, não casados dos dois lados) fica em `data/private/geo/match-report.json` (local, não publicado).
