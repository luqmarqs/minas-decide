-- 0018_unified_registration.sql — TARGET ONLY. One registration + organizer login linked by e-mail
-- (D49) and admin-created activities published at once (D50).
--
-- ADDITIVE and safe while the Worker of b66ac92 is still deployed (D40): no table, column or
-- function it calls is dropped or changes signature; JSON outputs keep every key it parses
-- (`source`, `email_verification_state`, `profiles.by_source`, …) and only gain new ones.
--
-- What:
--   * volunteer_signups.phone_e164 becomes NULLable (organizer profiles backfilled without a
--     phone) and gains `user_id text UNIQUE` (Clerk id, CHECK format) = "organizer" link.
--   * Backfill (idempotent): every profile without a registration becomes a registration row
--     (with user_id); registrations whose e-mail matches a profile get its user_id.
--   * public.svc_link_organizer(p_user, p_email): called by the Worker ONLY with the VERIFIED
--     primary e-mail of a Clerk session. Locks the registration (FOR UPDATE), links user_id and
--     creates the organizer profile from the registration data (ON CONFLICT DO NOTHING) in one
--     transaction; audited `organizer.link` without PII. No registration -> {organizer:false}.
--   * svc_list_registrations / svc_count_registrations / svc_admin_metrics read ONLY
--     volunteer_signups (one row per person) with the `organizer` flag; organizer rows show
--     the profile's current name/phone/territory/state.
--   * svc_erase_user_data also unlinks the registration (user_id -> null; the registration
--     itself is consent-based and is erased separately with svc_erase_volunteer_signup).
--   * D50: app_private.admin_activity_requests (idempotency) + public.svc_admin_create_activity:
--     admin check, advisory lock on the idempotency hash, INSERT published activity with
--     creator_user_id = reviewed_by = admin, audit `admin.activity.create`, one transaction.
--   * SECURITY DEFINER + SET search_path = '' + REVOKE from public/anon/authenticated + GRANT
--     service_role on every new/replaced function.
--
-- LATER CLEANUP (after the new Worker is deployed): drop svc_list_profiles, svc_count_profiles,
-- svc_create_profile and the compatibility keys (`source`, `email_verification_state`,
-- `by_source`) of the admin functions.
--
-- ROLLBACK (manual; restore 0017's bodies of the replaced functions and 0012's
-- svc_erase_user_data afterwards):
--   drop function if exists public.svc_admin_create_activity(text, text, jsonb, text);
--   drop table if exists app_private.admin_activity_requests;
--   drop function if exists public.svc_link_organizer(text, text);
--   alter table app_private.volunteer_signups drop column if exists user_id;
--   (phone_e164 NOT NULL can only come back after deleting/filling rows without phone)

-- ---------------------------------------------------------------- schema
alter table app_private.volunteer_signups alter column phone_e164 drop not null;
alter table app_private.volunteer_signups add column if not exists user_id text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'volunteer_signups_user_id_key') then
    alter table app_private.volunteer_signups
      add constraint volunteer_signups_user_id_key unique (user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'volunteer_signups_user_id_clerk_id_check') then
    alter table app_private.volunteer_signups
      add constraint volunteer_signups_user_id_clerk_id_check
      check (user_id is null or user_id ~ '^user_[A-Za-z0-9]{1,64}$');
  end if;
end;
$$;

-- ---------------------------------------------------------------- backfill (idempotent)
update app_private.volunteer_signups v
   set user_id = p.user_id
  from app_private.profiles p
 where v.user_id is null
   and lower(v.email) = lower(p.email_contact)
   and not exists (select 1 from app_private.volunteer_signups x where x.user_id = p.user_id);

insert into app_private.volunteer_signups
  (display_name, email, phone_e164, territory_id, consent_version, contact_opt_in_at, created_at, user_id)
select p.display_name, lower(p.email_contact), p.phone_e164, p.selected_territory_id,
       p.consent_version, p.contact_opt_in_at, p.created_at, p.user_id
  from app_private.profiles p
 where not exists (select 1 from app_private.volunteer_signups v where v.user_id = p.user_id)
   and char_length(p.email_contact) >= 3
on conflict do nothing;

-- ---------------------------------------------------------------- link organizer (D49)
create or replace function public.svc_link_organizer(p_user text, p_email text)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_sig app_private.volunteer_signups%rowtype;
  v_prof app_private.profiles%rowtype;
  v_created boolean := false;
