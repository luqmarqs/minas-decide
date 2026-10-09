-- 0012_clerk_user_ids.sql — TARGET ONLY. ADR 0005 (Clerk replaces Supabase Auth). BE-5.
--
-- What:
--   * Every user-id column becomes `text` holding the Clerk user id (`user_…`), with no FK to
--     auth.users (Supabase Auth is no longer the identity provider):
--       app_private.profiles.user_id (PK), app_private.admins.user_id (PK) / created_by,
--       public.activities.creator_user_id / reviewed_by, app_private.activity_rsvps.user_id,
--       app_private.audit_events.actor_user_id, app_private.group_proposals.proposer_user_id /
--       reviewed_by, app_private.group_managers.created_by, public.whatsapp_groups.created_by /
--       approved_by.
--     ALTER COLUMN ... TYPE rebuilds the dependent indexes (PKs, activity_rsvps_user_uidx,
--     activities_creator_idx) with the new type; nothing else to recreate.
--   * CHECK `user_…` format on the identity columns (audit_events keeps historical uuids, so
--     it gets no format check). Legacy uuid values in nullable "*_by" columns are nulled (they
--     pointed to Supabase Auth users that no longer matter, i.e. ON DELETE SET NULL semantics).
--     Rows with a legacy uuid in profiles/admins/activities/activity_rsvps ABORT the migration:
--     run `APP_ENV=local npx tsx scripts/db/cleanup-dev-data.ts --yes --all` first.
--   * app_private.is_email_verified(uid) reads profiles.email_verification_state = 'verified'
--     (set only by the Worker after Clerk reported the address verified) and the account must
--     be active. app_private.email_in_use reads profiles.email_contact.
--   * Every app_private/public function taking a user id (uid/p_user/p_admin/p_actor/
--     p_exclude/p_proposer_user_id/p_created_by) is re-created with `text`. Old uuid
--     signatures are dropped.
--   * profiles.review_required_at (P-SEC-1) is DISCONTINUED but kept (always null): there is
--     no magic-link promotion any more. svc_update_profile loses p_review_required.
--   * Defence in depth: the browser no longer talks to Supabase (no direct reads in src/), so
--     every grant to anon/authenticated on public tables/views/functions is revoked
--     (territories, whatsapp_groups(+_public), activities(+_public), activity_rsvp_count).
--     The owner-read policy based on auth.uid() is dropped. The Worker uses service_role.
--
-- ROLLBACK (manual; dev data only): restoring uuid columns requires emptying the tables
-- (Clerk ids do not cast to uuid):
--   truncate app_private.activity_rsvps, app_private.profiles, app_private.admins;
--   delete from public.activities; update app_private.group_proposals set proposer_user_id = null,
--     reviewed_by = null; update public.whatsapp_groups set created_by = null, approved_by = null;
--   update app_private.group_managers set created_by = null;
--   alter each column back with `type uuid using null` / `using col::uuid` and re-add the FKs
--   to auth.users from 0003/0005/0006; re-run 0003, 0006, 0007, 0010, 0011 function bodies;
--   drop function if exists public.svc_erase_user_data(text, text), public.svc_dev_wipe_identities(text);
--   re-grant SELECT to anon/authenticated as in 0002/0005/0006 and re-create
--   activities_owner_read from 0006.

-- ---------------------------------------------------------------- guard: legacy identities
do $$
declare
  v_bad integer;
begin
  select (select count(*) from app_private.profiles where user_id::text !~ '^user_')
       + (select count(*) from app_private.admins where user_id::text !~ '^user_')
       + (select count(*) from public.activities where creator_user_id::text !~ '^user_')
       + (select count(*) from app_private.activity_rsvps
           where user_id is not null and user_id::text !~ '^user_')
    into v_bad;
  if v_bad > 0 then
    raise exception 'legacy Supabase Auth ids present (% rows); run scripts/db/cleanup-dev-data.ts --yes --all first', v_bad;
  end if;
end;
$$;

