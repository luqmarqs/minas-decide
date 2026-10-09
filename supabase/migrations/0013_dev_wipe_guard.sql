-- 0013_dev_wipe_guard.sql — TARGET ONLY. QA3-09 (Clerk audit, 2026-10-09).
--
-- What:
--   * Drops public.svc_dev_wipe_identities(text) (created by 0012). It deleted EVERY profile,
--     admin row, activity and session RSVP with no environment guard inside the database, so it
--     would have shipped to every database receiving the migrations, production included.
--   * The dev-only wipe now lives in scripts/db/cleanup-dev-data.ts (`--all`), which refuses to
--     run unless APP_ENV=local, the linked project ref starts with the TARGET prefix (wnclh) and
--     matches SUPABASE_TARGET_URL, and CLERK_SECRET_KEY is a development key. It erases people
--     one by one through public.svc_erase_user_data (audited) plus explicit service-role
--     deletes on public tables.
--   * Idempotent: `drop function if exists`.
--
-- ROLLBACK (manual; dev only): re-create the function exactly as in
--   supabase/migrations/0012_clerk_user_ids.sql (section "Admin-only dev cleanup helper"),
--   then re-run the 0012 privileges loop for it:
--     revoke execute on function public.svc_dev_wipe_identities(text) from public, anon, authenticated;
--     grant execute on function public.svc_dev_wipe_identities(text) to service_role;

drop function if exists public.svc_dev_wipe_identities(text);
