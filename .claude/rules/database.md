# Regras de banco (TARGET somente)

- Tudo em `supabase/migrations/` aplica-se **apenas** ao projeto operacional novo (TARGET) e a ambientes locais/teste. Nunca ao SOURCE.
- Tabelas privadas em schema `app_private` (não exposto pela Data API). Tabelas/views públicas em `public` apenas com projeções sem PII e com RLS + grants mínimos.
- Default deny: `REVOKE ALL` de `anon`/`authenticated` em tabelas privadas; políticas explícitas `USING`/`WITH CHECK`.
- Políticas de usuário verificado checam `auth.jwt()->>'is_anonymous'` = false **e** e-mail confirmado (via `auth.users.email_confirmed_at` lido por função `SECURITY DEFINER` com `search_path` fixo), nunca só `role='authenticated'`.
- Mutations operacionais (cadastro, proposta, RSVP, moderação) passam pelo Worker com service role, depois de autorização explícita no código. O cliente anon não recebe grants de escrita nessas tabelas.
- Constraints de unicidade para idempotência: RSVP `(activity_id,user_id)` e `(activity_id,anonymous_subject_hash)` parciais; propostas com `idempotency_key_hash` único.
- Aprovação de proposta é uma função transacional (`SECURITY DEFINER`) com `UPDATE ... WHERE status='pending'` para evitar dupla aprovação.
- Funções `SECURITY DEFINER` sempre com `SET search_path = ''` e `REVOKE EXECUTE FROM public, anon, authenticated` quando não forem para o cliente.
- Migrations idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`), sequenciais, com rollback documentado em comentário no topo.
- `seed.sql` só dados sintéticos rotulados.
- Testes de RLS em `supabase/tests/` rodam contra TARGET dev com anon key + JWTs de usuários de teste; limpar os dados criados.
