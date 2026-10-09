-- 0007_service_api.sql — TARGET ONLY.
--
-- ROLLBACK: drop every function named public.svc_* listed below, then
--   drop function if exists app_private.purge_expired();
--
-- Why these exist: `app_private` is deliberately NOT exposed by the Data API, so the Worker
-- (service_role over PostgREST) cannot reach it directly. Each `public.svc_*` function is a
-- narrow, typed entry point executable ONLY by service_role (EXECUTE revoked from public,
-- anon and authenticated). They run as SECURITY INVOKER with an empty search_path; the
-- service_role holds the grants on app_private given in 0001–0006. Authorization (who may
-- call what) is enforced in the Worker before calling them; moderation functions re-check
-- app_private.is_admin inside the transaction.

create or replace function app_private.purge_expired()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tokens integer;
  v_abuse integer;
  v_fp integer;
begin
  delete from app_private.turnstile_tokens_used where expires_at < now();
  get diagnostics v_tokens = row_count;
  delete from app_private.abuse_events where created_at < now() - interval '90 days';
  get diagnostics v_abuse = row_count;
  update app_private.group_proposals
     set fingerprint_hash = null
   where fingerprint_hash is not null and fingerprint_expires_at < now();
  get diagnostics v_fp = row_count;
  return jsonb_build_object('turnstile_tokens', v_tokens, 'abuse_events', v_abuse, 'fingerprints', v_fp);
end;
$$;
revoke execute on function app_private.purge_expired() from public, anon, authenticated;
grant execute on function app_private.purge_expired() to service_role;

-- ---------------------------------------------------------------- identity / profiles
create or replace function public.svc_is_admin(p_user uuid)
returns boolean language sql stable set search_path = ''
as $$ select app_private.is_admin(p_user); $$;

create or replace function public.svc_is_email_verified(p_user uuid)
returns boolean language sql stable set search_path = ''
as $$ select app_private.is_email_verified(p_user); $$;

create or replace function public.svc_email_in_use(p_email text, p_exclude uuid)
returns boolean language sql stable set search_path = ''
as $$ select app_private.email_in_use(p_email, p_exclude); $$;

create or replace function public.svc_get_profile(p_user uuid)
returns jsonb language sql stable set search_path = ''
as $$ select to_jsonb(p) from app_private.profiles p where p.user_id = p_user; $$;

