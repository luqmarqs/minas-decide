-- 0004_audit_abuse_turnstile.sql — TARGET ONLY.
--
-- ROLLBACK:
--   drop function if exists app_private.consume_turnstile_token(text, integer);
--   drop table if exists app_private.turnstile_tokens_used;
--   drop table if exists app_private.abuse_events;
--   drop table if exists app_private.audit_events;
--
-- No raw IPs anywhere: abuse events carry an HMAC subject hash computed by the Worker.
-- Retention: abuse_events 90 days, turnstile tokens until expiry (5 min), proposal
-- fingerprints 30 days — enforced by app_private.purge_expired() (0007; run manually or by a
-- future scheduled job; no cron in the MVP).

create table if not exists app_private.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  action text not null check (char_length(action) <= 80),
  entity_type text not null check (char_length(entity_type) <= 40),
  entity_id text,
  request_id text,
  reason text check (reason is null or char_length(reason) <= 500),
  before_hash text,
  after_hash text,
  retention_class text not null default 'standard' check (retention_class in ('standard', 'security')),
  created_at timestamptz not null default now()
);
create index if not exists audit_events_entity_idx
  on app_private.audit_events (entity_type, entity_id, created_at desc);
alter table app_private.audit_events enable row level security;

create table if not exists app_private.abuse_events (
  id uuid primary key default gen_random_uuid(),
  subject_hash text check (subject_hash is null or char_length(subject_hash) <= 128),
  route text not null check (char_length(route) <= 120),
  event_type text not null check (char_length(event_type) <= 60),
  block_code text check (block_code is null or char_length(block_code) <= 60),
  created_at timestamptz not null default now()
);
create index if not exists abuse_events_created_idx on app_private.abuse_events (created_at desc, id desc);
alter table app_private.abuse_events enable row level security;

create table if not exists app_private.turnstile_tokens_used (
  token_hash text primary key check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists turnstile_tokens_expires_idx on app_private.turnstile_tokens_used (expires_at);
alter table app_private.turnstile_tokens_used enable row level security;

revoke all on table app_private.audit_events, app_private.abuse_events, app_private.turnstile_tokens_used
  from public, anon, authenticated;
grant all on table app_private.audit_events, app_private.abuse_events, app_private.turnstile_tokens_used
  to service_role;

-- Single-use guard for Turnstile tokens (T17). Returns true on first use only.
create or replace function app_private.consume_turnstile_token(p_hash text, p_ttl_seconds integer default 300)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted text;
begin
  delete from app_private.turnstile_tokens_used where expires_at < now();
  insert into app_private.turnstile_tokens_used (token_hash, expires_at)
  values (p_hash, now() + make_interval(secs => greatest(p_ttl_seconds, 60)))
  on conflict (token_hash) do nothing
  returning token_hash into v_inserted;
  return v_inserted is not null;
end;
$$;
revoke execute on function app_private.consume_turnstile_token(text, integer) from public, anon, authenticated;
grant execute on function app_private.consume_turnstile_token(text, integer) to service_role;
