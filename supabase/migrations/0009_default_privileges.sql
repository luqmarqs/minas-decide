-- 0009: default privileges hardening (QA-1 finding F15).
-- Supabase's default ACLs grant ALL on new objects in `public` to anon/authenticated.
-- Future tables/functions/sequences created by `postgres` in `public` must be born
-- without client grants; explicit GRANTs stay opt-in per object.
-- Rollback: `alter default privileges for role postgres in schema public grant ...`
-- (not recommended) — or simply keep explicit grants per object.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on routines from anon, authenticated;

-- Belt and braces: re-run the svc_* lockdown in case any function was created
-- after 0007 (idempotent).
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'svc\_%'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;
