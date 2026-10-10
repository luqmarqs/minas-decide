-- 0015_admin_metrics.sql — TARGET ONLY. Metrics panel of /admin (owner request).
--
-- What:
--   * public.svc_admin_metrics(p_days int default 30) -> jsonb with AGGREGATES ONLY (no PII, no ids
--     of people): profiles {total,last_7d,last_30d,by_day}, activities {by_status,upcoming_published},
--     rsvps {total,last_7d}, groups {active,suspended,pending_proposals}, admins {total},
--     top_territories (10 by registrations, name from public.territories).
--   * p_days is clamped to 1..365; by_day covers the last p_days calendar days in America/Sao_Paulo,
--     days without registrations are returned with count 0.
--   * rsvps count only status = 'going' (intention, not attendance).
--   * Same privilege pattern as the other svc_*: SET search_path = '', REVOKE from
--     public/anon/authenticated, GRANT to service_role. Only the Worker (requireFreshAdmin) calls it.
--   * Read-only; idempotent (`create or replace`).
--
-- ROLLBACK (manual):
--   drop function if exists public.svc_admin_metrics(integer);

create or replace function public.svc_admin_metrics(p_days integer default 30)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_first date := v_today - (v_days - 1);
  v_result jsonb;
begin
  select jsonb_build_object(
    'profiles', jsonb_build_object(
      'total', (select count(*) from app_private.profiles),
      'last_7d', (select count(*) from app_private.profiles
                  where created_at >= now() - interval '7 days'),
      'last_30d', (select count(*) from app_private.profiles
                   where created_at >= now() - interval '30 days'),
      'by_day', (
        select coalesce(jsonb_agg(jsonb_build_object('day', to_char(d.day, 'YYYY-MM-DD'), 'count', coalesce(c.n, 0))
                                  order by d.day), '[]'::jsonb)
        from (select v_first + g as day from generate_series(0, v_days - 1) as g) d
        left join (
          select (p.created_at at time zone 'America/Sao_Paulo')::date as day, count(*) as n
          from app_private.profiles p
          where (p.created_at at time zone 'America/Sao_Paulo')::date >= v_first
          group by 1
        ) c on c.day = d.day
      )
    ),
    'activities', jsonb_build_object(
      'by_status', (
        select coalesce(jsonb_object_agg(s.status, coalesce(c.n, 0)), '{}'::jsonb)
        from unnest(array['draft', 'pending_review', 'published', 'rejected', 'cancelled',
                          'archived', 'suspended']) as s(status)
        left join (select a.status, count(*) as n from public.activities a group by a.status) c
          on c.status = s.status
      ),
      'upcoming_published', (select count(*) from public.activities
                             where status = 'published' and starts_at > now())
    ),
    'rsvps', jsonb_build_object(
      'total', (select count(*) from app_private.activity_rsvps where status = 'going'),
      'last_7d', (select count(*) from app_private.activity_rsvps
                  where status = 'going' and created_at >= now() - interval '7 days')
    ),
    'groups', jsonb_build_object(
      'active', (select count(*) from public.whatsapp_groups where status = 'active'),
      'suspended', (select count(*) from public.whatsapp_groups where status = 'suspended'),
      'pending_proposals', (select count(*) from app_private.group_proposals where status = 'pending')
    ),
    'admins', jsonb_build_object('total', (select count(*) from app_private.admins)),
    'top_territories', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'territory_id', t.territory_id, 'name', t.name, 'registrations', t.n)
             order by t.n desc, t.territory_id), '[]'::jsonb)
      from (
        select tr.id as territory_id, tr.name, count(*) as n
        from app_private.profiles p
        join public.territories tr on tr.id = p.selected_territory_id
        group by tr.id, tr.name
        order by count(*) desc, tr.id
        limit 10
      ) t
    )
  ) into v_result;
  return v_result;
end;
$$;

revoke execute on function public.svc_admin_metrics(integer) from public, anon, authenticated;
grant execute on function public.svc_admin_metrics(integer) to service_role;
