-- 0011_qa2_fixes.sql — TARGET ONLY. Fixes from the QA-2 audit (BE-3).
--
-- What:
--   * QA2-01: svc_update_profile gains p_email_contact (the Worker re-syncs the profile e-mail
--     with the e-mail confirmed in Auth during /auth/confirm-email, after revoking the other
--     sessions).
--   * QA2-03: svc_approve_group_proposal returns jsonb {group_id, territory_id} and
--     svc_reject_group_proposal returns jsonb {proposal_id, territory_id}, so the Worker can
--     purge the public /groups cache of that territory.
--   * QA2-09: whatsapp_groups.status_before_suspension / activities.status_before_suspension.
--     Lifting a suspension restores the previous state: a group goes back to `inactive` if it
--     was inactive (else `active`); an activity goes back to `cancelled` if it was cancelled
--     (else `pending_review`, i.e. a new moderation round). svc_unsuspend_activity returns
--     jsonb {version, status}.
--   The new columns get NO grant to anon/authenticated (column-level SELECT grants from
--   0005/0006 are explicit lists).
--
-- ROLLBACK (manual, in this order):
--   drop function if exists public.svc_unsuspend_activity(uuid, uuid, text, text);
--   recreate svc_unsuspend_activity (returns integer) from 0010;
--   recreate app_private.set_group_suspension / app_private.set_activity_suspension from 0010;
--   drop function if exists public.svc_approve_group_proposal(uuid, uuid, text, text);
--   drop function if exists public.svc_reject_group_proposal(uuid, uuid, text, text);
--   recreate both from 0007 (returns uuid / void);
--   drop function if exists public.svc_update_profile(uuid, text, text, boolean, text, text, boolean, text);
--   recreate svc_update_profile from 0010;
--   alter table public.whatsapp_groups drop column if exists status_before_suspension;
--   alter table public.activities drop column if exists status_before_suspension;
--   re-run the privileges block at the end of 0010.

-- ---------------------------------------------------------------- columns
alter table public.whatsapp_groups
  add column if not exists status_before_suspension text;
alter table public.whatsapp_groups drop constraint if exists whatsapp_groups_status_before_suspension_check;
alter table public.whatsapp_groups add constraint whatsapp_groups_status_before_suspension_check
  check (status_before_suspension is null or status_before_suspension in ('active', 'inactive'));

alter table public.activities
  add column if not exists status_before_suspension text;
alter table public.activities drop constraint if exists activities_status_before_suspension_check;
alter table public.activities add constraint activities_status_before_suspension_check
  check (status_before_suspension is null
         or status_before_suspension in ('draft', 'pending_review', 'published', 'cancelled'));

