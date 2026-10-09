-- 0008_territories_ibge_state_code.sql — TARGET ONLY.
--
-- The state row ("mg") carries the 2-digit IBGE UF code ("31"); municipalities carry the
-- 7-digit code. 0002 only accepted 7 digits, which rejected the published snapshot.
--
-- ROLLBACK:
--   alter table public.territories drop constraint if exists territories_ibge_code_check;
--   alter table public.territories add constraint territories_ibge_code_check
--     check (ibge_code is null or ibge_code ~ '^[0-9]{7}$');

alter table public.territories drop constraint if exists territories_ibge_code_check;
alter table public.territories add constraint territories_ibge_code_check
  check (
    ibge_code is null
    or (type = 'state' and ibge_code ~ '^[0-9]{2}$')
    or (type <> 'state' and ibge_code ~ '^[0-9]{7}$')
  );
