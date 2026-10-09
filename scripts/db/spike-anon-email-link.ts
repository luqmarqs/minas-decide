/**
 * SPIKE (BE-1): real behaviour of linking an e-mail to an anonymous Supabase session on the
 * TARGET dev project. Creates throwaway users with +tag@example.org addresses, prints ONLY
 * non-sensitive observations (booleans, error codes) and deletes every user it created.
 *
 *   npx tsx scripts/db/spike-anon-email-link.ts            # phases A, B, C, E, G, H (no e-mail is delivered)
 *   npx tsx scripts/db/spike-anon-email-link.ts --client   # + phase D (client updateUser; asks Auth to send an e-mail)
 *
 * Results observed on 2026-10-08 are recorded in docs/SECURITY.md (§ Auth spike).
 */
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

loadDevVars();
const url = requireEnv('SUPABASE_TARGET_URL');
assertTargetUrl(url);
const anonKey = requireEnv('SUPABASE_TARGET_ANON_KEY');
const serviceKey = requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, opts);
const newAnon = (): SupabaseClient => createClient(url, anonKey, opts);
const created: string[] = [];
const tag = Date.now().toString(36);
const email = (n: string) => `mm-spike-${n}+${tag}@example.org`;
const REDIRECT = 'http://127.0.0.1:5173/autenticacao/retorno';

function claims(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
}
function view(u: User | null | undefined) {
  if (!u) return null;
  return {
    is_anonymous: u.is_anonymous,
    has_email: Boolean(u.email),
    email_confirmed: Boolean(u.email_confirmed_at),
    identities: (u.identities ?? []).map((i) => i.provider),
  };
}
const log = (step: string, obj: unknown) => console.log(`[spike] ${step}:`, JSON.stringify(obj));
const err = (e: { code?: string; status?: number; message?: string } | null) =>
  e
    ? {
        code: e.code,
        status: e.status,
        message: e.message?.replace(/"[^"]*@[^"]*"/g, '"<email>"').slice(0, 120),
      }
    : null;

async function anonSession() {
  const c = newAnon();
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user || !data.session) throw new Error(`anon sign-in failed: ${error?.code}`);
  created.push(data.user.id);
  return { c, user: data.user, session: data.session };
}

async function magicLinkSession(addr: string) {
  const link = await admin.auth.admin.generateLink({ type: 'magiclink', email: addr });
  const c = newAnon();
  const ver = await c.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties?.hashed_token ?? '',
  });
  return { c, ver, linkError: link.error };
}

async function main() {
  // A. Admin-side linking (what POST /registrations does).
  const a = await anonSession();
  log('A1 anon sign-in', {
    user: view(a.user),
    jwt_is_anonymous: claims(a.session.access_token).is_anonymous,
    aal: claims(a.session.access_token).aal,
  });
  const upd = await admin.auth.admin.updateUserById(a.user.id, {
    email: email('a'),
    email_confirm: false,
  });
  log('A2 admin.updateUserById(email, email_confirm:false)', {
    user: view(upd.data.user),
    error: err(upd.error),
  });
  const ref = await a.c.auth.refreshSession();
  log(
    'A3 refreshed anon JWT',
    ref.data.session
      ? { is_anonymous: claims(ref.data.session.access_token).is_anonymous }
      : err(ref.error),
  );
  const otp = await newAnon().auth.signInWithOtp({
    email: email('a'),
    options: { shouldCreateUser: false, emailRedirectTo: REDIRECT },
  });
  log('A4 signInWithOtp(shouldCreateUser:false) to @example.org', err(otp.error));
  const a5 = await magicLinkSession(email('a'));
  log('A5 magic link verified (generateLink+verifyOtp, no e-mail sent)', {
    user: view(a5.ver.data.user),
    error: err(a5.ver.error),
    jwt: a5.ver.data.session
      ? {
          is_anonymous: claims(a5.ver.data.session.access_token).is_anonymous,
          same_user: claims(a5.ver.data.session.access_token).sub === a.user.id,
          amr: claims(a5.ver.data.session.access_token).amr,
        }
      : null,
  });

  // B. E-mail already owned by a CONFIRMED account.
  const owner = await admin.auth.admin.createUser({ email: email('owner'), email_confirm: true });
  if (owner.data.user) created.push(owner.data.user.id);
  const b = await anonSession();
  const conflict = await admin.auth.admin.updateUserById(b.user.id, {
    email: email('owner'),
    email_confirm: false,
  });
  log('B1 link e-mail owned by confirmed account', err(conflict.error));

  // C. Admin update WITH email_confirm:true in the same call.
  const c = await anonSession();
  const confirmed = await admin.auth.admin.updateUserById(c.user.id, {
    email: email('c'),
    email_confirm: true,
  });
  log('C1 admin.updateUserById(email, email_confirm:true)', view(confirmed.data.user));

  // E. email_confirm:true ALONE after magic-link verification; then session revocation.
  const e = await anonSession();
  await admin.auth.admin.updateUserById(e.user.id, { email: email('e'), email_confirm: false });
  const e1 = await magicLinkSession(email('e'));
  const eTok = e1.ver.data.session?.access_token ?? '';
  const e2 = await admin.auth.admin.updateUserById(e.user.id, { email_confirm: true });
  log('E2 admin.updateUserById({email_confirm:true}) only', view(e2.data.user));
  const so = await admin.auth.admin.signOut(eTok, 'others');
  log('E4 admin.signOut(magicLinkToken, "others")', err(so.error));
  const old = await e.c.auth.refreshSession();
  log(
    'E5 ORIGINAL anonymous session refresh after signOut(others)',
    old.data.session ? 'still valid' : err(old.error),
  );

  // G. E-mail linked (unconfirmed) to anon X; anon Y links the same e-mail.
  const x = await anonSession();
  await admin.auth.admin.updateUserById(x.user.id, { email: email('g'), email_confirm: false });
  const y = await anonSession();
  const gy = await admin.auth.admin.updateUserById(y.user.id, {
    email: email('g'),
    email_confirm: false,
  });
  log('G1 link e-mail already linked (unconfirmed) to another anon user', err(gy.error));

  // H. Re-set SAME e-mail with email_confirm:true after magic-link verification (what /auth/confirm-email does).
  const h = await anonSession();
  await admin.auth.admin.updateUserById(h.user.id, { email: email('h'), email_confirm: false });
  const h1 = await magicLinkSession(email('h'));
  const h2 = await admin.auth.admin.updateUserById(h.user.id, {
    email: email('h'),
    email_confirm: true,
  });
  log('H1 updateUserById({same email, email_confirm:true})', {
    user: view(h2.data.user),
    error: err(h2.error),
  });
  const hr = await h1.c.auth.refreshSession();
  log(
    'H2 magic-link session refreshed',
    hr.data.session
      ? { is_anonymous: claims(hr.data.session.access_token).is_anonymous }
      : err(hr.error),
  );

  if (process.argv.includes('--client')) {
    // D. Official client flow: updateUser({email}) from the anonymous session (sends an e-mail).
    const d = await anonSession();
    const du = await d.c.auth.updateUser({ email: email('d') }, { emailRedirectTo: REDIRECT });
    log('D1 client updateUser({email})', { user: view(du.data.user), error: err(du.error) });
  }
}

main()
  .catch((e: unknown) =>
    console.error('[spike] failed:', e instanceof Error ? e.message : 'unknown'),
  )
  .finally(async () => {
    let deleted = 0;
    for (const id of created) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (!error) deleted++;
    }
    console.log(`[spike] cleanup: deleted ${deleted}/${created.length} users`);
  });