-- ---------------------------------------------------------------- profiles (QA2-01)
drop function if exists public.svc_update_profile(uuid, text, text, boolean, text, text, boolean);
create or replace function public.svc_update_profile(
  p_user uuid,
  p_display_name text default null,
  p_territory_id text default null,
  p_contact_opt_in boolean default null,
  p_email_state text default null,
  p_phone text default null,
  p_review_required boolean default null,
  p_email_contact text default null
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
         email_verification_state = coalesce(p_email_state, p.email_verification_state),
         phone_e164 = coalesce(p_phone, p.phone_e164),
         review_required_at = case
           when p_review_required is null then p.review_required_at
           when p_review_required then now()
           else null end,
         email_contact = coalesce(p_email_contact, p.email_contact)
   where p.user_id = p_user
  returning to_jsonb(p);
$$;

-- ---------------------------------------------------------------- proposals (QA2-03)
drop function if exists public.svc_approve_group_proposal(uuid, uuid, text, text);
create or replace function public.svc_approve_group_proposal(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_group uuid;
  v_territory text;
begin
  v_group := app_private.approve_group_proposal(p_id, p_admin, p_reason, p_request_id);
  select g.territory_id into v_territory from public.whatsapp_groups g where g.id = v_group;
  return jsonb_build_object('group_id', v_group, 'territory_id', v_territory);
end;
$$;

drop function if exists public.svc_reject_group_proposal(uuid, uuid, text, text);
create or replace function public.svc_reject_group_proposal(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_territory text;
begin
  perform app_private.reject_group_proposal(p_id, p_admin, p_reason, p_request_id);
  select g.territory_id into v_territory from app_private.group_proposals g where g.id = p_id;
  return jsonb_build_object('proposal_id', p_id, 'territory_id', v_territory);
end;
$$;

-- ---------------------------------------------------------------- suspension (QA2-09)
create or replace function app_private.set_group_suspension(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text, p_suspend boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.whatsapp_groups%rowtype;
begin
  if not app_private.is_admin(p_admin) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'reason required' using errcode = 'PT422';
  end if;

  if p_suspend then
    update public.whatsapp_groups g
       set status_before_suspension = g.status, status = 'suspended'
     where g.id = p_id and g.status in ('active', 'inactive')
    returning * into v_row;
  else
    update public.whatsapp_groups g
       set status = coalesce(g.status_before_suspension, 'active'), status_before_suspension = null
     where g.id = p_id and g.status = 'suspended'
    returning * into v_row;
  end if;

  if not found then
    if exists (select 1 from public.whatsapp_groups where id = p_id) then
      raise exception 'invalid status transition' using errcode = 'PT409';
    end if;
    raise exception 'group not found' using errcode = 'PT404';
  end if;

  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_admin, case when p_suspend then 'group.suspend' else 'group.unsuspend' end,
          'whatsapp_group', p_id::text, p_request_id, p_reason);

  return jsonb_build_object('id', v_row.id, 'territory_id', v_row.territory_id,
                            'status', v_row.status, 'updated_at', v_row.updated_at);
end;
$$;

-- Activity: draft|pending_review|published|cancelled -> suspended (previous state kept);
-- suspended -> cancelled if it was cancelled, else pending_review (new moderation round).
create or replace function app_private.set_activity_suspension(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text, p_suspend boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version integer;
begin
  if not app_private.is_admin(p_admin) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'reason required' using errcode = 'PT422';
  end if;

  if p_suspend then
    update public.activities a
       set status_before_suspension = a.status, status = 'suspended',
           reviewed_by = p_admin, reviewed_at = now(), review_reason = p_reason,
           version = a.version + 1
     where a.id = p_id and a.status in ('draft', 'pending_review', 'published', 'cancelled')
    returning a.version into v_version;
  else
    update public.activities a
       set status = case when a.status_before_suspension = 'cancelled' then 'cancelled'
                         else 'pending_review' end,
           status_before_suspension = null,
           reviewed_by = p_admin, reviewed_at = now(), review_reason = p_reason,
           version = a.version + 1
     where a.id = p_id and a.status = 'suspended'
    returning a.version into v_version;
  end if;

  if not found then
    if exists (select 1 from public.activities where id = p_id) then
      raise exception 'invalid status transition' using errcode = 'PT409';
    end if;
    raise exception 'activity not found' using errcode = 'PT404';
  end if;

  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_admin, case when p_suspend then 'activity.suspend' else 'activity.unsuspend' end,
          'activity', p_id::text, p_request_id, p_reason);
  return v_version;
end;
$$;

revoke execute on function app_private.set_group_suspension(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function app_private.set_activity_suspension(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function app_private.set_group_suspension(uuid, uuid, text, text, boolean) to service_role;
grant execute on function app_private.set_activity_suspension(uuid, uuid, text, text, boolean) to service_role;

drop function if exists public.svc_unsuspend_activity(uuid, uuid, text, text);
create or replace function public.svc_unsuspend_activity(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
  v_status text;
begin
  v_version := app_private.set_activity_suspension(p_id, p_admin, p_reason, p_request_id, false);
  select a.status into v_status from public.activities a where a.id = p_id;
  return jsonb_build_object('version', v_version, 'status', v_status);
end;
$$;

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
