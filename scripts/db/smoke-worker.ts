/**
 * End-to-end smoke of the Worker API (wrangler dev, APP_ENV=local) against the TARGET dev
 * project. Exercises the real Supabase repository + Auth gateway, then deletes everything
 * it created (users cascade profiles/admins/activities/rsvps).
 *
 *   npx wrangler dev --env local --port 8799           # in another terminal (reads .dev.vars)
 *   npx tsx scripts/db/smoke-worker.ts http://127.0.0.1:8799
 *
 * Uses the Cloudflare TEST Turnstile secret from .dev.vars (always passes) and +tag@example.org
 * addresses (Auth refuses to deliver to them, so the magic link click is simulated with
 * admin.generateLink + verifyOtp; no e-mail is sent).
 */
import { createClient } from '@supabase/supabase-js';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

loadDevVars();
const base = (process.argv[2] ?? 'http://127.0.0.1:8799').replace(/\/$/, '');
const url = requireEnv('SUPABASE_TARGET_URL');
assertTargetUrl(url);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), opts);
const tag = Date.now().toString(36);
const createdUsers: string[] = [];
let failures = 0;

type Res = {
  status: number;
  json: { data?: Record<string, unknown>; error?: { code: string } };
  headers: Headers;
};

async function call(
  method: string,
  path: string,
  init: { token?: string; body?: unknown; cookie?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = {};
  if (init.token) headers.Authorization = `Bearer ${init.token}`;
  if (init.body !== undefined) headers['Content-Type'] = 'application/json';
  if (init.cookie) headers.Cookie = init.cookie;
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, json: (await res.json()) as Res['json'], headers: res.headers };
}

function expectStatus(label: string, res: Res, expected: number, extra = ''): void {
  const ok = res.status === expected;
  if (!ok) failures++;
  const detail = res.json.error?.code ?? '';
  console.log(
    `${ok ? 'PASS' : 'FAIL'} ${label}: ${res.status}${detail ? ` ${detail}` : ''}${extra ? ` ${extra}` : ''}`,
  );
}

