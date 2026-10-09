-- 0001_extensions_and_schemas.sql — TARGET (minas-em-movimento) ONLY. Never apply to the SOURCE.
--
-- ROLLBACK (manual, dev only; destroys every private table):
--   drop schema if exists app_private cascade;
--   -- pgcrypto is shared by Supabase itself: do NOT drop it.
--
-- Notes:
--   * No PostGIS in the MVP: coordinates are stored as double precision lon/lat pairs
--     with CHECK ranges; bbox queries use btree indexes (see 0005). Revisit if radius
--     queries or polygons become necessary.
--   * `app_private` is NOT exposed by the Data API (config.toml [api] schemas = ["public"]).
--     anon/authenticated get no USAGE on it. The Worker reaches it only through
--     `public.svc_*` functions that are executable by `service_role` exclusively (0007).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app_private;

revoke all on schema app_private from public;
revoke all on schema app_private from anon, authenticated;
grant usage on schema app_private to service_role;

-- Default privileges for objects created later in app_private by the migration role.
alter default privileges in schema app_private revoke all on tables from public, anon, authenticated;
alter default privileges in schema app_private revoke all on sequences from public, anon, authenticated;
alter default privileges in schema app_private revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_private grant all on tables to service_role;
alter default privileges in schema app_private grant all on sequences to service_role;

-- Generic updated_at trigger.
create or replace function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke execute on function app_private.touch_updated_at() from public, anon, authenticated;