begin
  if p_user is null or p_user !~ '^user_[A-Za-z0-9]{1,64}$' or char_length(v_email) < 3 then
    raise exception 'invalid arguments' using errcode = 'PT400';
  end if;

  select * into v_sig from app_private.volunteer_signups
   where lower(email) = v_email
   for update;
  select * into v_prof from app_private.profiles where user_id = p_user for update;

  if v_sig.id is null then
    if v_prof.user_id is not null then
      -- organizer profile created before the unified registration: give it a registration row
      insert into app_private.volunteer_signups
        (display_name, email, phone_e164, territory_id, consent_version, contact_opt_in_at,
         created_at, user_id)
      values (v_prof.display_name, v_email, v_prof.phone_e164, v_prof.selected_territory_id,
              v_prof.consent_version, v_prof.contact_opt_in_at, v_prof.created_at, p_user)
      on conflict do nothing;
      return jsonb_build_object('organizer', true, 'linked', true, 'profile_created', false);
    end if;
    return jsonb_build_object('organizer', false, 'linked', false, 'profile_created', false);
  end if;

  if v_sig.user_id is not null and v_sig.user_id <> p_user
     and exists (select 1 from app_private.profiles where user_id = v_sig.user_id) then
    -- the registration already belongs to another live organizer account
    return jsonb_build_object('organizer', v_prof.user_id is not null, 'linked', false,
                              'profile_created', false, 'conflict', true);
  end if;

  if v_sig.user_id is distinct from p_user then
    update app_private.volunteer_signups set user_id = null
     where user_id = p_user and id <> v_sig.id;
    update app_private.volunteer_signups set user_id = p_user where id = v_sig.id;
  end if;

  if v_prof.user_id is null then
    insert into app_private.profiles
      (user_id, display_name, email_contact, phone_e164, selected_territory_id, consent_version,
       contact_opt_in_at, email_verification_state)
    values
      (p_user, v_sig.display_name, v_email, v_sig.phone_e164, v_sig.territory_id,
       v_sig.consent_version, v_sig.contact_opt_in_at, 'verified')
    on conflict (user_id) do nothing;
    v_created := found;
    if v_created then
      insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id)
      values (p_user, 'organizer.link', 'profile', p_user, null);
    end if;
  end if;

  return jsonb_build_object('organizer', true, 'linked', true, 'profile_created', v_created);
end;
$$;

