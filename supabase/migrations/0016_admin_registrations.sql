-- 0016_admin_registrations.sql — TARGET ONLY. Registrations list/export for /admin (owner request).
--
-- What:
--   * public.svc_list_profiles(p_after_created_at, p_after_user_id, p_limit, p_q) -> jsonb array of
--     {user_id, display_name, email, phone, territory_id, territory_name, contact_opt_in,
--      consent_version, email_verification_state, account_state, created_at}.
--     KEYSET pagination ordered by (created_at desc, user_id desc): pass the last row's values as
--     p_after_*; never offset/range. p_limit is clamped to 1..1000.
--     p_q (optional, trimmed, empty = no filter): case-insensitive substring (ILIKE, wildcards
--     escaped) over display_name, email_contact and the territory name. Nothing outside the
--     columns above is ever returned.
--   * public.svc_count_profiles(p_q) -> integer, same filter.
--   * PERSONAL DATA in bulk: only the Worker (requireFreshAdmin + audit `admin.registrations.*`)
--     calls these. SET search_path = '', REVOKE from public/anon/authenticated, GRANT service_role.
--   * Read-only; idempotent (`create or replace`).
--
-- ROLLBACK (manual):
--   drop function if exists public.svc_list_profiles(timestamptz, text, integer, text);
--   drop function if exists public.svc_count_profiles(text);

create or replace function public.svc_list_profiles(
  p_after_created_at timestamptz default null,
  p_after_user_id text default null,
  p_limit integer default 50,
  p_q text default null
)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_pat text := null;
  v_result jsonb;
begin
  if nullif(btrim(p_q), '') is not null then
    v_pat := '%' || replace(replace(replace(btrim(p_q), '\', '\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select coalesce(jsonb_agg(s.item order by s.created_at desc, s.user_id desc), '[]'::jsonb)
    into v_result
  from (
    select p.created_at, p.user_id, jsonb_build_object(
      'user_id', p.user_id,
      'display_name', p.display_name,
      'email', p.email_contact,
      'phone', p.phone_e164,
      'territory_id', p.selected_territory_id,
      'territory_name', t.name,
      'contact_opt_in', p.contact_opt_in_at is not null,
      'consent_version', p.consent_version,
      'email_verification_state', p.email_verification_state,
      'account_state', p.account_state,
      'created_at', p.created_at
    ) as item
    from app_private.profiles p
    left join public.territories t on t.id = p.selected_territory_id
    where (v_pat is null
           or p.display_name ilike v_pat
           or p.email_contact ilike v_pat
           or t.name ilike v_pat)
      and (p_after_created_at is null
           or (p.created_at, p.user_id) < (p_after_created_at, coalesce(p_after_user_id, '')))
    order by p.created_at desc, p.user_id desc
    limit v_limit
  ) s;
  return v_result;
end;
$$;

create or replace function public.svc_count_profiles(p_q text default null)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pat text := null;
  v_n integer;
begin
  if nullif(btrim(p_q), '') is not null then
    v_pat := '%' || replace(replace(replace(btrim(p_q), '\', '\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select count(*)::integer into v_n
  from app_private.profiles p
  left join public.territories t on t.id = p.selected_territory_id
  where v_pat is null
     or p.display_name ilike v_pat
     or p.email_contact ilike v_pat
     or t.name ilike v_pat;
  return v_n;
end;
$$;

revoke execute on function public.svc_list_profiles(timestamptz, text, integer, text)
  from public, anon, authenticated;
revoke execute on function public.svc_count_profiles(text) from public, anon, authenticated;
grant execute on function public.svc_list_profiles(timestamptz, text, integer, text) to service_role;
grant execute on function public.svc_count_profiles(text) to service_role;