-- ---------------------------------------------------------------- policies / FKs
-- The policy references creator_user_id and auth.uid(); it blocks ALTER TYPE and is
-- meaningless without Supabase Auth sessions.
drop policy if exists activities_owner_read on public.activities;

do $$
declare
  r record;
begin
  for r in
    select c.conname, c.conrelid::regclass as tbl
      from pg_constraint c
     where c.contype = 'f'
       and c.confrelid = 'auth.users'::regclass
       and c.connamespace in ('public'::regnamespace, 'app_private'::regnamespace)
  loop
    execute format('alter table %s drop constraint %I', r.tbl, r.conname);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- columns -> text
alter table app_private.profiles alter column user_id type text using user_id::text;
alter table app_private.admins alter column user_id type text using user_id::text;
alter table app_private.admins alter column created_by type text using created_by::text;
alter table public.activities alter column creator_user_id type text using creator_user_id::text;
alter table public.activities alter column reviewed_by type text using reviewed_by::text;
alter table app_private.activity_rsvps alter column user_id type text using user_id::text;
alter table app_private.audit_events alter column actor_user_id type text using actor_user_id::text;
alter table app_private.group_proposals alter column proposer_user_id type text using proposer_user_id::text;
alter table app_private.group_proposals alter column reviewed_by type text using reviewed_by::text;
alter table app_private.group_managers alter column created_by type text using created_by::text;
alter table public.whatsapp_groups alter column created_by type text using created_by::text;
alter table public.whatsapp_groups alter column approved_by type text using approved_by::text;

-- Legacy (Supabase Auth) references in optional "by" columns: drop them.
update app_private.admins set created_by = null where created_by is not null and created_by !~ '^user_';
update public.activities set reviewed_by = null where reviewed_by is not null and reviewed_by !~ '^user_';
update app_private.group_proposals set proposer_user_id = null
 where proposer_user_id is not null and proposer_user_id !~ '^user_';
update app_private.group_proposals set reviewed_by = null where reviewed_by is not null and reviewed_by !~ '^user_';
update app_private.group_managers set created_by = null where created_by is not null and created_by !~ '^user_';
update public.whatsapp_groups set created_by = null where created_by is not null and created_by !~ '^user_';
update public.whatsapp_groups set approved_by = null where approved_by is not null and approved_by !~ '^user_';

-- Clerk id format (user_ + base62). Applied to every identity column except audit_events.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('app_private.profiles', 'user_id'),
      ('app_private.admins', 'user_id'),
      ('app_private.admins', 'created_by'),
      ('public.activities', 'creator_user_id'),
      ('public.activities', 'reviewed_by'),
      ('app_private.activity_rsvps', 'user_id'),
      ('app_private.group_proposals', 'proposer_user_id'),
      ('app_private.group_proposals', 'reviewed_by'),
      ('app_private.group_managers', 'created_by'),
      ('public.whatsapp_groups', 'created_by'),
      ('public.whatsapp_groups', 'approved_by')
    ) as t(tbl, col)
  loop
    execute format('alter table %s drop constraint if exists %I', r.tbl, r.col || '_clerk_id_check');
    execute format(
      'alter table %s add constraint %I check (%I is null or %I ~ %L)',
      r.tbl, r.col || '_clerk_id_check', r.col, r.col, '^user_[A-Za-z0-9]{1,64}$');
  end loop;
end;
$$;

alter table app_private.audit_events drop constraint if exists audit_events_actor_len_check;
alter table app_private.audit_events add constraint audit_events_actor_len_check
  check (actor_user_id is null or char_length(actor_user_id) <= 80);

