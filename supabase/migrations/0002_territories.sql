-- 0002_territories.sql — TARGET ONLY.
--
-- ROLLBACK: drop table if exists public.territories cascade;  (cascades to groups/proposals/activities FKs)
--
-- Reference data loaded from the published static snapshot by scripts/db/load-territories.ts
-- (idempotent upsert). Public read-only. Ids: mg | mg-<ibge7> | mg-<ibge7>-<slug>.

create table if not exists public.territories (
  id text primary key
    check (id ~ '^mg(-[0-9]{7})?(-[a-z0-9]+(-[a-z0-9]+)*)?$'),
  type text not null check (type in ('state', 'municipality', 'neighborhood')),
  name text not null check (char_length(name) between 1 and 200),
  normalized_name text not null,
  parent_id text references public.territories (id) on delete restrict,
  state_code char(2) not null default 'MG' check (state_code = 'MG'),
  ibge_code text check (ibge_code is null or ibge_code ~ '^[0-9]{7}$'),
  slug text not null,
  municipality_name text,
  centroid_lon double precision check (centroid_lon is null or centroid_lon between -180 and 180),
  centroid_lat double precision check (centroid_lat is null or centroid_lat between -90 and 90),
  data_quality text not null default 'unavailable'
    check (data_quality in ('complete', 'incomplete', 'estimated', 'approximate', 'unavailable', 'demo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((centroid_lon is null) = (centroid_lat is null))
);

create index if not exists territories_parent_name_idx on public.territories (parent_id, normalized_name);
create index if not exists territories_normalized_name_idx on public.territories (normalized_name text_pattern_ops);
create unique index if not exists territories_municipality_ibge_uidx
  on public.territories (ibge_code) where type = 'municipality';

drop trigger if exists territories_touch on public.territories;
create trigger territories_touch before update on public.territories
  for each row execute function app_private.touch_updated_at();

alter table public.territories enable row level security;

drop policy if exists territories_public_read on public.territories;
create policy territories_public_read on public.territories
  for select to anon, authenticated using (true);

revoke all on table public.territories from anon, authenticated;
grant select on table public.territories to anon, authenticated;
grant all on table public.territories to service_role;
