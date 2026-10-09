# ARCHITECTURE

```
                         ┌──────────────────────────────────────────────────┐
                         │  Supabase LEGADO (SOURCE) — dashboard-eleicoes   │
                         │  somente leitura; nunca em runtime               │
                         └───────────────┬──────────────────────────────────┘
                                         │ supabase db query (BEGIN READ ONLY)
                                         │ workdir isolado fora do repo
                         ┌───────────────▼──────────────────────────────────┐
                         │  scripts/import-electoral (ETL offline)          │
                         │  export.ts → data/private/extract/<release>/     │
                         │  build-snapshot.ts → public/data/<release>/      │
                         │  validate-snapshot.ts (hashes, contratos, PII)   │
                         └───────────────┬──────────────────────────────────┘
                                         │ arquivos estáticos versionados
┌──────────────┐   /  /territorio ...    ▼                                  ┌───────────────────────┐
│  Navegador   │◄──────────────── Cloudflare Workers Static Assets (dist/)  │  OpenFreeMap tiles    │
│  React SPA   │                  public/data/manifest.json + <release>/…   │  IBGE malha municipal │
│  MapLibre    │──── /api/v1/* ─► Worker Hono ──► Supabase NOVO (TARGET)    └───────────────────────┘
│  supabase-js │──── Auth (anon sign-in, magic link) ─► TARGET Auth
└──────────────┘
```

## Componentes

| Componente | Responsabilidade | Código |
|---|---|---|
| SPA React | busca territorial (índice estático), mapa e painel, páginas públicas, formulários, admin (lazy) | `src/` |
| Worker Hono | validação Zod, Turnstile, rate limit, auth (JWT Supabase), mutações com service role, projeções públicas sem PII, auditoria | `worker/` |
| TARGET (Supabase) | Auth, `app_private.*` (perfis, propostas, responsáveis, RSVP, auditoria), `public.*` (territórios, grupos, atividades + views públicas), RLS/grants | `supabase/migrations` |
| Snapshot | agregados eleitorais por estado/município/bairro, camadas de mapa, metodologia, manifest com SHA-256 | `public/data/`, `shared/contracts/snapshot.ts` |
| ETL | extração somente leitura do SOURCE, construção e validação do snapshot | `scripts/import-electoral`, `scripts/validate-data` |
| Contratos | fonte de verdade request/response e formatos de arquivo | `shared/contracts` |

## Fluxos

- **Exploração**: SPA carrega `manifest.json` → índice de territórios (busca client-side) → camada do mapa (`layers/…`) → ao selecionar, `metrics/mg-<ibge7>.json` (município + bairros). Sem API.
- **Cadastro**: Turnstile → `signInAnonymously()` → `POST /api/v1/registrations` (Siteverify, perfil, vínculo de e-mail) → `/obrigado` com `GET /api/v1/groups?territory_id=` (aprovado / fallback municipal / nenhum).
- **Proposta de grupo**: `POST /api/v1/groups/proposals` → `app_private.group_proposals` (pending) → admin aprova por função transacional → `public.whatsapp_groups` ativo.
- **Atividade**: e-mail verificado → `POST /api/v1/activities` (pending_review) → admin aprova → `activities_public` → mapa/agenda. "Eu vou" via cookie HMAC ou sessão; idempotente.

## Invariantes verificáveis

1. Nenhum identificador do SOURCE em `src/`, `worker/`, `public/`, `dist/`, configs (`npm run check:isolation`).
2. Migrations só no TARGET (`npm run db:push` confere o ref).
3. Projeções públicas definidas em `shared/contracts` e testadas (T14).
4. Snapshot só com `status: validated` após `data:validate` sem erros.
