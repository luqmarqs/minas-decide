-- 0003_profiles_admins.sql — TARGET ONLY.
--
-- ROLLBACK:
--   drop function if exists app_private.email_in_use(text, uuid);
--   drop function if exists app_private.is_email_verified(uuid);
--   drop function if exists app_private.is_admin(uuid);
--   drop table if exists app_private.admins;
--   drop table if exists app_private.profiles;
--
-- Profiles and admins are private (schema app_private, RLS on, no policies, no grants to
-- anon/authenticated => default deny). The Worker reads/writes them with service_role after
-- explicit authorization in code.

create table if not exists app_private.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 120),
  -- Contact e-mail typed in the form. NOT proof of identity: verification comes only from
  -- auth.users.email_confirmed_at (see app_private.is_email_verified).
  email_contact text not null check (char_length(email_contact) <= 254),
  email_verification_state text not null default 'unverified'
    check (email_verification_state in ('unverified', 'pending', 'verified')),
  phone_e164 text check (phone_e164 is null or phone_e164 ~ '^\+55[1-9]{2}9[0-9]{8}$'),
  selected_territory_id text references public.territories (id) on delete set null,
  consent_version text not null check (char_length(consent_version) between 1 and 20),
  contact_opt_in_at timestamptz,
  account_state text not null default 'active' check (account_state in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch on app_private.profiles;
create trigger profiles_touch before update on app_private.profiles
  for each row execute function app_private.touch_updated_at();

alter table app_private.profiles enable row level security;

create table if not exists app_private.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null
);
alter table app_private.admins enable row level security;

revoke all on table app_private.profiles, app_private.admins from public, anon, authenticated;
grant all on table app_private.profiles, app_private.admins to service_role;

create or replace function app_private.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from app_private.admins a where a.user_id = uid);
$$;

-- E-mail verified according to Supabase Auth (never a user-editable column).
create or replace function app_private.is_email_verified(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select u.email is not null and u.email_confirmed_at is not null and u.deleted_at is null
       from auth.users u where u.id = uid),
    false);
$$;

-- True when another auth user (confirmed OR pending) already holds this e-mail.
create or replace function app_private.email_in_use(p_email text, p_exclude uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
     where lower(u.email) = lower(p_email)
       and (p_exclude is null or u.id <> p_exclude)
  );
$$;

revoke execute on function app_private.is_admin(uuid) from public, anon, authenticated;
revoke execute on function app_private.is_email_verified(uuid) from public, anon, authenticated;
revoke execute on function app_private.email_in_use(text, uuid) from public, anon, authenticated;
grant execute on function app_private.is_admin(uuid) to service_role;
grant execute on function app_private.is_email_verified(uuid) to service_role;
grant execute on function app_private.email_in_use(text, uuid) to service_role;