-- ---------------------------------------------------------------- drop uuid-signature functions
drop function if exists public.svc_is_admin(uuid);
drop function if exists public.svc_is_email_verified(uuid);
drop function if exists public.svc_email_in_use(text, uuid);
drop function if exists public.svc_get_profile(uuid);
drop function if exists public.svc_create_profile(uuid, text, text, text, text, text, boolean, text);
drop function if exists public.svc_delete_profile(uuid);
drop function if exists public.svc_update_profile(uuid, text, text, boolean, text, text, boolean, text);
drop function if exists public.svc_grant_admin(uuid, uuid);
drop function if exists public.svc_create_group_proposal(text, text, text, text, text, text, uuid, text, text, text, integer);
drop function if exists public.svc_approve_group_proposal(uuid, uuid, text, text);
drop function if exists public.svc_reject_group_proposal(uuid, uuid, text, text);
drop function if exists public.svc_add_group_manager(uuid, text, text, text, text, uuid, text);
drop function if exists public.svc_approve_activity(uuid, uuid, text, text);
drop function if exists public.svc_reject_activity(uuid, uuid, text, text);
drop function if exists public.svc_upsert_rsvp(uuid, uuid, text, boolean, text);
drop function if exists public.svc_record_audit(uuid, text, text, text, text, text);
drop function if exists public.svc_reveal_proposal_contact(uuid, uuid, text, text);
drop function if exists public.svc_erase_group_proposals(uuid[], uuid, text);
drop function if exists public.svc_suspend_group(uuid, uuid, text, text);
drop function if exists public.svc_unsuspend_group(uuid, uuid, text, text);
drop function if exists public.svc_suspend_activity(uuid, uuid, text, text);
drop function if exists public.svc_unsuspend_activity(uuid, uuid, text, text);

drop function if exists app_private.is_admin(uuid);
drop function if exists app_private.is_email_verified(uuid);
drop function if exists app_private.email_in_use(text, uuid);
drop function if exists app_private.approve_activity(uuid, uuid, text, text);
drop function if exists app_private.reject_activity(uuid, uuid, text, text);
drop function if exists app_private.upsert_rsvp(uuid, uuid, text, boolean, text);
drop function if exists app_private.approve_group_proposal(uuid, uuid, text, text);
drop function if exists app_private.reject_group_proposal(uuid, uuid, text, text);
drop function if exists app_private.set_group_suspension(uuid, uuid, text, text, boolean);
drop function if exists app_private.set_activity_suspension(uuid, uuid, text, text, boolean);

-- ---------------------------------------------------------------- app_private (text ids)
create or replace function app_private.is_admin(uid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app_private.admins a where a.user_id = uid);
$$;

-- E-mail verified = the profile was created by the Worker from a Clerk session whose primary
-- e-mail was verified by Clerk (the Worker re-checks Clerk on every request as well).
create or replace function app_private.is_email_verified(uid text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.email_verification_state = 'verified' and p.account_state = 'active'
       from app_private.profiles p where p.user_id = uid),
    false);
$$;

-- True when ANOTHER profile already holds this contact e-mail (case-insensitive).
create or replace function app_private.email_in_use(p_email text, p_exclude text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from app_private.profiles p
     where lower(p.email_contact) = lower(p_email)
       and (p_exclude is null or p.user_id <> p_exclude)
  );
$$;

create or replace function app_private.approve_activity(
  p_id uuid, p_admin text, p_reason text default null, p_request_id text default null
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

  update public.activities
     set status = 'published', reviewed_by = p_admin, reviewed_at = now(),
         review_reason = p_reason, version = version + 1
   where id = p_id and status = 'pending_review'
  returning version into v_version;

  if not found then
    if exists (select 1 from public.activities where id = p_id) then
      raise exception 'activity is not pending review' using errcode = 'PT409';
    end if;
    raise exception 'activity not found' using errcode = 'PT404';
  end if;

  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_admin, 'activity.approve', 'activity', p_id::text, p_request_id, p_reason);
  return v_version;
end;
$$;

create or replace function app_private.reject_activity(
  p_id uuid, p_admin text, p_reason text, p_request_id text default null
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

  update public.activities
     set status = 'rejected', reviewed_by = p_admin, reviewed_at = now(),
         review_reason = p_reason, version = version + 1
   where id = p_id and status = 'pending_review'
  returning version into v_version;

  if not found then
    if exists (select 1 from public.activities where id = p_id) then
      raise exception 'activity is not pending review' using errcode = 'PT409';
    end if;
    raise exception 'activity not found' using errcode = 'PT404';
  end if;

  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_admin, 'activity.reject', 'activity', p_id::text, p_request_id, p_reason);
  return v_version;
