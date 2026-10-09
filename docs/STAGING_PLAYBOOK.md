# STAGING_PLAYBOOK — o que só o proprietário pode executar

> **Status em 2026-10-09:** a seção 1 foi **executada** com um API Token fornecido pelo proprietário (o OAuth do `wrangler login` falhou 3× com `request_forbidden`/CSRF no navegador). Staging publicado em **https://minas-em-movimento-staging.luq-marqs.workers.dev** (Worker `minas-em-movimento-staging`, env `staging`), widget Turnstile Managed `minas-em-movimento-staging` criado pela API, 6 secrets configurados, redirect de retorno adicionado no Auth do TARGET. Credenciais em `~/.minas-em-movimento/{cloudflare.env,turnstile-staging.env}` e `.env.staging` (gitignored). **Recomendado: rotacionar o API Token** (ele transitou pelo chat). Seções 2–5 continuam pendentes.

## 1. Cloudflare (uma vez)

1. `npx wrangler login` (abre o navegador) e `npx wrangler whoami`.
2. Turnstile: painel Cloudflare → Turnstile → criar widget **Managed**, hostnames `localhost`, `127.0.0.1` e o host de staging (`minas-em-movimento-staging.<conta>.workers.dev` ou subdomínio). Anote **sitekey** (pública) e **secret**.
3. Edite `wrangler.jsonc` → `env.staging.vars`: `PUBLIC_ORIGIN` (URL final de staging), `TURNSTILE_EXPECTED_HOSTNAMES` (host de staging). Não coloque segredos aí.
4. Segredos de staging (TARGET dev pode ser reaproveitado como banco de staging nesta fase, ou crie um projeto `minas-em-movimento-staging`):
   ```bash
   npx wrangler secret put SUPABASE_TARGET_URL --env staging
   npx wrangler secret put SUPABASE_TARGET_ANON_KEY --env staging
   npx wrangler secret put SUPABASE_TARGET_SERVICE_ROLE_KEY --env staging
   npx wrangler secret put TURNSTILE_SECRET_KEY --env staging
   npx wrangler secret put RSVP_DEVICE_SECRET --env staging     # 32+ bytes aleatórios
   npx wrangler secret put ADMIN_EMAILS --env staging
   ```
5. Frontend: crie `.env.staging` (gitignored) com `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TURNSTILE_SITE_KEY` (sitekey real) e rode `npx vite build --mode staging`.
6. Deploy: `npx wrangler deploy --env staging`. Verifique `https://<url>/api/v1/health` e abra a home.
7. Supabase Auth do projeto usado em staging: `site_url` e `additional_redirect_urls` com `https://<url>/autenticacao/retorno` (`supabase/config.toml` + `supabase config push`, ou painel).

## 1b. Clerk (autenticação, ADR 0005) — executado em 2026-10-09

- App `minas-decide` (`app_3KTDdv0NZbv3wTVloogIbNwLqt9`), instância **dev** (`pk_test_`/`sk_test_`): chaves em `.env.local`/`.dev.vars`/`.env.staging` e como secrets `CLERK_SECRET_KEY`/`CLERK_PUBLISHABLE_KEY` do Worker de staging. Configuração aplicada pela CLI: senha desabilitada, login e verificação por código de e-mail, nome opcional, anti-bot do Clerk ligado.
- Para produção: criar/ativar a instância **live** no painel do Clerk (domínio próprio + DNS que o Clerk pede), repetir a configuração (`clerk config pull --instance prod` / `patch --instance prod`), gerar `pk_live_`/`sk_live_` (`clerk env pull --instance prod`), colocar `VITE_CLERK_PUBLISHABLE_KEY` no build de produção e `CLERK_SECRET_KEY` como secret, e incluir o host da instância live na CSP (`public/_headers`).
- Admin: `APP_ENV=local npx tsx scripts/db/bootstrap-admin.ts --only=<e-mail>` cria o usuário no Clerk (se não existir) e o marca admin; login por código em `/entrar`.

## 2. E-mail transacional

> Com o Clerk, os e-mails de código/verificação são enviados pelo próprio Clerk; o SMTP do Supabase deixa de ser necessário para autenticação. Esta seção fica para e-mails transacionais futuros (avisos de aprovação).


- Configure SMTP próprio no projeto Supabase (Auth → SMTP): remetente em domínio seu com SPF/DKIM/DMARC. Sem isso a cota padrão (poucos e-mails/hora) esgota e ninguém confirma e-mail (achado F04).
- Depois, teste de ponta a ponta: cadastro → e-mail real → clique → `/autenticacao/retorno` → "Confira seus dados" → criar atividade.

## 3. SOURCE com usuário somente leitura (P-DATA-2)

No projeto legado, com o SQL Editor do painel (ação sua, não do agente):

```sql
create role electoral_reader login password '<senha-forte>';
grant usage on schema public to electoral_reader;
grant select on public.municipios, public.locais, public.totais_local,
                public.candidaturas, public.votos_cand, public.historico_votos
  to electoral_reader;
alter role electoral_reader set statement_timeout = '60s';
```

Na máquina do operador, só no shell: `export ELECTORAL_SOURCE_DATABASE_URL='postgresql://electoral_reader:<senha>@<host-do-pooler>:5432/postgres'` e `npm run etl:export -- --dry-run`. Nunca em arquivo do repositório.

## 4. Decisões pendentes (relatório §16)

Enumeração de e-mail (manter 409 — recomendado), conteúdo do snapshot (top 10 — recomendado), Git vs R2 para `public/data`, revisão jurídica (`docs/PRIVACY_LGPD_DRAFT.md`).

## 5. Repositório

`git remote add origin <url>` e `git push -u origin main` para o CI (`.github/workflows/ci.yml`) rodar; segredos `SUPABASE_TARGET_*` nos secrets do GitHub habilitam `test:db`.