async function main() {
  expectStatus('GET health', await call('GET', '/health'), 200);
  const search = await call('GET', '/territories/search?q=mariana');
  expectStatus(
    'GET territories/search?q=mariana',
    search,
    200,
    `items=${(search.json.data?.items as unknown[] | undefined)?.length}`,
  );
  expectStatus('GET territories/mg-3140001', await call('GET', '/territories/mg-3140001'), 200);
  expectStatus(
    'GET territories/mg-3140001/metrics',
    await call('GET', '/territories/mg-3140001/metrics'),
    404,
  );
  const groups = await call('GET', '/groups?territory_id=mg-3140001');
  expectStatus('GET groups', groups, 200, `fallback=${String(groups.json.data?.fallback)}`);
  expectStatus('GET activities', await call('GET', '/activities?territory_id=mg-3140001'), 200);

  // provisional session + registration
  const anon = createClient(url, requireEnv('SUPABASE_TARGET_ANON_KEY'), opts);
  const { data: s } = await anon.auth.signInAnonymously();
  if (!s.session || !s.user) throw new Error('anonymous sign-in failed');
  createdUsers.push(s.user.id);
  const email = `mm-smoke+${tag}@example.org`;
  const reg = await call('POST', '/registrations', {
    token: s.session.access_token,
    body: {
      display_name: 'Smoke Teste',
      email,
      phone: '(31) 99999-0001',
      territory_id: 'mg-3140001',
      terms_accepted: true,
      contact_opt_in: false,
      consent_version: 'v1',
      turnstile_token: `smoke-${tag}-1`,
    },
  });
  expectStatus(
    'POST registrations',
    reg,
    201,
    `state=${String(reg.json.data?.email_verification_state)}`,
  );
  const reuse = await call('POST', '/registrations', {
    token: s.session.access_token,
    body: {
      display_name: 'Smoke Teste',
      email,
      phone: '31999990001',
      territory_id: 'mg-3140001',
      terms_accepted: true,
      consent_version: 'v1',
      turnstile_token: `smoke-${tag}-1`,
    },
  });
  expectStatus('POST registrations reusing Turnstile token (T17)', reuse, 400);
  expectStatus(
    'POST activities as provisional (T06)',
    await call('POST', '/activities', { token: s.session.access_token, body: {} }),
    403,
  );
  const me1 = await call('GET', '/me', { token: s.session.access_token });
  expectStatus(
    'GET me (provisional)',
    me1,
    200,
    `is_anonymous=${String(me1.json.data?.is_anonymous)}`,
  );

  // simulate the magic-link click, then promote
  const link = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  const device = createClient(url, requireEnv('SUPABASE_TARGET_ANON_KEY'), opts);
  const ver = await device.auth.verifyOtp({
    type: 'magiclink',
    token_hash: link.data.properties?.hashed_token ?? '',
  });
  if (!ver.data.session) throw new Error('magic link verify failed');
  const conf = await call('POST', '/auth/confirm-email', { token: ver.data.session.access_token });
  expectStatus(
    'POST auth/confirm-email',
    conf,
    200,
    `is_anonymous=${String(conf.json.data?.is_anonymous)}`,
  );
  const old = await anon.auth.refreshSession();
  console.log(
    `${old.error ? 'PASS' : 'FAIL'} original provisional session revoked after promotion`,
  );
  if (!old.error) failures++;
  const refreshed = await device.auth.refreshSession();
  const orgToken = refreshed.data.session?.access_token ?? '';

  const starts = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const act = await call('POST', '/activities', {
    token: orgToken,
    body: {
      title: 'SMOKE encontro de teste',
      type: 'encontro',
      description: 'Teste <script>x</script> automatizado.',
      territory_id: 'mg-3140001',
      public_address: 'Praça de teste, 1',
      coordinates: [-43.41, -20.38],
      location_confirmed: true,
      starts_at: starts,
      timezone: 'America/Sao_Paulo',
      public_contact_opt_in: true,
      public_contact_type: 'instagram',
      public_contact_value: 'smoke_teste',
    },
  });
  expectStatus(
    'POST activities (verified organizer)',
    act,
    201,
    `status=${String(act.json.data?.status)}`,
  );
  const actId = String(act.json.data?.id);
  expectStatus(
    'GET activities/:id while pending (T07)',
    await call('GET', `/activities/${actId}`),
    404,
  );
  expectStatus('GET my-activities', await call('GET', '/my-activities', { token: orgToken }), 200);
  expectStatus(
    'GET admin/queue as organizer (T22)',
    await call('GET', '/admin/queue', { token: orgToken }),
    403,
  );

  // admin (local MFA bypass) approves
  await svc.rpc('svc_grant_admin', { p_user: s.user.id });
  const approve = await call('POST', `/admin/activities/${actId}/approve`, { token: orgToken });
  expectStatus('POST admin/activities/:id/approve (ADMIN_MFA_BYPASS_LOCAL)', approve, 200);
  const pub = await call('GET', `/activities/${actId}`);
  expectStatus(
    'GET activities/:id after approval',
    pub,
    200,
    `has_creator=${JSON.stringify(pub.json).includes(s.user.id)}`,
  );
  expectStatus(
    'GET admin/security-events',
    await call('GET', '/admin/security-events', { token: orgToken }),
    200,
  );

  const r1 = await call('POST', `/activities/${actId}/rsvp`);
  const cookie = (r1.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
  expectStatus('POST rsvp (new device)', r1, 200);
  const r2 = await call('POST', `/activities/${actId}/rsvp`, { cookie });
  expectStatus(
    'POST rsvp again (T09)',
    r2,
    200,
    `count=${String(r2.json.data?.rsvp_count_approx)}`,
  );
  const r3 = await call('DELETE', `/activities/${actId}/rsvp`, {
    cookie: 'mm_device=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  });
  expectStatus('DELETE rsvp with another device (T11)', r3, 404);
  const r4 = await call('DELETE', `/activities/${actId}/rsvp`, { cookie });
  expectStatus(
    'DELETE rsvp own (T10)',
    r4,
    200,
    `count=${String(r4.json.data?.rsvp_count_approx)}`,
  );

  const patch = await call('PATCH', `/activities/${actId}`, {
    token: orgToken,
    body: { version: 2, public_contact_opt_in: false },
  });
  expectStatus(
    'PATCH contact off (T27)',
    patch,
    200,
    `contact=${JSON.stringify(patch.json.data?.contact_public)}`,
  );
  const sens = await call('PATCH', `/activities/${actId}`, {
    token: orgToken,
    body: { version: 3, title: 'SMOKE título alterado' },
  });
  expectStatus('PATCH sensitive (T21)', sens, 200, `status=${String(sens.json.data?.status)}`);
  const cancel = await call('POST', `/activities/${actId}/cancel`, { token: orgToken, body: {} });
  expectStatus('POST cancel', cancel, 200);

  // sandbox territory (impossible IBGE code) so the private proposal can be removed by cascade
  const sandbox = `mg-98${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  await svc.from('territories').insert([
    {
      id: sandbox,
      type: 'municipality',
      name: 'SMOKE',
      normalized_name: 'smoke',
      slug: sandbox,
      data_quality: 'demo',
    },
    {
      id: `${sandbox}-centro`,
      type: 'neighborhood',
      name: 'SMOKE Centro',
      normalized_name: 'smoke centro',
      slug: 'centro',
      parent_id: sandbox,
      data_quality: 'demo',
    },
  ]);
  const prop = await call('POST', '/groups/proposals', {
    body: {
      territory_id: sandbox,
      name_proposed: 'SMOKE grupo',
      join_url_proposed: `https://chat.whatsapp.com/SMOKE${tag}abcdef`,
      proposer_name: 'Smoke',
      proposer_email: email,
      proposer_phone: '31999990001',
      responsibility_accepted: true,
      consent_version: 'v1',
      turnstile_token: `smoke-${tag}-2`,
    },
  });
  expectStatus('POST groups/proposals', prop, 201);
  const propId = String(prop.json.data?.id);
  const ap1 = await call('POST', `/admin/groups/${propId}/approve`, { token: orgToken });
  const ap2 = await call('POST', `/admin/groups/${propId}/approve`, { token: orgToken });
  expectStatus('POST admin/groups/:id/approve', ap1, 200);
  expectStatus('POST admin/groups/:id/approve again (T28)', ap2, 409);
  const gid = String(ap1.json.data?.group_id);
  expectStatus(
    'POST admin/groups/:id/managers',
    await call('POST', `/admin/groups/${gid}/managers`, {
      token: orgToken,
      body: { name: 'Resp Smoke', phone: '31999990002' },
    }),
    201,
  );
  const g2 = await call('GET', `/groups?territory_id=${sandbox}-centro`);
  expectStatus(
    'GET groups (fallback after approval)',
    g2,
    200,
    `fallback=${String(g2.json.data?.fallback)} leaks=${JSON.stringify(g2.json).includes('Resp Smoke') || JSON.stringify(g2.json).includes(email)}`,
  );
  expectStatus(
    'PATCH admin/groups/:id',
    await call('PATCH', `/admin/groups/${gid}`, {
      token: orgToken,
      body: { status: 'inactive', reason: 'smoke cleanup' },
    }),
    200,
  );
  // cascades: group, managers and the private proposal
  await svc.from('territories').delete().eq('id', `${sandbox}-centro`);
  await svc.from('territories').delete().eq('id', sandbox);

  expectStatus(
    'POST auth/send-link (neutral)',
    await call('POST', '/auth/send-link', { body: { email, turnstile_token: `smoke-${tag}-3` } }),
    202,
  );
}

main()
  .catch((e: unknown) => {
    failures++;
    console.error(`smoke: ${e instanceof Error ? e.message : 'failed'}`);
  })
  .finally(async () => {
    for (const id of createdUsers) await svc.auth.admin.deleteUser(id);
    console.log(
      `smoke: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}; deleted ${createdUsers.length} user(s)`,
    );
    process.exitCode = failures === 0 ? 0 : 1;
  });
