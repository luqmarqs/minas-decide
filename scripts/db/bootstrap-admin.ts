/**
 * Bootstraps admins on the TARGET dev project (ADR 0005 — identity = Clerk): for each e-mail
 * in ADMIN_EMAILS, finds the Clerk user by e-mail (Backend API `users.getUserList`), creating
 * it when missing (`users.createUser`; addresses created through the Backend API are marked
 * verified by Clerk — observed in the dev instance), and inserts its Clerk id into
 * app_private.admins via the service-role-only RPC `svc_grant_admin`.
 *
 * Runs ONLY with APP_ENV=local exported in the shell (never in staging/production) and only with
 * a development Clerk key (`sk_test_…`):
 *   APP_ENV=local npx tsx scripts/db/bootstrap-admin.ts [--dry-run] [--only=<email>]
 * There is no public endpoint that promotes users. MFA is optional (D35): an admin is a Clerk
 * account with a verified primary e-mail whose id is listed in app_private.admins.
 * Output never contains full e-mails or ids.
 */
import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../shared/types/database.ts';
import { maskEmail } from '../../shared/schemas/phone.ts';
import { ClerkAuthGateway } from '../../worker/repositories/clerk.ts';
import type { Env } from '../../worker/env.ts';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

const maskId = (id: string) => `${id.slice(0, 7)}…`;

async function main() {
  if (process.env.APP_ENV !== 'local') {
    throw new Error('Refusing: export APP_ENV=local to run the admin bootstrap (dev only).');
  }
  const dryRun = process.argv.includes('--dry-run');
  // `--production`: bootstrap admins of the Clerk *live* instance (sk_live_ key exported in the
  // shell, never read from .dev.vars). Requires the explicit opt-in env below. The database is
  // still the TARGET (production uses the same project — owner decision, D40).
  const production = process.argv.includes('--production');
  if (production && process.env.ALLOW_PRODUCTION_CLERK_BOOTSTRAP !== '1') {
    throw new Error('Refusing: --production needs ALLOW_PRODUCTION_CLERK_BOOTSTRAP=1 exported.');
  }
  const liveKeyFromShell = production ? process.env.CLERK_SECRET_KEY : undefined;
  loadDevVars();
  const url = requireEnv('SUPABASE_TARGET_URL');
  assertTargetUrl(url);
  const clerkKey = production ? (liveKeyFromShell ?? '') : requireEnv('CLERK_SECRET_KEY');
  if (!production && !clerkKey.startsWith('sk_test_')) {
    throw new Error('Refusing: CLERK_SECRET_KEY is not a development (sk_test_) key.');
  }
  if (production && !clerkKey.startsWith('sk_live_')) {
    throw new Error(
      'Refusing: --production needs a live (sk_live_) CLERK_SECRET_KEY in the shell.',
    );
  }
  const emails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
  // optional `--only=<email>`: bootstrap just one of the ADMIN_EMAILS entries
  const only = process.argv
    .find((a) => a.startsWith('--only='))
    ?.slice('--only='.length)
    .trim()
    .toLowerCase();
  if (only && !emails.includes(only)) throw new Error('--only must be one of ADMIN_EMAILS.');
  if (only) emails.splice(0, emails.length, only);
  if (emails.length === 0) throw new Error('ADMIN_EMAILS is empty.');

  const db = createClient<Database>(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const gateway = new ClerkAuthGateway({ APP_ENV: 'local', CLERK_SECRET_KEY: clerkKey } as Env);
  const clerk = createClerkClient({ secretKey: clerkKey });

  for (const email of emails) {
    let user = await gateway.findUserByEmail(email);
    console.log(
      `bootstrap-admin: ${maskEmail(email)} -> ${user ? `Clerk user ${maskId(user.id)}` : 'no Clerk user yet'}`,
    );
    if (dryRun) continue;
    if (!user) {
      const created = await clerk.users.createUser({
        emailAddress: [email],
        skipPasswordRequirement: true,
      });
      user = await gateway.getUser(created.id);
      if (!user) throw new Error('createUser: user not readable after creation');
      console.log(`bootstrap-admin: created Clerk user ${maskId(user.id)}`);
    }
    if (!user.email_verified || user.email !== email) {
      throw new Error(`${maskEmail(email)}: primary e-mail is not verified in Clerk; refusing.`);
    }
    const { error } = await db.rpc('svc_grant_admin', { p_user: user.id });
    if (error) throw new Error(`svc_grant_admin failed (${error.code ?? 'unknown'})`);
    const check = await db.rpc('svc_is_admin', { p_user: user.id });
    console.log(`bootstrap-admin: ${maskEmail(email)} is admin = ${String(check.data)}.`);
    console.log(
      'bootstrap-admin: note — MFA opcional (D35); proteja a conta de e-mail deste admin.',
    );
  }
  if (dryRun) console.log('bootstrap-admin: --dry-run, nothing written.');
}

main().catch((e: unknown) => {
  console.error(`bootstrap-admin: ${e instanceof Error ? e.message : 'failed'}`);
  process.exit(1);
});