create or replace function public.svc_create_profile(
  p_user_id uuid,
  p_display_name text,
  p_email text,
  p_phone text,
  p_territory_id text,
  p_consent_version text,
  p_contact_opt_in boolean,
  p_email_state text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row app_private.profiles%rowtype;
begin
  insert into app_private.profiles
    (user_id, display_name, email_contact, phone_e164, selected_territory_id, consent_version,
     contact_opt_in_at, email_verification_state)
  values
    (p_user_id, p_display_name, p_email, p_phone, p_territory_id, p_consent_version,
     case when p_contact_opt_in then now() end, p_email_state)
  on conflict (user_id) do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object('created', true, 'profile', to_jsonb(v_row));
  end if;
  select * into v_row from app_private.profiles where user_id = p_user_id;
  return jsonb_build_object('created', false, 'profile', to_jsonb(v_row));
end;
$$;

create or replace function public.svc_delete_profile(p_user uuid)
returns void language sql set search_path = ''
as $$ delete from app_private.profiles where user_id = p_user; $$;

create or replace function public.svc_update_profile(
  p_user uuid,
  p_display_name text default null,
  p_territory_id text default null,
  p_contact_opt_in boolean default null,
  p_email_state text default null
)
returns jsonb
language sql
set search_path = ''
as $$
  update app_private.profiles p
     set display_name = coalesce(p_display_name, p.display_name),
         selected_territory_id = coalesce(p_territory_id, p.selected_territory_id),
         contact_opt_in_at = case
           when p_contact_opt_in is null then p.contact_opt_in_at
           when p_contact_opt_in then coalesce(p.contact_opt_in_at, now())
           else null end,
         email_verification_state = coalesce(p_email_state, p.email_verification_state)
   where p.user_id = p_user
  returning to_jsonb(p);
$$;

create or replace function public.svc_grant_admin(p_user uuid, p_created_by uuid default null)
returns void language sql set search_path = ''
as $$
  insert into app_private.admins (user_id, created_by) values (p_user, p_created_by)
  on conflict (user_id) do nothing;
$$;

-- ---------------------------------------------------------------- groups
create or replace function public.svc_create_group_proposal(
  p_territory_id text,
  p_name text,
  p_join_url text,
  p_proposer_name text,
  p_proposer_email text,
  p_proposer_phone text,
  p_proposer_user_id uuid,
  p_consent_version text,
  p_idempotency_hash text,
  p_fingerprint_hash text
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into app_private.group_proposals
    (territory_id, name_proposed, join_url_proposed, proposer_name, proposer_email, proposer_phone,
     proposer_user_id, consent_version, idempotency_key_hash, fingerprint_hash)
  values
    (p_territory_id, p_name, p_join_url, p_proposer_name, p_proposer_email, p_proposer_phone,
     p_proposer_user_id, p_consent_version, p_idempotency_hash, p_fingerprint_hash)
  on conflict (idempotency_key_hash) where idempotency_key_hash is not null do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('id', v_id, 'status', 'pending', 'created', true);
  end if;
  select g.id into v_id from app_private.group_proposals g where g.idempotency_key_hash = p_idempotency_hash;
  return jsonb_build_object(
    'id', v_id,
    'status', (select g.status from app_private.group_proposals g where g.id = v_id),
    'created', false);
end;
$$;

create or replace function public.svc_list_group_proposals(
  p_status text, p_limit integer, p_cursor_created timestamptz default null, p_cursor_id uuid default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
    from (
      select g.id, g.territory_id, g.name_proposed, g.join_url_proposed, g.proposer_name,
             g.proposer_email, g.proposer_phone, g.status, g.created_at, g.reviewed_at, g.review_reason
        from app_private.group_proposals g
       where (p_status is null or g.status = p_status)
         and (p_cursor_created is null or (g.created_at, g.id) < (p_cursor_created, p_cursor_id))
       order by g.created_at desc, g.id desc
       limit least(greatest(p_limit, 1), 51)
    ) x;
$$;

create or replace function public.svc_approve_group_proposal(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
)
returns uuid language sql set search_path = ''
as $$ select app_private.approve_group_proposal(p_id, p_admin, p_reason, p_request_id); $$;

create or replace function public.svc_reject_group_proposal(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
)
returns void language sql set search_path = ''
as $$ select app_private.reject_group_proposal(p_id, p_admin, p_reason, p_request_id); $$;

create or replace function public.svc_add_group_manager(
  p_group_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_role_label text,
  p_admin uuid,
  p_request_id text default null
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not app_private.is_admin(p_admin) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  if not exists (select 1 from public.whatsapp_groups where id = p_group_id) then
    raise exception 'group not found' using errcode = 'PT404';
  end if;
  insert into app_private.group_managers (group_id, name, email, phone, role_label, created_by)
  values (p_group_id, p_name, p_email, p_phone, coalesce(p_role_label, 'responsavel'), p_admin)
  returning id into v_id;
  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id)
  values (p_admin, 'group.manager_add', 'whatsapp_group', p_group_id::text, p_request_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------- activities / rsvp
create or replace function public.svc_approve_activity(
  p_id uuid, p_admin uuid, p_reason text default null, p_request_id text default null
)
returns integer language sql set search_path = ''
as $$ select app_private.approve_activity(p_id, p_admin, p_reason, p_request_id); $$;

create or replace function public.svc_reject_activity(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
)
returns integer language sql set search_path = ''
as $$ select app_private.reject_activity(p_id, p_admin, p_reason, p_request_id); $$;

create or replace function public.svc_upsert_rsvp(
  p_activity uuid, p_user uuid, p_subject_hash text, p_going boolean, p_idempotency_hash text default null
)
returns jsonb language sql set search_path = ''
as $$ select app_private.upsert_rsvp(p_activity, p_user, p_subject_hash, p_going, p_idempotency_hash); $$;

-- ---------------------------------------------------------------- audit / abuse / turnstile
create or replace function public.svc_record_audit(
  p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_request_id text, p_reason text default null
)
returns void language sql set search_path = ''
as $$
  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_request_id, p_reason);
$$;

create or replace function public.svc_record_abuse(
  p_subject_hash text, p_route text, p_event_type text, p_block_code text default null
)
returns void language sql set search_path = ''
as $$
  insert into app_private.abuse_events (subject_hash, route, event_type, block_code)
  values (p_subject_hash, p_route, p_event_type, p_block_code);
$$;

create or replace function public.svc_list_security_events(
  p_limit integer, p_cursor_created timestamptz default null, p_cursor_id uuid default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc, x.id desc), '[]'::jsonb)
    from (
      select e.id, e.created_at, e.route, e.event_type, e.block_code
        from app_private.abuse_events e
       where p_cursor_created is null or (e.created_at, e.id) < (p_cursor_created, p_cursor_id)
       order by e.created_at desc, e.id desc
       limit least(greatest(p_limit, 1), 51)
    ) x;
$$;

create or replace function public.svc_consume_turnstile_token(p_hash text, p_ttl_seconds integer default 300)
returns boolean language sql set search_path = ''
as $$ select app_private.consume_turnstile_token(p_hash, p_ttl_seconds); $$;

create or replace function public.svc_purge_expired()
returns jsonb language sql set search_path = ''
as $$ select app_private.purge_expired(); $$;

-- ---------------------------------------------------------------- privileges
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
