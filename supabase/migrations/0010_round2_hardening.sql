-- 0010_round2_hardening.sql — TARGET ONLY. Round 2 (BE-2).
--
-- What:
--   * P-SEC-1: app_private.profiles.review_required_at (set when a provisional identity is
--     promoted by magic link; cleared when the person reviews their data). svc_update_profile
--     gains p_phone and p_review_required.
--   * Status "suspended" for public.whatsapp_groups and public.activities (CHECKs extended) +
--     audited, transactional suspend/unsuspend functions. Public views/policies already only
--     expose active groups and published/cancelled activities, so a suspended row disappears
--     from the Data API immediately; upsert_rsvp refuses it (PT404).
--   * Audited reveal of a proposer's contact (svc_reveal_proposal_contact): the audit row is
--     written in the same transaction as the read.
--   * svc_list_group_proposals exposes group_id (the column exists since 0005 and is filled by
--     approve_group_proposal).
--   * QA-1 F11: proposal idempotency keys expire (idempotency_expires_at) and never dedupe
--     against a decided (active/rejected) or expired proposal.
--   * QA-1 F09/F12 (defence in depth): activity coordinates inside the Minas Gerais bbox and
--     duration <= 24 h. (The 366-day horizon depends on now() and is enforced by the Worker.)
--   * svc_erase_group_proposals: audited erasure by id (LGPD erasure requests, dev cleanup).
--
-- ROLLBACK (manual, in this order):
--   drop function if exists public.svc_erase_group_proposals(uuid[], uuid, text);
--   drop function if exists public.svc_reveal_proposal_contact(uuid, uuid, text, text);
--   drop function if exists public.svc_suspend_group(uuid, uuid, text, text);
--   drop function if exists public.svc_unsuspend_group(uuid, uuid, text, text);
--   drop function if exists public.svc_suspend_activity(uuid, uuid, text, text);
--   drop function if exists public.svc_unsuspend_activity(uuid, uuid, text, text);
--   drop function if exists app_private.set_group_suspension(uuid, uuid, text, text, boolean);
--   drop function if exists app_private.set_activity_suspension(uuid, uuid, text, text, boolean);
--   recreate svc_update_profile / svc_create_group_proposal / svc_list_group_proposals from 0007;
--   update rows with status 'suspended' first, then restore the CHECKs from 0005/0006;
--   alter table public.activities drop constraint if exists activities_location_mg_check,
--     drop constraint if exists activities_duration_check;
--   alter table app_private.group_proposals drop column if exists idempotency_expires_at;
--   alter table app_private.profiles drop column if exists review_required_at;

-- ---------------------------------------------------------------- columns / checks
alter table app_private.profiles add column if not exists review_required_at timestamptz;

alter table app_private.group_proposals
  add column if not exists idempotency_expires_at timestamptz;
-- Existing keys keep 24 h from creation.
update app_private.group_proposals
   set idempotency_expires_at = created_at + interval '24 hours'
 where idempotency_key_hash is not null and idempotency_expires_at is null;

alter table public.whatsapp_groups drop constraint if exists whatsapp_groups_status_check;
alter table public.whatsapp_groups add constraint whatsapp_groups_status_check
  check (status in ('pending', 'active', 'inactive', 'rejected', 'suspended'));

alter table public.activities drop constraint if exists activities_status_check;
alter table public.activities add constraint activities_status_check
  check (status in ('draft', 'pending_review', 'published', 'rejected', 'cancelled', 'archived', 'suspended'));

alter table public.activities drop constraint if exists activities_location_mg_check;
alter table public.activities add constraint activities_location_mg_check
  check (location_lon between -51.1 and -39.8 and location_lat between -23.0 and -14.2);

alter table public.activities drop constraint if exists activities_duration_check;
alter table public.activities add constraint activities_duration_check
  check (ends_at is null or ends_at <= starts_at + interval '24 hours');

-- ---------------------------------------------------------------- profiles (P-SEC-1)
drop function if exists public.svc_update_profile(uuid, text, text, boolean, text);
create or replace function public.svc_update_profile(
  p_user uuid,
  p_display_name text default null,
  p_territory_id text default null,
  p_contact_opt_in boolean default null,
  p_email_state text default null,
  p_phone text default null,
  p_review_required boolean default null
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
           else null end
   where p.user_id = p_user
  returning to_jsonb(p);
$$;

-- ---------------------------------------------------------------- proposals (F11, group_id)
drop function if exists public.svc_create_group_proposal(text, text, text, text, text, text, uuid, text, text, text);
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
  p_fingerprint_hash text,
  p_idempotency_ttl_seconds integer default 86400
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_ttl integer := least(greatest(coalesce(p_idempotency_ttl_seconds, 86400), 60), 86400);
begin
  if p_idempotency_hash is not null then
    -- Only a PENDING, non-expired proposal is a duplicate. Decided or expired holders release
    -- the key so a re-submission becomes a new pending proposal (QA-1 F11).
    select g.id into v_id
      from app_private.group_proposals g
     where g.idempotency_key_hash = p_idempotency_hash
       and g.status = 'pending'
       and g.idempotency_expires_at > now()
     for update;
    if v_id is not null then
      return jsonb_build_object('id', v_id, 'status', 'pending', 'created', false);
    end if;
    update app_private.group_proposals g
       set idempotency_key_hash = null, idempotency_expires_at = null
     where g.idempotency_key_hash = p_idempotency_hash;
  end if;

  insert into app_private.group_proposals
    (territory_id, name_proposed, join_url_proposed, proposer_name, proposer_email, proposer_phone,
     proposer_user_id, consent_version, idempotency_key_hash, idempotency_expires_at, fingerprint_hash)
  values
    (p_territory_id, p_name, p_join_url, p_proposer_name, p_proposer_email, p_proposer_phone,
     p_proposer_user_id, p_consent_version, p_idempotency_hash,
     case when p_idempotency_hash is not null then now() + make_interval(secs => v_ttl) end,
     p_fingerprint_hash)
  on conflict (idempotency_key_hash) where idempotency_key_hash is not null do nothing
  returning id into v_id;

  if v_id is not null then
    return jsonb_build_object('id', v_id, 'status', 'pending', 'created', true);
  end if;
  -- Lost a race with a concurrent identical submission: return the winner.
  select g.id into v_id from app_private.group_proposals g where g.idempotency_key_hash = p_idempotency_hash;
  return jsonb_build_object('id', v_id, 'status', 'pending', 'created', false);
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
      select g.id, g.group_id, g.territory_id, g.name_proposed, g.join_url_proposed, g.proposer_name,
             g.proposer_email, g.proposer_phone, g.status, g.created_at, g.reviewed_at, g.review_reason
        from app_private.group_proposals g
       where (p_status is null or g.status = p_status)
         and (p_cursor_created is null or (g.created_at, g.id) < (p_cursor_created, p_cursor_id))
       order by g.created_at desc, g.id desc
       limit least(greatest(p_limit, 1), 51)
    ) x;