-- ---------------------------------------------------------------- admin list / count / metrics
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
      'organizer', u.user_id is not null,
      -- compatibility keys for the Worker of b66ac92
      'source', case when u.user_id is not null then 'account' else 'volunteer' end,
      'email_verification_state', u.email_verification_state,
      'user_id', u.user_id,
      'display_name', u.display_name,
      'email', u.email,
      'phone', u.phone,
      'territory_id', u.territory_id,
      'territory_name', t.name,
      'contact_opt_in', u.contact_opt_in_at is not null,
      'consent_version', u.consent_version,
      'account_state', u.account_state,
      'created_at', u.created_at
    ) as item
    from (
      select v.id::text as id, v.user_id,
             coalesce(p.display_name, v.display_name) as display_name,
             v.email,
             coalesce(p.phone_e164, v.phone_e164) as phone,
             coalesce(p.selected_territory_id, v.territory_id) as territory_id,
             coalesce(p.contact_opt_in_at, v.contact_opt_in_at) as contact_opt_in_at,
             v.consent_version,
             case when v.user_id is not null then coalesce(p.email_verification_state, 'verified')
                  else 'unverified' end as email_verification_state,
             p.account_state,
             v.created_at
      from app_private.volunteer_signups v
      left join app_private.profiles p on p.user_id = v.user_id
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
  from app_private.volunteer_signups v
  left join app_private.profiles p on p.user_id = v.user_id
  left join public.territories t on t.id = coalesce(p.selected_territory_id, v.territory_id)
  where v_pat is null
     or coalesce(p.display_name, v.display_name) ilike v_pat
     or v.email ilike v_pat
     or t.name ilike v_pat;
  return v_n;
end;
$$;

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
    select v.user_id is not null as organizer,
           coalesce(p.selected_territory_id, v.territory_id) as territory_id, v.created_at
      from app_private.volunteer_signups v
      left join app_private.profiles p on p.user_id = v.user_id
  )
  select jsonb_build_object(
    'profiles', jsonb_build_object(
      'total', (select count(*) from regs),
      'last_7d', (select count(*) from regs where created_at >= now() - interval '7 days'),
      'last_30d', (select count(*) from regs where created_at >= now() - interval '30 days'),
      'organizers', (select count(*) from regs where organizer),
      -- compatibility key for the Worker of b66ac92
      'by_source', jsonb_build_object(
        'volunteer', (select count(*) from regs where not organizer),
        'account', (select count(*) from regs where organizer)
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

-- ---------------------------------------------------------------- erase (0012 body + unlink)
create or replace function public.svc_erase_user_data(p_user text, p_request_id text default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_rsvps integer;
  v_activities integer;
  v_profiles integer;
  v_admins integer;
begin
  if p_user is null or p_user !~ '^user_[A-Za-z0-9]{1,64}$' then
    raise exception 'invalid user id' using errcode = 'PT400';
  end if;
  delete from app_private.activity_rsvps where user_id = p_user;
  get diagnostics v_rsvps = row_count;
  delete from public.activities where creator_user_id = p_user;
  get diagnostics v_activities = row_count;
  delete from app_private.profiles where user_id = p_user;
  get diagnostics v_profiles = row_count;
  delete from app_private.admins where user_id = p_user;
  get diagnostics v_admins = row_count;
  update app_private.group_proposals set proposer_user_id = null where proposer_user_id = p_user;
  -- D49: the registration stays (own consent); only the organizer link goes
  update app_private.volunteer_signups set user_id = null where user_id = p_user;
  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id)
  values (null, 'user.erase', 'user', p_user, p_request_id);
  return jsonb_build_object('rsvps', v_rsvps, 'activities', v_activities,
                            'profiles', v_profiles, 'admins', v_admins);
end;
$$;

-- ---------------------------------------------------------------- D50: admin-created activity
create table if not exists app_private.admin_activity_requests (
  idempotency_hash text primary key check (char_length(idempotency_hash) between 16 and 128),
  activity_id uuid not null references public.activities (id) on delete cascade,
  admin_user_id text not null check (admin_user_id ~ '^user_[A-Za-z0-9]{1,64}$'),
  created_at timestamptz not null default now()
);
alter table app_private.admin_activity_requests enable row level security;
revoke all on table app_private.admin_activity_requests from public, anon, authenticated;
grant all on table app_private.admin_activity_requests to service_role;

create or replace function public.svc_admin_create_activity(
  p_admin text,
  p_idempotency_hash text,
  p_activity jsonb,
  p_request_id text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_row public.activities%rowtype;
begin
  if p_admin is null or not app_private.is_admin(p_admin) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  if p_idempotency_hash is null or char_length(p_idempotency_hash) not between 16 and 128 then
    raise exception 'invalid idempotency key' using errcode = 'PT400';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('admin_activity:' || p_idempotency_hash, 0));

  select a.* into v_row
    from app_private.admin_activity_requests r
    join public.activities a on a.id = r.activity_id
   where r.idempotency_hash = p_idempotency_hash;
  if found then
    return jsonb_build_object('created', false, 'activity', to_jsonb(v_row));
  end if;

  insert into public.activities
    (creator_user_id, territory_id, title, type, description, description_sanitized,
     starts_at, ends_at, timezone, public_address, location_lon, location_lat, status,
     public_contact_opt_in, public_contact_type, public_contact_value, reviewed_by, reviewed_at)
  values
    (p_admin,
     p_activity->>'territory_id',
     p_activity->>'title',
     p_activity->>'type',
     p_activity->>'description',
     p_activity->>'description_sanitized',
     (p_activity->>'starts_at')::timestamptz,
     nullif(p_activity->>'ends_at', '')::timestamptz,
     'America/Sao_Paulo',
     p_activity->>'public_address',
     (p_activity->>'location_lon')::double precision,
     (p_activity->>'location_lat')::double precision,
     'published',
     coalesce((p_activity->>'public_contact_opt_in')::boolean, false),
     p_activity->>'public_contact_type',
     p_activity->>'public_contact_value',
     p_admin,
     now())
  returning * into v_row;

  insert into app_private.admin_activity_requests (idempotency_hash, activity_id, admin_user_id)
  values (p_idempotency_hash, v_row.id, p_admin);

  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id)
  values (p_admin, 'admin.activity.create', 'activity', v_row.id::text, p_request_id);

  return jsonb_build_object('created', true, 'activity', to_jsonb(v_row));
end;
$$;

-- ---------------------------------------------------------------- privileges
revoke execute on function public.svc_link_organizer(text, text) from public, anon, authenticated;
revoke execute on function public.svc_list_registrations(timestamptz, text, integer, text)
  from public, anon, authenticated;
revoke execute on function public.svc_count_registrations(text) from public, anon, authenticated;
revoke execute on function public.svc_admin_metrics(integer) from public, anon, authenticated;
revoke execute on function public.svc_erase_user_data(text, text) from public, anon, authenticated;
revoke execute on function public.svc_admin_create_activity(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.svc_link_organizer(text, text) to service_role;
grant execute on function public.svc_list_registrations(timestamptz, text, integer, text)
  to service_role;
grant execute on function public.svc_count_registrations(text) to service_role;
grant execute on function public.svc_admin_metrics(integer) to service_role;
grant execute on function public.svc_erase_user_data(text, text) to service_role;
grant execute on function public.svc_admin_create_activity(text, text, jsonb, text) to service_role;
