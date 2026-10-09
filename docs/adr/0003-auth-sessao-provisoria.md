# ADR 0003 — Cadastro com sessão provisória (anonymous sign-in) e verificação posterior

**Status:** aceito (sujeito ao spike real) — 2026-10-08

## Contexto
Requisitos simultâneos (spec §8.4): e-mail obrigatório no cadastro; sessão ativa imediatamente; verificação de e-mail só para ações de organizador; login futuro por magic link; nunca desabilitar confirmação de e-mail globalmente.

## Decisão
1. Cliente faz `signInAnonymously()` (TARGET, `enable_anonymous_sign_ins = true`) **antes** de enviar o formulário, somente após o Turnstile estar resolvido.
2. `POST /api/v1/registrations` valida Turnstile (Siteverify), valida o JWT anônimo, cria `app_private.profiles` com `email_verification_state='unverified'` e vincula o e-mail à identidade via `auth.admin.updateUserById(uid, { email, email_confirm: false })`, disparando a confirmação pelo Auth. O comportamento exato (se o Auth exige confirmação para concluir o vínculo) é verificado no spike do agente de backend e registrado no relatório.
3. Autorização de organizador exige **duas** provas: JWT com `is_anonymous=false` e `email_confirmed_at` lido do `auth.users` por função `SECURITY DEFINER` (`app_private.is_email_verified`). Nunca o campo `email_contact` editável.
4. Políticas RLS incluem `(auth.jwt()->>'is_anonymous')::boolean = false` onde couber; sessão provisória só lê o próprio perfil.
5. Retorno por magic link (`signInWithOtp`) com `emailRedirectTo` em allowlist (`/autenticacao/retorno`); sem tokens em logs/analytics.
6. Admin: `app_private.admins` + `aal2`; bypass de MFA apenas em `APP_ENV=local`.

## Consequências
- Uma pessoa que perde o dispositivo antes de verificar o e-mail perde a sessão provisória; recupera ao verificar o e-mail (o perfil é reatribuído pela identidade confirmada) — fluxo a detalhar na rodada 2.
- Se um e-mail já pertence a conta verificada, o cadastro responde 409 neutro e orienta login por magic link.
