# Regras de banco (TARGET somente)

- Tudo em `supabase/migrations/` aplica-se **apenas** ao projeto operacional novo (TARGET) e a ambientes locais/teste. Nunca ao SOURCE.
- Tabelas privadas em schema `app_private` (não exposto pela Data API). Tabelas/views públicas em `public` apenas com projeções sem PII e com RLS + grants mínimos.
- Default deny: `REVOKE ALL` de `anon`/`authenticated` em tabelas privadas; políticas explícitas `USING`/`WITH CHECK`.
- Identidade = Clerk (ADR 0005): ids de usuário são `text` no formato `user_…`, sem FK para `auth.users`; `is_email_verified` lê `profiles.email_verification_state`. O navegador **não** acessa o banco (grants de `anon`/`authenticated` revogados); todo acesso passa pelo Worker com service role.
- Todas as operações (leitura e escrita) passam pelo Worker com service role, depois de autorização explícita no código (token do Clerk verificado). RLS permanece como defesa em profundidade.
- Constraints de unicidade para idempotência: RSVP `(activity_id,user_id)` e `(activity_id,anonymous_subject_hash)` parciais; propostas com `idempotency_key_hash` único.
- Aprovação de proposta é uma função transacional (`SECURITY DEFINER`) com `UPDATE ... WHERE status='pending'` para evitar dupla aprovação.
- Funções `SECURITY DEFINER` sempre com `SET search_path = ''` e `REVOKE EXECUTE FROM public, anon, authenticated` quando não forem para o cliente.
- Migrations idempotentes (`IF NOT EXISTS`, `CREATE OR REPLACE`), sequenciais, com rollback documentado em comentário no topo.
- `seed.sql` só dados sintéticos rotulados.
- Testes em `supabase/tests/` rodam contra TARGET dev: `anon` sem acesso direto + testes ao vivo com usuários/tokens de teste do Clerk (`scripts/db/clerk-test-users.ts`); limpar os dados criados.
