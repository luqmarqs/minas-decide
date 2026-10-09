-- 0005_groups.sql — TARGET ONLY.
--
-- ROLLBACK:
--   drop function if exists app_private.reject_group_proposal(uuid, uuid, text, text);
--   drop function if exists app_private.approve_group_proposal(uuid, uuid, text, text);
--   drop table if exists app_private.group_managers;
--   drop table if exists app_private.group_proposals;
--   drop view if exists public.whatsapp_groups_public;
--   drop table if exists public.whatsapp_groups;
--
-- Exposure model (Data API):
--   * public.whatsapp_groups: NO table-level grant to anon/authenticated. Only COLUMN-level
--     SELECT on the public projection columns + RLS `status = 'active'`. `select=*` on the
--     base table therefore fails with permission denied; admin columns are never readable.
--     (A security_invoker view needs the caller to hold SELECT on the referenced columns.)
--   * public.whatsapp_groups_public: security_invoker view (RLS of the caller applies).
--   * proposals / managers live in app_private (not exposed).

create table if not exists public.whatsapp_groups (
  id uuid primary key default gen_random_uuid(),
  territory_id text not null references public.territories (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 3 and 80),
  join_url text not null check (join_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{10,64}$'),
  status text not null default 'pending' check (status in ('pending', 'active', 'inactive', 'rejected')),
  source_proposal_id uuid unique,
  created_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  last_checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists whatsapp_groups_territory_status_idx on public.whatsapp_groups (territory_id, status);
create unique index if not exists whatsapp_groups_active_url_uidx
  on public.whatsapp_groups (join_url) where status = 'active';

drop trigger if exists whatsapp_groups_touch on public.whatsapp_groups;
create trigger whatsapp_groups_touch before update on public.whatsapp_groups
  for each row execute function app_private.touch_updated_at();

alter table public.whatsapp_groups enable row level security;
drop policy if exists whatsapp_groups_public_read on public.whatsapp_groups;
create policy whatsapp_groups_public_read on public.whatsapp_groups
  for select to anon, authenticated using (status = 'active');

revoke all on table public.whatsapp_groups from anon, authenticated;
grant select (id, display_name, territory_id, join_url, status, updated_at)
  on table public.whatsapp_groups to anon, authenticated;
grant all on table public.whatsapp_groups to service_role;

create or replace view public.whatsapp_groups_public
with (security_invoker = true, security_barrier = true) as
  select g.id, g.display_name, g.territory_id, g.join_url, g.status, g.updated_at
    from public.whatsapp_groups g
   where g.status = 'active';

revoke all on table public.whatsapp_groups_public from anon, authenticated;
grant select on table public.whatsapp_groups_public to anon, authenticated, service_role;

create table if not exists app_private.group_proposals (
  id uuid primary key default gen_random_uuid(),
  territory_id text not null references public.territories (id) on delete cascade,
  name_proposed text not null check (char_length(name_proposed) between 3 and 80),
  join_url_proposed text not null
    check (join_url_proposed ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]{10,64}$'),
  proposer_name text not null check (char_length(proposer_name) between 2 and 120),
  proposer_email text not null check (char_length(proposer_email) <= 254),
  proposer_phone text not null check (proposer_phone ~ '^\+55[1-9]{2}9[0-9]{8}$'),
  proposer_user_id uuid references auth.users (id) on delete set null,
  consent_version text not null,
  status text not null default 'pending' check (status in ('pending', 'active', 'rejected')),
  group_id uuid references public.whatsapp_groups (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_reason text check (review_reason is null or char_length(review_reason) <= 500),
  idempotency_key_hash text,
  -- HMAC of the network subject; minimised and nulled after fingerprint_expires_at.
  fingerprint_hash text,
  fingerprint_expires_at timestamptz default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists group_proposals_idem_uidx
  on app_private.group_proposals (idempotency_key_hash) where idempotency_key_hash is not null;
create index if not exists group_proposals_status_created_idx
  on app_private.group_proposals (status, created_at desc, id desc);

drop trigger if exists group_proposals_touch on app_private.group_proposals;
create trigger group_proposals_touch before update on app_private.group_proposals
  for each row execute function app_private.touch_updated_at();
alter table app_private.group_proposals enable row level security;

create table if not exists app_private.group_managers (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.whatsapp_groups (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  email text check (email is null or char_length(email) <= 254),
  phone text check (phone is null or phone ~ '^\+55[1-9]{2}9[0-9]{8}$'),
  role_label text not null default 'responsavel' check (char_length(role_label) <= 60),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists group_managers_group_idx on app_private.group_managers (group_id);
drop trigger if exists group_managers_touch on app_private.group_managers;
create trigger group_managers_touch before update on app_private.group_managers
  for each row execute function app_private.touch_updated_at();
alter table app_private.group_managers enable row level security;

revoke all on table app_private.group_proposals, app_private.group_managers from public, anon, authenticated;
grant all on table app_private.group_proposals, app_private.group_managers to service_role;

-- Transactional approval (T28): the conditional UPDATE takes the row lock; a concurrent
-- second approval re-checks `status = 'pending'` after the first commits and fails with
-- PT409. `whatsapp_groups.source_proposal_id` is UNIQUE as a second barrier.
create or replace function app_private.approve_group_proposal(
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
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
  p_id uuid, p_admin uuid, p_reason text, p_request_id text default null
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

revoke execute on function app_private.approve_group_proposal(uuid, uuid, text, text) from public, anon, authenticated;
revoke execute on function app_private.reject_group_proposal(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function app_private.approve_group_proposal(uuid, uuid, text, text) to service_role;
grant execute on function app_private.reject_group_proposal(uuid, uuid, text, text) to service_role;
