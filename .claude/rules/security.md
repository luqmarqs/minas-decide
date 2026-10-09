# Regras de segurança (todas as tarefas)

- Nunca gravar, exibir ou commitar segredos: chaves Supabase (service role), senhas de banco, tokens Turnstile, refs/URLs do SOURCE. Use placeholders.
- `VITE_*` é público. Só configuração não secreta.
- Nenhum comando contra o SOURCE que não seja `SELECT` dentro de `BEGIN READ ONLY`. Proibido: `db push`, `db reset`, `migration`, `link` ao SOURCE dentro do repo, DDL, `VACUUM`, índices, extensões.
- Antes de `supabase db push`, confirmar que `supabase/.temp/project-ref` começa com `wnclh` (TARGET). Use `npm run db:push`, que faz essa verificação.
- Respostas públicas nunca contêm: nomes/contatos de responsáveis, e-mail/telefone de proponentes, perfis, motivos de moderação, IDs de criador, listas de quem clicou "Eu vou".
- Logs: request_id, rota normalizada, status, duração. Sem PII, sem tokens, sem payloads pessoais.
- Erros ao público: mensagem genérica + código estável. Sem stack, SQL ou versão interna.
- Turnstile: validar no servidor via Siteverify; checar `success`, `hostname`, `action` (se houver) e uso único.
- RSVP anônimo: cookie `Secure; HttpOnly; SameSite=Lax`, HMAC no servidor, unique constraint; nunca listar participantes.
- Admin: verificação server-side contra tabela de admins; MFA (`aal2`) exigido para moderação e visualização de contatos; tudo auditado em `audit_events`.
- Não implementar autenticação/criptografia próprias. Usar Supabase Auth e WebCrypto.
- Sem deploy de produção, sem DNS, sem contratação de serviço.
