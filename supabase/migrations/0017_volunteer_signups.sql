-- 0017_volunteer_signups.sql — TARGET ONLY. Volunteer sign-up WITHOUT an account (D48).
--
-- Owner decision 2026-10-14 (D48): "A pessoa não precisa ter conta para se cadastrar". The
-- volunteer form (home #participar, /participar) no longer creates a Clerk account; it posts to
-- the public POST /registrations, which stores the row here. Clerk accounts + app_private.profiles
-- remain for organizers/admin (ADR 0005).
--
-- What (ADDITIVE — the same project also serves production, D40; nothing existing is changed or
-- dropped, so a Worker deployed before this migration keeps working):
--   * app_private.volunteer_signups: id uuid, display_name, email (stored lower-case), phone_e164,
--     territory_id -> public.territories, consent_version, contact_opt_in_at, created_at.
--     UNIQUE on lower(email). RLS on, no policies, REVOKE ALL from public/anon/authenticated.
--   * public.svc_create_volunteer_signup(...) -> jsonb {created}: INSERT ... ON CONFLICT
--     (lower(email)) DO NOTHING — a repeated e-mail never overwrites the existing row.
--   * public.svc_erase_volunteer_signup(p_email, p_request_id) -> integer (LGPD erasure on
--     request; audited WITHOUT the e-mail).
--   * public.svc_list_registrations / public.svc_count_registrations: admin list/export of
--     volunteers (source 'volunteer') UNION ALL account profiles (source 'account'). KEYSET
--     pagination by (created_at desc, id desc) where id = volunteer uuid::text or the Clerk
--     user id; ids compared with COLLATE "C" (deterministic total order). New names: the old
--     svc_list_profiles / svc_count_profiles (0016) stay untouched for the Worker version that
--     is still deployed.
--   * public.svc_admin_metrics (0015) replaced: `profiles.*` now counts BOTH sources and gains
--     `profiles.by_source {volunteer, account}`; top_territories counts both. Extra keys are
--     ignored by the older Worker (Zod strips unknown keys).
--   * Every function: SECURITY DEFINER, SET search_path = '', REVOKE EXECUTE from
--     public/anon/authenticated, GRANT to service_role. Idempotent (IF NOT EXISTS / OR REPLACE).
--
-- ROLLBACK (manual; restore 0015's svc_admin_metrics body afterwards):
--   drop function if exists public.svc_list_registrations(timestamptz, text, integer, text);
--   drop function if exists public.svc_count_registrations(text);
--   drop function if exists public.svc_create_volunteer_signup(text, text, text, text, text, boolean);
--   drop function if exists public.svc_erase_volunteer_signup(text, text);
--   drop table if exists app_private.volunteer_signups;

create table if not exists app_private.volunteer_signups (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 120),
  -- Contact only (never verified, never an identity).
  email text not null check (char_length(email) between 3 and 254 and email = lower(email)),
  phone_e164 text not null check (phone_e164 ~ '^\+55[1-9]{2}9[0-9]{8}$'),
  territory_id text references public.territories (id) on delete set null,
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  contact_opt_in_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists volunteer_signups_email_key
  on app_private.volunteer_signups (lower(email));
create index if not exists volunteer_signups_created_idx
  on app_private.volunteer_signups (created_at desc, id);
create index if not exists volunteer_signups_territory_idx
  on app_private.volunteer_signups (territory_id);

alter table app_private.volunteer_signups enable row level security;
revoke all on table app_private.volunteer_signups from public, anon, authenticated;
grant all on table app_private.volunteer_signups to service_role;

-- ---------------------------------------------------------------- create (public route)
create or replace function public.svc_create_volunteer_signup(
  p_display_name text,
  p_email text,
  p_phone text,
  p_territory_id text,
  p_consent_version text,
  p_contact_opt_in boolean
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app_private.volunteer_signups
    (display_name, email, phone_e164, territory_id, consent_version, contact_opt_in_at)
  values
    (p_display_name, lower(btrim(p_email)), p_phone, p_territory_id, p_consent_version,
     case when p_contact_opt_in then now() end)
  on conflict ((lower(email))) do nothing
  returning id into v_id;
  -- Never returns the id nor any stored value: the caller only learns "accepted".
  return jsonb_build_object('created', v_id is not null);
end;
$$;

-- ---------------------------------------------------------------- erase (LGPD request)
create or replace function public.svc_erase_volunteer_signup(p_email text, p_request_id text default null)
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_n integer;
begin
  delete from app_private.volunteer_signups where lower(email) = lower(btrim(p_email));
  get diagnostics v_n = row_count;
  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (null, 'volunteer.erase', 'volunteer_signup', null, p_request_id, 'rows=' || v_n);
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- admin list / count
create or replace function public.svc_list_registrations(
  p_after_created_at timestamptz default null,
  p_after_id text default null,
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
    v_pat := '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select coalesce(jsonb_agg(s.item order by s.created_at desc, s.id collate "C" desc), '[]'::jsonb)
    into v_result
  from (
    select u.created_at, u.id, jsonb_build_object(
      'id', u.id,
      'source', u.source,
      'user_id', u.user_id,
      'display_name', u.display_name,
      'email', u.email,
      'phone', u.phone,
      'territory_id', u.territory_id,
      'territory_name', t.name,
      'contact_opt_in', u.contact_opt_in_at is not null,
      'consent_version', u.consent_version,
      'email_verification_state', u.email_verification_state,
      'account_state', u.account_state,
      'created_at', u.created_at
    ) as item
    from (
      select v.id::text as id, 'volunteer'::text as source, null::text as user_id,
             v.display_name, v.email, v.phone_e164 as phone, v.territory_id,
             v.contact_opt_in_at, v.consent_version,
             'unverified'::text as email_verification_state, null::text as account_state,
             v.created_at
      from app_private.volunteer_signups v
      union all
      select p.user_id, 'account', p.user_id,
             p.display_name, p.email_contact, p.phone_e164, p.selected_territory_id,
             p.contact_opt_in_at, p.consent_version,
             p.email_verification_state, p.account_state,
             p.created_at
      from app_private.profiles p
    ) u
    left join public.territories t on t.id = u.territory_id
    where (v_pat is null
           or u.display_name ilike v_pat
           or u.email ilike v_pat
           or t.name ilike v_pat)
      and (p_after_created_at is null
           or u.created_at < p_after_created_at
           or (u.created_at = p_after_created_at
               and u.id collate "C" < coalesce(p_after_id, '') collate "C"))
    order by u.created_at desc, u.id collate "C" desc
    limit v_limit
  ) s;
  return v_result;
end;
$$;

create or replace function public.svc_count_registrations(p_q text default null)
returns integer
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_pat text := null;
  v_n integer;
begin
  if nullif(btrim(p_q), '') is not null then
    v_pat := '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;
  select count(*)::integer into v_n
  from (
    select v.display_name, v.email, v.territory_id from app_private.volunteer_signups v
    union all
    select p.display_name, p.email_contact, p.selected_territory_id from app_private.profiles p
  ) u
  left join public.territories t on t.id = u.territory_id
  where v_pat is null
     or u.display_name ilike v_pat
     or u.email ilike v_pat
     or t.name ilike v_pat;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------- metrics (replaces 0015)
create or replace function public.svc_admin_metrics(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_first date := v_today - (v_days - 1);
  v_result jsonb;
begin
  with regs as (
    select 'volunteer'::text as source, v.territory_id, v.created_at
      from app_private.volunteer_signups v
    union all
    select 'account', p.selected_territory_id, p.created_at from app_private.profiles p
  )
  select jsonb_build_object(
    'profiles', jsonb_build_object(
      'total', (select count(*) from regs),
      'last_7d', (select count(*) from regs where created_at >= now() - interval '7 days'),
      'last_30d', (select count(*) from regs where created_at >= now() - interval '30 days'),
      'by_source', jsonb_build_object(
        'volunteer', (select count(*) from regs where source = 'volunteer'),
        'account', (select count(*) from regs where source = 'account')
      ),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0))
                                  order by d.day), '[]'::jsonb)
        from (select v_first + g as day from generate_series(0, v_days - 1) as g) d
        left join (
          select (r.created_at at time zone 'America/Sao_Paulo')::date as day, count(*) as n
          from regs r
          where (r.created_at at time zone 'America/Sao_Paulo')::date >= v_first
          group by 1
        ) c on c.day = d.day
      )
    ),
    'activities', jsonb_build_object(
      'by_status', (
        select coalesce(jsonb_object_agg(s.status, coalesce(c.n, 0)), '{}'::jsonb)
        from unnest(array['draft', 'pending_review', 'published', 'rejected', 'cancelled',
                          'archived', 'suspended']) as s(status)
        left join (select a.status, count(*) as n from public.activities a group by a.status) c
          on c.status = s.status
      ),
      'upcoming_published', (select count(*) from public.activities
                             where status = 'published' and starts_at > now())
    ),
    'rsvps', jsonb_build_object(
      'total', (select count(*) from app_private.activity_rsvps where status = 'going'),
      'last_7d', (select count(*) from app_private.activity_rsvps
                  where status = 'going' and created_at >= now() - interval '7 days')
    ),
    'groups', jsonb_build_object(
      'active', (select count(*) from public.whatsapp_groups where status = 'active'),
      'suspended', (select count(*) from public.whatsapp_groups where status = 'suspended'),
      'pending_proposals', (select count(*) from app_private.group_proposals where status = 'pending')
    ),
    'admins', jsonb_build_object('total', (select count(*) from app_private.admins)),
    'top_territories', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'territory_id', t.territory_id, 'name', t.name, 'registrations', t.n)
             order by t.n desc, t.territory_id), '[]'::jsonb)
      from (
        select tr.id as territory_id, tr.name, count(*) as n
        from regs r
        join public.territories tr on tr.id = r.territory_id
        group by tr.id, tr.name
        order by count(*) desc, tr.id
        limit 10
      ) t
    )
  ) into v_result;
  return v_result;
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke execute on function public.svc_create_volunteer_signup(text, text, text, text, text, boolean)
  from public, anon, authenticated;
revoke execute on function public.svc_erase_volunteer_signup(text, text) from public, anon, authenticated;
revoke execute on function public.svc_list_registrations(timestamptz, text, integer, text)
  from public, anon, authenticated;
revoke execute on function public.svc_count_registrations(text) from public, anon, authenticated;
revoke execute on function public.svc_admin_metrics(integer) from public, anon, authenticated;
grant execute on function public.svc_create_volunteer_signup(text, text, text, text, text, boolean)
  to service_role;
grant execute on function public.svc_erase_volunteer_signup(text, text) to service_role;
grant execute on function public.svc_list_registrations(timestamptz, text, integer, text)
  to service_role;
grant execute on function public.svc_count_registrations(text) to service_role;
grant execute on function public.svc_admin_metrics(integer) to service_role;