$$;

-- Audited reveal: the read and the audit row commit together (no reveal without a trail).
create or replace function public.svc_reveal_proposal_contact(
  p_id uuid, p_admin uuid, p_request_id text default null, p_reason text default null
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email text;
  v_phone text;
begin
  if not app_private.is_admin(p_admin) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  select g.proposer_email, g.proposer_phone into v_email, v_phone
    from app_private.group_proposals g where g.id = p_id;
  if not found then
    raise exception 'proposal not found' using errcode = 'PT404';
  end if;
  insert into app_private.audit_events
    (actor_user_id, action, entity_type, entity_id, request_id, reason, retention_class)
  values (p_admin, 'proposal.reveal_contact', 'group_proposal', p_id::text, p_request_id, p_reason, 'security');
  return jsonb_build_object(
    'proposal_id', p_id,
    'proposer_email', v_email,
    'proposer_phone', v_phone,
    'revealed_at', now());
end;
$$;

-- Erasure by id (LGPD requests / dev cleanup). Groups created from these proposals are NOT
-- removed here (they are public records with their own lifecycle); callers decide.
create or replace function public.svc_erase_group_proposals(
  p_ids uuid[], p_admin uuid default null, p_request_id text default null
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_id uuid;
begin
  delete from app_private.group_proposals g where g.id = any(p_ids);
  get diagnostics v_count = row_count;
  foreach v_id in array coalesce(p_ids, '{}'::uuid[]) loop
    insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id)
    values (p_admin, 'group_proposal.erase', 'group_proposal', v_id::text, p_request_id);
  end loop;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------- suspension
-- Group: active|inactive -> suspended; suspended -> active (no new moderation round: the
-- group was already approved; the admin who lifts it is audited with a reason).
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

  update public.whatsapp_groups g
     set status = case when p_suspend then 'suspended' else 'active' end
   where g.id = p_id
     and ((p_suspend and g.status in ('active', 'inactive')) or (not p_suspend and g.status = 'suspended'))
  returning * into v_row;

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

-- Activity: draft|pending_review|published|cancelled -> suspended;
-- suspended -> pending_review (must be moderated again before it is public).
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

  update public.activities a
     set status = case when p_suspend then 'suspended' else 'pending_review' end,
         reviewed_by = p_admin, reviewed_at = now(), review_reason = p_reason,
         version = a.version + 1
   where a.id = p_id
     and ((p_suspend and a.status in ('draft', 'pending_review', 'published', 'cancelled'))
       or (not p_suspend and a.status = 'suspended'))
  returning a.version into v_version;

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

create or replace function public.svc_suspend_group(p_id uuid, p_admin uuid, p_reason text, p_request_id text default null)
returns jsonb language sql set search_path = ''
as $$ select app_private.set_group_suspension(p_id, p_admin, p_reason, p_request_id, true); $$;

create or replace function public.svc_unsuspend_group(p_id uuid, p_admin uuid, p_reason text, p_request_id text default null)
returns jsonb language sql set search_path = ''
as $$ select app_private.set_group_suspension(p_id, p_admin, p_reason, p_request_id, false); $$;

create or replace function public.svc_suspend_activity(p_id uuid, p_admin uuid, p_reason text, p_request_id text default null)
returns integer language sql set search_path = ''
as $$ select app_private.set_activity_suspension(p_id, p_admin, p_reason, p_request_id, true); $$;

create or replace function public.svc_unsuspend_activity(p_id uuid, p_admin uuid, p_reason text, p_request_id text default null)
returns integer language sql set search_path = ''
as $$ select app_private.set_activity_suspension(p_id, p_admin, p_reason, p_request_id, false); $$;

-- ---------------------------------------------------------------- privileges
-- New/replaced svc_* functions: service_role only (PUBLIC keeps EXECUTE on new functions by
-- default, so revoke it explicitly — 0009 only changed anon/authenticated defaults).
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
