-- seed.sql — SYNTHETIC DEMO DATA ONLY (every row is labelled "DEMO").
--
-- Used by `supabase db reset` on a LOCAL stack. It is NOT applied by `npm run db:push`
-- (db push never runs the seed unless `--include-seed` is passed — do not pass it for the
-- TARGET without an explicit decision of the project owner). Never run against the SOURCE.
--
-- Uses fake territory ids under the impossible IBGE code 0000001 so they never collide with
-- the real snapshot loaded by scripts/db/load-territories.ts.

insert into public.territories (id, type, name, normalized_name, parent_id, ibge_code, slug, municipality_name,
                                centroid_lon, centroid_lat, data_quality)
values
  ('mg', 'state', 'Minas Gerais', 'minas gerais', null, '31', 'mg', null, -44.38, -18.51, 'demo'),
  ('mg-0000001', 'municipality', 'DEMO Município Exemplo', 'demo municipio exemplo', 'mg', null,
   'demo-municipio-exemplo', 'DEMO Município Exemplo', -43.94, -19.92, 'demo'),
  ('mg-0000001-demo-centro', 'neighborhood', 'DEMO Centro', 'demo centro', 'mg-0000001', null,
   'demo-centro', 'DEMO Município Exemplo', -43.938, -19.918, 'demo')
on conflict (id) do nothing;

-- Synthetic organizer (local stack only; fixed id, unroutable e-mail domain).
insert into auth.users (id, instance_id, aud, role, email, email_confirmed_at, is_anonymous,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-4000-8000-00000000d3e0', '00000000-0000-0000-0000-000000000000', 'authenticated',
        'authenticated', 'demo-organizador@demo.invalid', now(), false,
        '{"provider":"email","providers":["email"]}', '{"demo":true}', now(), now())
on conflict (id) do nothing;

insert into public.whatsapp_groups (id, territory_id, display_name, join_url, status, approved_at)
values ('00000000-0000-4000-8000-00000000d3e1', 'mg-0000001-demo-centro', 'DEMO Grupo do Centro',
        'https://chat.whatsapp.com/DEMOdemoDEMOdemo00', 'active', now())
on conflict (id) do nothing;

insert into public.activities (id, creator_user_id, territory_id, title, type, description, description_sanitized,
                               starts_at, ends_at, public_address, location_lon, location_lat, status,
                               public_contact_opt_in, public_contact_type, public_contact_value)
values ('00000000-0000-4000-8000-00000000d3e2', '00000000-0000-4000-8000-00000000d3e0', 'mg-0000001-demo-centro',
        'DEMO Panfletagem na praça', 'panfletagem',
        'DEMO — atividade fictícia para desenvolvimento local.', 'DEMO — atividade fictícia para desenvolvimento local.',
        now() + interval '7 days', now() + interval '7 days 2 hours', 'DEMO Praça Central',
        -43.938, -19.918, 'published', true, 'instagram', '@demo_exemplo')
on conflict (id) do nothing;
