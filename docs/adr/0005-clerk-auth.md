# ADR 0005 — Autenticação com Clerk (substitui Supabase Auth)

**Status:** aceito — 2026-10-09 (decisão do proprietário: "vamos trocar o auth"; app Clerk `minas-decide`, id `app_3KTDdv0NZbv3wTVloogIbNwLqt9`)

## Contexto
O fluxo Supabase Auth (sessão anônima → vínculo de e-mail → magic link → promoção → revisão de perfil) era frágil: cota de SMTP do Supabase esgotava com poucos cadastros; a promoção abria janela de pré-sequestro (QA2-01); MFA foi dispensado (D35). Clerk entrega e-mail de verificação por código no cadastro, login por código/link, componentes prontos e sessão com JWT verificável na borda.

## Decisão
1. **Identidade = Clerk.** `user_id` passa a ser o id do Clerk (`user_…`, texto). Supabase fica **só banco** (Postgres via service role no Worker). Supabase Auth é desligado para clientes (`enable_anonymous_sign_ins=false`; anon key deixa de ser usada no frontend; grants a `anon`/`authenticated` revogados — RLS vira defesa em profundidade sem acesso direto do navegador).
2. **Cadastro** (`/participar` e seção `#participar` da home): o nosso formulário continua (nome, e-mail, WhatsApp, território, consentimentos, Turnstile). Fluxo Clerk custom (`useSignUp`): `signUp.create({ emailAddress, firstName })` → `prepareEmailAddressVerification({ strategy: 'email_code' })` → usuário digita o código → `attemptEmailAddressVerification` → `setActive` → `POST /api/v1/registrations` com `Authorization: Bearer <session token>` (Turnstile validado no servidor; perfil criado já **verificado**). Se o e-mail já tem conta → Clerk sinaliza; a UI oferece "entrar" (`useSignIn` com `email_code`).
3. **Login**: componente `<SignIn />` do Clerk em `/entrar` (e modal), estratégia e-mail + código (sem senha; magic link opcional). `UserButton` no menu de sessão. Rotas removidas: `/autenticacao/retorno`, `/conta/seguranca`, `POST /auth/send-link`, `POST /auth/confirm-email`. Revisão de perfil (P-SEC-1) deixa de existir: o e-mail é verificado antes de qualquer sessão.
4. **Worker**: `@clerk/backend` `verifyToken(token, { secretKey })` (JWKS cacheado) → `AuthUser { id, email, email_verified }` (claims `email`/`email_verified` via template de sessão do Clerk, ou busca `users.getUser` com cache por request). Organizador = e-mail verificado + perfil ativo. Admin = `app_private.admins` por id do Clerk; `scripts/db/bootstrap-admin.ts` resolve o id pelo e-mail via Backend API. RSVP anônimo (cookie HMAC) inalterado; se houver sessão, usa o id do Clerk.
5. **Banco (migration 0012)**: `profiles.user_id`, `admins.user_id`, `admins.created_by`, `activities.creator_user_id`, `activity_rsvps.user_id`, `audit_events.actor_user_id`, `group_proposals.proposer_user_id` → `text` (sem FK para `auth.users`); funções `is_email_verified` passam a ler `profiles.email_verification_state` (fonte: Clerk no momento do cadastro, e re-checado pelo claim a cada request); `review_required_at` descontinuado (mantido nulo). Dados de dev são apagados antes (só teste + admin do proprietário, recriado).
6. **Segredos**: `VITE_CLERK_PUBLISHABLE_KEY` (público) em `.env`/`.env.staging`; `CLERK_SECRET_KEY` só no Worker (`.dev.vars`, `wrangler secret`). Instância dev do Clerk em local e staging; produção exige instância `live` e domínio.
7. **Turnstile** continua no cadastro e na proposta de grupo (o Clerk tem bot protection própria, mas o servidor segue validando).

## Consequências
- Remove `supabase-js` do frontend (≈ 57 KB gz) e adiciona `@clerk/clerk-react`.
- Testes de RLS por papel (`anon`/`authenticated`) deixam de fazer sentido; viram testes de "nenhum acesso direto" + testes de rota com token do Clerk falso (JWKS mock) e ao vivo com token real da instância dev.
- `docs/SECURITY.md`, `API_CONTRACTS.md`, `DATA_DICTIONARY.md`, `CLAUDE.md`, regras `.claude/rules/{security,database}.md` precisam refletir a troca.
- Dependência de serviço externo (Clerk, plano gratuito até 10 mil MAU); LGPD: Clerk é novo operador (EUA) — registrar em `PRIVACY_LGPD_DRAFT.md`.
