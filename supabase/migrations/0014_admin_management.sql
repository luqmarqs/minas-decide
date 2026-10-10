-- 0014_admin_management.sql — TARGET ONLY. Admin management from the panel (owner request).
--
-- What:
--   * app_private.admins already has created_at/created_by (0003, retyped to text by 0012);
--     the `add column if not exists` below only guards environments that drifted.
--   * public.svc_list_admins()                  -> jsonb array of {user_id, created_at, created_by}
--   * public.svc_add_admin(p_user, p_actor)     -> boolean (true = row inserted, false = already admin)
--   * public.svc_remove_admin(p_user, p_actor)  -> boolean (true = removed, false = was not admin);
--                                                  raises PT409 when it would leave the table empty
--   * Same privilege pattern as the other svc_*: SET search_path = '', REVOKE from
--     public/anon/authenticated, GRANT to service_role. The Worker (requireFreshAdmin) is the
--     only caller and records the audit row (admin.grant / admin.revoke).
--   * Idempotent (`if not exists`, `create or replace`).
--
-- ROLLBACK (manual):
--   drop function if exists public.svc_list_admins();
--   drop function if exists public.svc_add_admin(text, text);
--   drop function if exists public.svc_remove_admin(text, text);
--   alter table app_private.admins drop constraint if exists created_by_clerk_id_check;
--   alter table app_private.admins add constraint created_by_clerk_id_check
--     check (created_by is null or created_by ~ '^user_[A-Za-z0-9]{1,64}$');
--   (the columns are part of 0003 and are left in place; rows with created_by='bootstrap' must be
--    set to null first)

alter table app_private.admins add column if not exists created_at timestamptz not null default now();
alter table app_private.admins add column if not exists created_by text;

-- created_by may also be the literal 'bootstrap' (rows created by scripts/db/bootstrap-admin.ts).
alter table app_private.admins drop constraint if exists created_by_clerk_id_check;
alter table app_private.admins add constraint created_by_clerk_id_check
  check (created_by is null or created_by = 'bootstrap' or created_by ~ '^user_[A-Za-z0-9]{1,64}$');

create or replace function public.svc_list_admins()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'user_id', a.user_id,
      'created_at', a.created_at,
      'created_by', a.created_by
    ) order by a.created_at, a.user_id),
    '[]'::jsonb)
  from app_private.admins a;
$$;

create or replace function public.svc_add_admin(p_user text, p_actor text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_rows integer;
begin
  if p_user is null or p_user !~ '^user_[A-Za-z0-9]{1,64}$' then
    raise exception 'invalid user id' using errcode = 'PT400';
  end if;
  insert into app_private.admins (user_id, created_by) values (p_user, p_actor)
  on conflict (user_id) do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

create or replace function public.svc_remove_admin(p_user text, p_actor text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_rows integer;
begin
  -- serialise concurrent removals so two admins cannot remove each other at the same time
  lock table app_private.admins in share row exclusive mode;
  if not exists (select 1 from app_private.admins where user_id = p_user) then
    return false;
  end if;
  if (select count(*) from app_private.admins) <= 1 then
    raise exception 'cannot remove the last admin' using errcode = 'PT409';
  end if;
  delete from app_private.admins where user_id = p_user;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke execute on function public.svc_list_admins() from public, anon, authenticated;
revoke execute on function public.svc_add_admin(text, text) from public, anon, authenticated;
revoke execute on function public.svc_remove_admin(text, text) from public, anon, authenticated;
grant execute on function public.svc_list_admins() to service_role;
grant execute on function public.svc_add_admin(text, text) to service_role;
grant execute on function public.svc_remove_admin(text, text) to service_role;