end;
$$;

-- Idempotent RSVP. Exactly one identity: p_user (Clerk session) XOR p_subject_hash (device HMAC).
create or replace function app_private.upsert_rsvp(
  p_activity uuid, p_user text, p_subject_hash text, p_going boolean, p_idempotency_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_row_status text;
begin
  if num_nonnulls(p_user, p_subject_hash) <> 1 then
    raise exception 'exactly one identity required' using errcode = 'PT400';
  end if;

  select a.status into v_status from public.activities a where a.id = p_activity for share;
  if v_status is null or v_status not in ('published', 'cancelled') then
    raise exception 'activity not found' using errcode = 'PT404';
  end if;

  if p_going then
    if v_status <> 'published' then
      raise exception 'activity cancelled' using errcode = 'PT409';
    end if;
    if p_user is not null then
      insert into app_private.activity_rsvps (activity_id, user_id, status, source, idempotency_key_hash)
      values (p_activity, p_user, 'going', 'session', p_idempotency_hash)
      on conflict (activity_id, user_id) where user_id is not null
      do update set status = 'going';
    else
      insert into app_private.activity_rsvps (activity_id, anonymous_subject_hash, status, source, idempotency_key_hash)
      values (p_activity, p_subject_hash, 'going', 'device', p_idempotency_hash)
      on conflict (activity_id, anonymous_subject_hash) where anonymous_subject_hash is not null
      do update set status = 'going';
    end if;
  else
    update app_private.activity_rsvps r
       set status = 'cancelled'
     where r.activity_id = p_activity
       and ((p_user is not null and r.user_id = p_user)
         or (p_subject_hash is not null and r.anonymous_subject_hash = p_subject_hash))
    returning r.status into v_row_status;
    if v_row_status is null then
      raise exception 'no rsvp for this identity' using errcode = 'PT404';
    end if;
  end if;

  return jsonb_build_object(
    'going', p_going,
    'rsvp_count', (select count(*) from app_private.activity_rsvps r
                    where r.activity_id = p_activity and r.status = 'going'));
end;
$$;

create or replace function app_private.approve_group_proposal(
  p_id uuid, p_admin text, p_reason text, p_request_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prop app_private.group_proposals%rowtype;
  v_group uuid;
begin
  if not app_private.is_admin(p_admin) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;

  update app_private.group_proposals
     set status = 'active', reviewed_by = p_admin, reviewed_at = now(), review_reason = p_reason
   where id = p_id and status = 'pending'
  returning * into v_prop;

  if not found then
    if exists (select 1 from app_private.group_proposals where id = p_id) then
      raise exception 'proposal is not pending' using errcode = 'PT409';
    end if;
    raise exception 'proposal not found' using errcode = 'PT404';
  end if;

  insert into public.whatsapp_groups
    (territory_id, display_name, join_url, status, source_proposal_id, created_by, approved_by, approved_at)
  values
    (v_prop.territory_id, v_prop.name_proposed, v_prop.join_url_proposed, 'active', v_prop.id,
     v_prop.proposer_user_id, p_admin, now())
  returning id into v_group;

  update app_private.group_proposals set group_id = v_group where id = p_id;

  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_admin, 'group_proposal.approve', 'group_proposal', p_id::text, p_request_id, p_reason);

  return v_group;
end;
$$;

create or replace function app_private.reject_group_proposal(
  p_id uuid, p_admin text, p_reason text, p_request_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not app_private.is_admin(p_admin) then
    raise exception 'forbidden' using errcode = 'PT403';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 3 then
    raise exception 'reason required' using errcode = 'PT422';
  end if;

  update app_private.group_proposals
     set status = 'rejected', reviewed_by = p_admin, reviewed_at = now(), review_reason = p_reason
   where id = p_id and status = 'pending';

  if not found then
    if exists (select 1 from app_private.group_proposals where id = p_id) then
      raise exception 'proposal is not pending' using errcode = 'PT409';
    end if;
    raise exception 'proposal not found' using errcode = 'PT404';
  end if;

  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_admin, 'group_proposal.reject', 'group_proposal', p_id::text, p_request_id, p_reason);
end;
$$;

create or replace function app_private.set_group_suspension(
  p_id uuid, p_admin text, p_reason text, p_request_id text, p_suspend boolean
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

create or replace function app_private.set_activity_suspension(
  p_id uuid, p_admin text, p_reason text, p_request_id text, p_suspend boolean
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

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'app_private'
       and p.proname in ('is_admin', 'is_email_verified', 'email_in_use', 'approve_activity',
                         'reject_activity', 'upsert_rsvp', 'approve_group_proposal',
                         'reject_group_proposal', 'set_group_suspension', 'set_activity_suspension')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end;
$$;

-- ---------------------------------------------------------------- public svc_* (text ids)
create or replace function public.svc_is_admin(p_user text)
returns boolean language sql stable set search_path = ''
as $$ select app_private.is_admin(p_user); $$;

create or replace function public.svc_is_email_verified(p_user text)
returns boolean language sql stable set search_path = ''
as $$ select app_private.is_email_verified(p_user); $$;

create or replace function public.svc_email_in_use(p_email text, p_exclude text)
returns boolean language sql stable set search_path = ''
as $$ select app_private.email_in_use(p_email, p_exclude); $$;

create or replace function public.svc_get_profile(p_user text)
returns jsonb language sql stable set search_path = ''
as $$ select to_jsonb(p) from app_private.profiles p where p.user_id = p_user; $$;

create or replace function public.svc_create_profile(
  p_user_id text,
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

create or replace function public.svc_delete_profile(p_user text)
returns void language sql set search_path = ''
as $$ delete from app_private.profiles where user_id = p_user; $$;

-- review_required_at is discontinued (always null); p_email_contact re-syncs the contact
-- e-mail with the verified primary e-mail reported by Clerk.
create or replace function public.svc_update_profile(
  p_user text,
  p_display_name text default null,
  p_territory_id text default null,
  p_contact_opt_in boolean default null,
  p_email_state text default null,
  p_phone text default null,
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
         email_contact = coalesce(p_email_contact, p.email_contact)
   where p.user_id = p_user
  returning to_jsonb(p);
$$;

create or replace function public.svc_grant_admin(p_user text, p_created_by text default null)
returns void language sql set search_path = ''
as $$
  insert into app_private.admins (user_id, created_by) values (p_user, p_created_by)
  on conflict (user_id) do nothing;
$$;

create or replace function public.svc_create_group_proposal(
  p_territory_id text,
  p_name text,
  p_join_url text,
  p_proposer_name text,
  p_proposer_email text,
  p_proposer_phone text,
  p_proposer_user_id text,
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
  select g.id into v_id from app_private.group_proposals g where g.idempotency_key_hash = p_idempotency_hash;
  return jsonb_build_object('id', v_id, 'status', 'pending', 'created', false);
end;
$$;

create or replace function public.svc_approve_group_proposal(
  p_id uuid, p_admin text, p_reason text, p_request_id text default null
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

create or replace function public.svc_reject_group_proposal(
  p_id uuid, p_admin text, p_reason text, p_request_id text default null
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

create or replace function public.svc_add_group_manager(
  p_group_id uuid,
  p_name text,
  p_email text,
  p_phone text,
  p_role_label text,
  p_admin text,
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

create or replace function public.svc_approve_activity(
  p_id uuid, p_admin text, p_reason text default null, p_request_id text default null
)
returns integer language sql set search_path = ''
as $$ select app_private.approve_activity(p_id, p_admin, p_reason, p_request_id); $$;

create or replace function public.svc_reject_activity(
  p_id uuid, p_admin text, p_reason text, p_request_id text default null
)
returns integer language sql set search_path = ''
as $$ select app_private.reject_activity(p_id, p_admin, p_reason, p_request_id); $$;

create or replace function public.svc_upsert_rsvp(
  p_activity uuid, p_user text, p_subject_hash text, p_going boolean, p_idempotency_hash text default null
)
returns jsonb language sql set search_path = ''
as $$ select app_private.upsert_rsvp(p_activity, p_user, p_subject_hash, p_going, p_idempotency_hash); $$;

create or replace function public.svc_record_audit(
  p_actor text, p_action text, p_entity_type text, p_entity_id text, p_request_id text, p_reason text default null
)
returns void language sql set search_path = ''
as $$
  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id, reason)
  values (p_actor, p_action, p_entity_type, p_entity_id, p_request_id, p_reason);
$$;

create or replace function public.svc_reveal_proposal_contact(
  p_id uuid, p_admin text, p_request_id text default null, p_reason text default null
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

create or replace function public.svc_erase_group_proposals(
  p_ids uuid[], p_admin text default null, p_request_id text default null
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

create or replace function public.svc_suspend_group(p_id uuid, p_admin text, p_reason text, p_request_id text default null)
returns jsonb language sql set search_path = ''
as $$ select app_private.set_group_suspension(p_id, p_admin, p_reason, p_request_id, true); $$;

create or replace function public.svc_unsuspend_group(p_id uuid, p_admin text, p_reason text, p_request_id text default null)
returns jsonb language sql set search_path = ''
as $$ select app_private.set_group_suspension(p_id, p_admin, p_reason, p_request_id, false); $$;

create or replace function public.svc_suspend_activity(p_id uuid, p_admin text, p_reason text, p_request_id text default null)
returns integer language sql set search_path = ''
as $$ select app_private.set_activity_suspension(p_id, p_admin, p_reason, p_request_id, true); $$;

create or replace function public.svc_unsuspend_activity(
  p_id uuid, p_admin text, p_reason text, p_request_id text default null
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

-- Erasure of everything tied to ONE person (LGPD erasure request / test cleanup): RSVPs,
-- activities created by them (their RSVPs cascade), profile and admin row. Audited without PII.
-- Group proposals carry their own contact data and are erased via svc_erase_group_proposals.
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
  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id)
  values (null, 'user.erase', 'user', p_user, p_request_id);
  return jsonb_build_object('rsvps', v_rsvps, 'activities', v_activities,
                            'profiles', v_profiles, 'admins', v_admins);
end;
$$;

-- Admin-only dev cleanup helper (service_role): wipes every operational row tied to people.
-- Used by scripts/db/cleanup-dev-data.ts --all (dev TARGET only). Audit/abuse events are kept.
create or replace function public.svc_dev_wipe_identities(p_request_id text default null)
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
  delete from app_private.activity_rsvps where user_id is not null;
  get diagnostics v_rsvps = row_count;
  delete from public.activities;
  get diagnostics v_activities = row_count;
  delete from app_private.profiles;
  get diagnostics v_profiles = row_count;
  delete from app_private.admins;
  get diagnostics v_admins = row_count;
  insert into app_private.audit_events (actor_user_id, action, entity_type, entity_id, request_id)
  values (null, 'dev.wipe_identities', 'system', null, p_request_id);
  return jsonb_build_object('rsvps', v_rsvps, 'activities', v_activities,
                            'profiles', v_profiles, 'admins', v_admins);
end;
$$;

-- ---------------------------------------------------------------- privileges (svc_*)
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

-- ---------------------------------------------------------------- no direct browser access
-- src/ no longer reads Supabase (ADR 0005); every read goes through the Worker (service_role).
revoke all on table public.territories from anon, authenticated;
revoke all on table public.whatsapp_groups from anon, authenticated;
revoke all on table public.whatsapp_groups_public from anon, authenticated;
revoke all on table public.activities from anon, authenticated;
revoke all on table public.activities_public from anon, authenticated;
revoke execute on function public.activity_rsvp_count(uuid) from public, anon, authenticated;
grant execute on function public.activity_rsvp_count(uuid) to service_role;
grant select on table public.territories, public.whatsapp_groups_public, public.activities_public
  to service_role;
grant all on table public.whatsapp_groups, public.activities to service_role;
