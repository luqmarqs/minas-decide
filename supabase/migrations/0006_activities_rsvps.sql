-- 0006_activities_rsvps.sql — TARGET ONLY.
--
-- ROLLBACK:
--   drop function if exists app_private.upsert_rsvp(uuid, uuid, text, boolean, text);
--   drop function if exists app_private.reject_activity(uuid, uuid, text, text);
--   drop function if exists app_private.approve_activity(uuid, uuid, text, text);
--   drop view if exists public.activities_public;
--   drop function if exists public.activity_rsvp_count(uuid);
--   drop table if exists app_private.activity_rsvps;
--   drop table if exists public.activities;
--
-- Exposure model (Data API):
--   * public.activities: NO table-level grant to anon/authenticated; column-level SELECT only on
--     the public projection columns (never creator_user_id, reviewer, review_reason, raw
--     description or raw contact). RLS: anon/authenticated see published|cancelled rows;
--     authenticated creators additionally see their own rows (same public columns only).
--     No INSERT/UPDATE/DELETE grants: every mutation goes through the Worker (service_role).
--   * contact_public_* are GENERATED columns that are NULL unless public_contact_opt_in is true,
--     so switching the opt-in off hides the contact immediately (T27) even for direct reads.
--   * public.activities_public: security_invoker view; RSVP counts come from
--     public.activity_rsvp_count(), which counts status = 'going' rows (never a blind counter).

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  creator_user_id uuid not null references auth.users (id) on delete cascade,
  territory_id text not null references public.territories (id) on delete cascade,
  title text not null check (char_length(title) between 5 and 120),
  type text not null check (type in ('panfletagem', 'encontro', 'reuniao', 'caminhada', 'mutirao', 'outro')),
  description text not null check (char_length(description) <= 2000),
  description_sanitized text not null check (char_length(description_sanitized) <= 2000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  timezone text not null default 'America/Sao_Paulo' check (timezone = 'America/Sao_Paulo'),
  public_address text not null check (char_length(public_address) between 5 and 240),
  location_lon double precision not null check (location_lon between -180 and 180),
  location_lat double precision not null check (location_lat between -90 and 90),
  location_precision text not null default 'exact' check (location_precision in ('exact', 'approximate')),
  status text not null default 'pending_review'
    check (status in ('draft', 'pending_review', 'published', 'rejected', 'cancelled', 'archived')),
  public_contact_opt_in boolean not null default false,
  public_contact_type text check (public_contact_type is null or public_contact_type in ('whatsapp', 'email', 'instagram')),
  public_contact_value text check (public_contact_value is null or char_length(public_contact_value) <= 120),
  contact_public_type text generated always as
    (case when public_contact_opt_in and public_contact_value is not null then public_contact_type end) stored,
  contact_public_value text generated always as
    (case when public_contact_opt_in and public_contact_type is not null then public_contact_value end) stored,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  cancelled_at timestamptz,
  version integer not null default 1 check (version >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  check (not public_contact_opt_in or (public_contact_type is not null and public_contact_value is not null))
);
create index if not exists activities_status_starts_idx on public.activities (status, starts_at, id);
create index if not exists activities_territory_idx on public.activities (territory_id, status, starts_at);
create index if not exists activities_creator_idx on public.activities (creator_user_id, created_at desc);
create index if not exists activities_location_idx on public.activities (location_lon, location_lat)
  where status in ('published', 'cancelled');

drop trigger if exists activities_touch on public.activities;
create trigger activities_touch before update on public.activities
  for each row execute function app_private.touch_updated_at();

alter table public.activities enable row level security;

drop policy if exists activities_public_read on public.activities;
create policy activities_public_read on public.activities
  for select to anon, authenticated using (status in ('published', 'cancelled'));

drop policy if exists activities_owner_read on public.activities;
create policy activities_owner_read on public.activities
  for select to authenticated using (creator_user_id = (select auth.uid()));

revoke all on table public.activities from anon, authenticated;
grant select (
  id, title, type, description_sanitized, starts_at, ends_at, timezone, public_address,
  location_lon, location_lat, territory_id, status, contact_public_type, contact_public_value, updated_at
) on table public.activities to anon, authenticated;
grant all on table public.activities to service_role;

create table if not exists app_private.activity_rsvps (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references public.activities (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  anonymous_subject_hash text check (anonymous_subject_hash is null or char_length(anonymous_subject_hash) = 64),
  status text not null default 'going' check (status in ('going', 'cancelled')),
  source text not null default 'device' check (source in ('session', 'device')),
  idempotency_key_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(user_id, anonymous_subject_hash) = 1)
);
create unique index if not exists activity_rsvps_user_uidx
  on app_private.activity_rsvps (activity_id, user_id) where user_id is not null;
create unique index if not exists activity_rsvps_subject_uidx
  on app_private.activity_rsvps (activity_id, anonymous_subject_hash) where anonymous_subject_hash is not null;
create index if not exists activity_rsvps_going_idx on app_private.activity_rsvps (activity_id) where status = 'going';

drop trigger if exists activity_rsvps_touch on app_private.activity_rsvps;
create trigger activity_rsvps_touch before update on app_private.activity_rsvps
  for each row execute function app_private.touch_updated_at();
alter table app_private.activity_rsvps enable row level security;
revoke all on table app_private.activity_rsvps from public, anon, authenticated;
grant all on table app_private.activity_rsvps to service_role;

-- Aggregate count of "going" for PUBLIC activities only (no list of participants).
create or replace function public.activity_rsvp_count(p_activity uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
    from app_private.activity_rsvps r
   where r.activity_id = p_activity
     and r.status = 'going'
     and exists (select 1 from public.activities a
                  where a.id = p_activity and a.status in ('published', 'cancelled'));
$$;
revoke execute on function public.activity_rsvp_count(uuid) from public;
grant execute on function public.activity_rsvp_count(uuid) to anon, authenticated, service_role;

create or replace view public.activities_public
with (security_invoker = true, security_barrier = true) as
  select a.id,
         a.title,
         a.type,
         a.description_sanitized,
         a.starts_at,
         a.ends_at,
         a.timezone,
         a.public_address as location_public,
         a.location_lon,
         a.location_lat,
         a.territory_id,
         a.status,
         a.contact_public_type,
         a.contact_public_value,
         public.activity_rsvp_count(a.id) as rsvp_count,
         a.updated_at
    from public.activities a
   where a.status in ('published', 'cancelled');

revoke all on table public.activities_public from anon, authenticated;
grant select on table public.activities_public to anon, authenticated, service_role;

create or replace function app_private.approve_activity(
  p_id uuid, p_admin uuid, p_reason text default null, p_request_id text default null
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
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
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

-- Idempotent RSVP. Exactly one identity: p_user (session) XOR p_subject_hash (device HMAC).
-- p_going = true  -> upsert status 'going' (rejected with PT409 if the activity is cancelled)
-- p_going = false -> mark this identity's row 'cancelled' (PT404 if this identity never RSVPed)
-- Activities that are not published/cancelled -> PT404. Returns {going, rsvp_count}.
create or replace function app_private.upsert_rsvp(
  p_activity uuid, p_user uuid, p_subject_hash text, p_going boolean, p_idempotency_hash text default null
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

revoke execute on function app_private.approve_activity(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function app_private.reject_activity(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function app_private.upsert_rsvp(uuid, uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function app_private.approve_activity(uuid, uuid, text, text) to service_role;
grant execute on function app_private.reject_activity(uuid, uuid, text, text) to service_role;
grant execute on function app_private.upsert_rsvp(uuid, uuid, text, boolean, text) to service_role;
