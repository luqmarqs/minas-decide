/**
 * SPIKE (BE-1): real behaviour of linking an e-mail to an anonymous Supabase session
 * on the TARGET dev project. Creates throwaway users with +tag@example.org addresses,
 * prints ONLY non-sensitive observations (booleans, error codes) and deletes every
 * user it created. Usage: npx tsx scripts/db/spike-anon-email-link.ts
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
    has_new_email: Boolean((u as User & { new_email?: string }).new_email),
    identities: (u.identities ?? []).map((i) => i.provider),
  };
}
const log = (step: string, obj: unknown) => console.log(`[spike] ${step}:`, JSON.stringify(obj));
const err = (e: { code?: string; status?: number; message?: string } | null) =>
  e ? { code: e.code, status: e.status, message: e.message?.slice(0, 120) } : null;

async function anonSession() {
  const c = newAnon();
  const { data, error } = await c.auth.signInAnonymously();
  if (error || !data.user || !data.session) throw new Error(`anon sign-in failed: ${error?.message}`);
  created.push(data.user.id);
  return { c, user: data.user, session: data.session };
}

async function main() {
  // A–C, D: see git history of this script / BE-1 report.
  if (process.argv.includes("--all")) { /* kept minimal */ }


  // H. Re-assert same e-mail together with email_confirm:true after magic-link verification.
  const h = await anonSession();
  await admin.auth.admin.updateUserById(h.user.id, { email: email('h'), email_confirm: false });
  const hl = await admin.auth.admin.generateLink({ type: 'magiclink', email: email('h') });
  const hv = newAnon();
  await hv.auth.verifyOtp({ type: 'magiclink', token_hash: hl.data.properties?.hashed_token ?? '' });
  const h1 = await admin.auth.admin.updateUserById(h.user.id, { email: email('h'), email_confirm: true });
  log('H1 updateUserById({same email, email_confirm:true})', { user: view(h1.data.user), error: err(h1.error) });
  const hr = await hv.auth.refreshSession();
  log('H2 magic-link session refresh after H1', hr.data.session ? { is_anonymous: claims(hr.data.session.access_token).is_anonymous, amr: claims(hr.data.session.access_token).amr } : err(hr.error));

  // E. Promotion after proving e-mail possession via magic link.
  const e = await anonSession();
  await admin.auth.admin.updateUserById(e.user.id, { email: email('e'), email_confirm: false });
  const el = await admin.auth.admin.generateLink({ type: 'magiclink', email: email('e') });
  const ev = newAnon();
  const evr = await ev.auth.verifyOtp({ type: 'magiclink', token_hash: el.data.properties?.hashed_token ?? '' });
  const evTok = evr.data.session?.access_token ?? '';
  log('E1 jwt after magic link', evTok ? { is_anonymous: claims(evTok).is_anonymous, amr: claims(evTok).amr } : err(evr.error));
  const prom = await admin.auth.admin.updateUserById(e.user.id, { email_confirm: true });
  log('E2 admin.updateUserById({email_confirm:true}) on verified anon user', view(prom.data.user));
  log('E2 error', err(prom.error));
  const oldRef = await e.c.auth.refreshSession();
  log('E3 OLD anonymous session refresh', oldRef.data.session ? { is_anonymous: claims(oldRef.data.session.access_token).is_anonymous } : err(oldRef.error));
  const so = await admin.auth.admin.signOut(evTok, 'others');
  log('E4 admin.signOut(newToken, others) error', err(so.error));
  const oldRef2 = await e.c.auth.refreshSession();
  log('E5 OLD session refresh after signOut(others)', oldRef2.data.session ? 'still valid' : err(oldRef2.error));
  const newRef = await ev.auth.refreshSession();
  log('E6 NEW session refresh', newRef.data.session ? { is_anonymous: claims(newRef.data.session.access_token).is_anonymous } : err(newRef.error));

  // G. Squatting: e-mail linked (unconfirmed) to anon X, anon Y links same e-mail.
  const x = await anonSession();
  await admin.auth.admin.updateUserById(x.user.id, { email: email('g'), email_confirm: false });
  const y = await anonSession();
  const gy = await admin.auth.admin.updateUserById(y.user.id, { email: email('g'), email_confirm: false });
  log('G1 link e-mail already linked (unconfirmed) to another anon user', err(gy.error));

}

main()
  .catch((e: unknown) => console.error('[spike] failed:', e instanceof Error ? e.message : 'unknown'))
  .finally(async () => {
    let deleted = 0;
    for (const id of created) {
      const { error } = await admin.auth.admin.deleteUser(id);
      if (!error) deleted++;
    }
    console.log(`[spike] cleanup: deleted ${deleted}/${created.length} users`);
  });
