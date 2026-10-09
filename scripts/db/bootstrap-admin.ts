/**
 * Bootstraps admins on the TARGET dev project: for each e-mail in ADMIN_EMAILS, finds the
 * auth user (or creates it with e-mail already confirmed) and inserts it into
 * app_private.admins via the service-role-only RPC `svc_grant_admin`.
 *
 * Runs ONLY with APP_ENV=local exported in the shell (never in staging/production):
 *   APP_ENV=local npx tsx scripts/db/bootstrap-admin.ts [--dry-run]
 * There is no public endpoint that promotes users. Admin actions still require MFA (aal2 +
 * a VERIFIED TOTP factor, QA2-12) outside APP_ENV=local; the script warns when it is missing.
 */
import { createClient, type User } from '@supabase/supabase-js';
import type { Database } from '../../shared/types/database.ts';
import { maskEmail } from '../../shared/schemas/phone.ts';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

async function findUserByEmail(
  db: ReturnType<typeof createClient<Database>>,
  email: string,
): Promise<User | null> {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed (${error.code ?? error.status ?? 'unknown'})`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
  }
  return null;
}

async function main() {
  if (process.env.APP_ENV !== 'local') {
    throw new Error('Refusing: export APP_ENV=local to run the admin bootstrap (dev only).');
  }
  const dryRun = process.argv.includes('--dry-run');
  loadDevVars();
  const url = requireEnv('SUPABASE_TARGET_URL');
  assertTargetUrl(url);
  const emails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  if (emails.length === 0) throw new Error('ADMIN_EMAILS is empty.');

  const db = createClient<Database>(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const email of emails) {
    let user = await findUserByEmail(db, email);
    console.log(
      `bootstrap-admin: ${maskEmail(email)} -> ${user ? 'existing user' : 'no user yet'}`,
    );
    if (dryRun) continue;
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({ email, email_confirm: true });
      if (error || !data.user) throw new Error(`createUser failed (${error?.code ?? 'unknown'})`);
      user = data.user;
    }
    const { error } = await db.rpc('svc_grant_admin', { p_user: user.id });
    if (error) throw new Error(`svc_grant_admin failed (${error.code ?? 'unknown'})`);
    // QA2-12: outside APP_ENV=local the Worker requires aal2 AND a VERIFIED TOTP factor
    // (checked through the Auth admin API). Report whether this admin already has one.
    const factors = await db.auth.admin.mfa.listFactors({ userId: user.id });
    const hasTotp =
      !factors.error &&
      factors.data.factors.some((f) => f.factor_type === 'totp' && f.status === 'verified');
    console.log(`bootstrap-admin: ${maskEmail(email)} is admin.`);
    if (!hasTotp) {
      console.warn(
        `bootstrap-admin: WARNING ${maskEmail(email)} has NO verified TOTP factor. On the FIRST ` +
          'sign-in the admin must enrol TOTP (authenticator app) and verify it; until then every ' +
          'admin route answers 403 outside APP_ENV=local. Enrol it yourself, from a trusted ' +
          'device, right after the first magic link — whoever enrols first owns the factor.',
      );
    }
  }
  if (dryRun) console.log('bootstrap-admin: --dry-run, nothing written.');
}

main().catch((e: unknown) => {
  console.error(`bootstrap-admin: ${e instanceof Error ? e.message : 'failed'}`);
  process.exit(1);
});
