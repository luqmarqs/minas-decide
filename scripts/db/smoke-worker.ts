/**
 * End-to-end smoke of the Worker API (wrangler dev, APP_ENV=local) against the TARGET dev
 * project and the Clerk DEVELOPMENT instance (ADR 0005). Exercises the real Supabase
 * repository + Clerk gateway with a throw-away Clerk user (`qa-smoke-<tag>@example.org`) and
 * a REAL session token minted through the Backend API, then deletes everything it created
 * (svc_erase_user_data + Clerk deleteUser; sandbox territory cascades groups/proposals).
 *
 *   npx wrangler dev --env local --port 8793           # in another terminal (reads .dev.vars)
 *   npx tsx scripts/db/smoke-worker.ts http://127.0.0.1:8793
 *
 * Covers: Clerk registration (verified e-mail, idempotent, e-mail must match), /me, removed
 * Supabase Auth routes (404), Origin guard (F14), MG/horizon bounds (F09/F12), proposal
 * re-submission after rejection (F11), admin by Clerk id (D35: no MFA), suspension of
 * activities/groups and the audited contact reveal. Uses the Cloudflare TEST Turnstile secret
 * from .dev.vars (always passes). No e-mail is sent by Clerk (users are created server-side).
 */
import { createClient } from '@supabase/supabase-js';
import { createClerkTestUser, deleteClerkTestUser, devClerk } from './clerk-test-users.ts';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

loadDevVars();
const base = (process.argv[2] ?? 'http://127.0.0.1:8793').replace(/\/$/, '');
const url = requireEnv('SUPABASE_TARGET_URL');
assertTargetUrl(url);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), opts);
const tag = Date.now().toString(36);
const clerk = devClerk();
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
  init: { token?: string; body?: unknown; cookie?: string; origin?: string } = {},
): Promise<Res> {
  const headers: Record<string, string> = {};
  if (init.origin) headers.Origin = init.origin;
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
  const cached = await call('GET', '/territories/mg-3140001');
  expectStatus(
    'GET territories/mg-3140001 again (F16 edge cache)',
    cached,
    200,
    `x-cache=${cached.headers.get('x-cache')}`,
  );
  expectStatus(
    'GET territories/mg-3140001/metrics',
    await call('GET', '/territories/mg-3140001/metrics'),
    404,
  );
  const groups = await call('GET', '/groups?territory_id=mg-3140001');
  expectStatus('GET groups', groups, 200, `fallback=${String(groups.json.data?.fallback)}`);
  expectStatus('GET activities', await call('GET', '/activities?territory_id=mg-3140001'), 200);

  // Clerk session (ADR 0005): real dev-instance user + session token (Backend API)
  const email = `qa-smoke-${tag}@example.org`;
  const person = await createClerkTestUser(clerk, email);
  createdUsers.push(person.id);
  const orgToken = () => person.token();

  expectStatus(
    'GET me with an invalid token',
    await call('GET', '/me', { token: 'eyJhbGciOiJSUzI1NiJ9.e30.invalidsignature' }),
    401,
  );
  expectStatus(
    'POST activities before registration (no profile, F01)',
    await call('POST', '/activities', { token: await orgToken(), body: {} }),
    403,
  );
  const reg = await call('POST', '/registrations', {
    token: await orgToken(),
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
    'POST registrations (Clerk session, verified e-mail)',
    reg,
    201,
    `state=${String(reg.json.data?.email_verification_state)} session=${String(reg.json.data?.session_state)}`,
  );
  if (reg.json.data?.email_verification_state !== 'verified') failures++;
  const reuse = await call('POST', '/registrations', {
    token: await orgToken(),
    body: {
      display_name: 'Smoke Teste',
      email,
      phone: '31999990001',
      territory_id: 'mg-3140001',
      terms_accepted: true,
      consent_version: 'v1',
      turnstile_token: `smoke-${tag}-1b`,
    },
  });
  expectStatus('POST registrations re-sent (idempotent)', reuse, 200);
  const otherEmail = await call('POST', '/registrations', {
    token: await orgToken(),
    body: {
      display_name: 'Smoke Teste',
      email: `outra-${tag}@example.org`,
      phone: '31999990001',
      territory_id: 'mg-3140001',
      terms_accepted: true,
      consent_version: 'v1',
      turnstile_token: `smoke-${tag}-1c`,
    },
  });
  expectStatus('POST registrations with another e-mail', otherEmail, 400);
  const me1 = await call('GET', '/me', { token: await orgToken() });
  expectStatus(
    'GET me',
    me1,
    200,
    `verified=${String(me1.json.data?.email_verified)} anon=${String(me1.json.data?.is_anonymous)} review=${String(me1.json.data?.profile_review_required)}`,
  );
  if (me1.json.data?.email_verified !== true || me1.json.data?.is_anonymous !== false) failures++;
  const phone = await call('PATCH', '/me', {
    token: await orgToken(),
    body: { phone: '(31) 99999-0003' },
  });
  expectStatus('PATCH me {phone}', phone, 200, `phone=${String(phone.json.data?.phone_masked)}`);
  for (const path of ['/auth/send-link', '/auth/confirm-email']) {
    expectStatus(
      `POST ${path} (removed, ADR 0005)`,
      await call('POST', path, { token: await orgToken(), body: { email } }),
      404,
    );
  }

  const starts = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const act = await call('POST', '/activities', {
    token: await orgToken(),
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
  const actBase = {
    title: 'SMOKE limites',
    type: 'encontro',
    description: 'x',
    territory_id: 'mg-3140001',
    public_address: 'Praça de teste, 1',
    location_confirmed: true,
    timezone: 'America/Sao_Paulo',
    public_contact_opt_in: false,
  };
  expectStatus(
    'POST activities outside MG (F09)',
    await call('POST', '/activities', {
      token: await orgToken(),
      body: { ...actBase, coordinates: [-38.5, -12.9], starts_at: starts },
    }),
    400,
  );
  expectStatus(
    'POST activities 400 days ahead (F12)',
    await call('POST', '/activities', {
      token: await orgToken(),
      body: {
        ...actBase,
        coordinates: [-43.41, -20.38],
        starts_at: new Date(Date.now() + 400 * 86_400_000).toISOString(),
      },
    }),
    400,
  );
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
  expectStatus(
    'GET my-activities',
    await call('GET', '/my-activities', { token: await orgToken() }),
    200,
  );
  expectStatus(
    'GET admin/queue as organizer (T22)',
    await call('GET', '/admin/queue', { token: await orgToken() }),
    403,
  );

  // admin (D35: admins table + confirmed e-mail, no MFA) approves
  await svc.rpc('svc_grant_admin', { p_user: person.id });
  const approve = await call('POST', `/admin/activities/${actId}/approve`, {
    token: await orgToken(),
  });
  expectStatus('POST admin/activities/:id/approve (admin aal1, D35)', approve, 200);
  const pub = await call('GET', `/activities/${actId}`);
  expectStatus(
    'GET activities/:id after approval',
    pub,
    200,
    `has_creator=${JSON.stringify(pub.json).includes(person.id)}`,
  );
  expectStatus(
    'GET admin/security-events',
    await call('GET', '/admin/security-events', { token: await orgToken() }),
    200,
  );

  expectStatus(
    'POST rsvp with foreign Origin (F14)',
    await call('POST', `/activities/${actId}/rsvp`, { origin: 'https://evil.example' }),
    403,
  );
  const r1 = await call('POST', `/activities/${actId}/rsvp`, {
    origin: 'http://127.0.0.1:5173',
  });
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
    token: await orgToken(),
    body: { version: 2, public_contact_opt_in: false },
  });
  expectStatus(
    'PATCH contact off (T27)',
    patch,
    200,
    `contact=${JSON.stringify(patch.json.data?.contact_public)}`,
  );
  const sens = await call('PATCH', `/activities/${actId}`, {
    token: await orgToken(),
    body: { version: 3, title: 'SMOKE título alterado' },
  });
  expectStatus('PATCH sensitive (T21)', sens, 200, `status=${String(sens.json.data?.status)}`);
  const cancel = await call('POST', `/activities/${actId}/cancel`, {
    token: await orgToken(),
    body: {},
  });
  expectStatus('POST cancel', cancel, 200);

  // suspension of an activity (a cancelled one is still public until suspended)
  expectStatus(
    'POST admin/activities/:id/suspend without reason',
    await call('POST', `/admin/activities/${actId}/suspend`, { token: await orgToken(), body: {} }),
    400,
  );
  expectStatus(
    'POST admin/activities/:id/suspend',
    await call('POST', `/admin/activities/${actId}/suspend`, {
      token: await orgToken(),
      body: { reason: 'smoke suspensão' },
    }),
    200,
  );
  expectStatus('GET activities/:id suspended', await call('GET', `/activities/${actId}`), 404);
  expectStatus(
    'POST rsvp on suspended',
    await call('POST', `/activities/${actId}/rsvp`, { cookie }),
    404,
  );
  const unsA = await call('POST', `/admin/activities/${actId}/unsuspend`, {
    token: await orgToken(),
    body: { reason: 'smoke revisão' },
  });
  expectStatus(
    'POST admin/activities/:id/unsuspend',
    unsA,
    200,
    `status=${String(unsA.json.data?.status)}`,
  );
  // QA2-09 (0011): a cancelled activity goes back to cancelled, not to pending_review
  if (unsA.json.data?.status !== 'cancelled') failures++;

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
  const ap1 = await call('POST', `/admin/groups/${propId}/approve`, { token: await orgToken() });
  const ap2 = await call('POST', `/admin/groups/${propId}/approve`, { token: await orgToken() });
  expectStatus('POST admin/groups/:id/approve', ap1, 200);
  expectStatus('POST admin/groups/:id/approve again (T28)', ap2, 409);
  const gid = String(ap1.json.data?.group_id);
  expectStatus(
    'POST admin/groups/:id/managers',
    await call('POST', `/admin/groups/${gid}/managers`, {
      token: await orgToken(),
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
      token: await orgToken(),
      body: { status: 'inactive', reason: 'smoke cleanup' },
    }),
    200,
  );
  // group suspension: disappears from the public list, then comes back
  expectStatus(
    'PATCH admin/groups/:id back to active',
    await call('PATCH', `/admin/groups/${gid}`, {
      token: await orgToken(),
      body: { status: 'active', reason: 'smoke reativar' },
    }),
    200,
  );
  expectStatus(
    'POST admin/groups/:id/suspend',
    await call('POST', `/admin/groups/${gid}/suspend`, {
      token: await orgToken(),
      body: { reason: 'smoke suspensão' },
    }),
    200,
  );
  const gs = await call('GET', `/groups?territory_id=${sandbox}`);
  const gsLen = (gs.json.data?.items as unknown[] | undefined)?.length;
  expectStatus('GET groups while suspended', gs, 200, `items=${String(gsLen)}`);
  if (gsLen !== 0) failures++;
  expectStatus(
    'POST admin/groups/:id/unsuspend',
    await call('POST', `/admin/groups/${gid}/unsuspend`, {
      token: await orgToken(),
      body: { reason: 'smoke revisão' },
    }),
    200,
  );

  // the queue carries group_id; reveal works with the aal1 admin session (D35), audited
  const qa = await call('GET', '/admin/queue?kind=groups&status=active&limit=50', {
    token: await orgToken(),
  });
  const qItems = (qa.json.data?.items ?? []) as { id: string; group_id: string | null }[];
  const qItem = qItems.find((x) => x.id === propId);
  expectStatus('GET admin/queue (group_id)', qa, 200, `group_id_ok=${qItem?.group_id === gid}`);
  if (qItem?.group_id !== gid) failures++;
  const rev = await call('POST', `/admin/group-proposals/${propId}/reveal-contact`, {
    token: await orgToken(),
    body: { reason: 'smoke validação' },
  });
  const revEmailOk = rev.json.data?.proposer_email === email;
  expectStatus('POST reveal-contact with aal1 (D35)', rev, 200, `email_ok=${revEmailOk}`);
  if (rev.status === 200 && !revEmailOk) failures++;

  // F11: a rejected proposal re-sent with the same content becomes a new pending one
  const pBody = {
    territory_id: sandbox,
    name_proposed: 'SMOKE grupo 2',
    join_url_proposed: `https://chat.whatsapp.com/SMOKE2${tag}abcdef`,
    proposer_name: 'Smoke',
    proposer_email: email,
    proposer_phone: '31999990001',
    responsibility_accepted: true,
    consent_version: 'v1',
  };
  const pr1 = await call('POST', '/groups/proposals', {
    body: { ...pBody, turnstile_token: `smoke-${tag}-4` },
  });
  const pr1Id = String(pr1.json.data?.id);
  await call('POST', `/admin/groups/${pr1Id}/reject`, {
    token: await orgToken(),
    body: { reason: 'smoke rejeição' },
  });
  const pr2 = await call('POST', '/groups/proposals', {
    body: { ...pBody, turnstile_token: `smoke-${tag}-5` },
  });
  expectStatus(
    'POST groups/proposals after rejection (F11)',
    pr2,
    201,
    `new_id=${String(pr2.json.data?.id) !== pr1Id}`,
  );

  // cascades: group, managers and the private proposal
  await svc.from('territories').delete().eq('id', `${sandbox}-centro`);
  await svc.from('territories').delete().eq('id', sandbox);
}

main()
  .catch((e: unknown) => {
    failures++;
    console.error(`smoke: ${e instanceof Error ? e.message : 'failed'}`);
  })
  .finally(async () => {
    for (const id of createdUsers) await deleteClerkTestUser(clerk, svc, id);
    console.log(
      `smoke: ${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}; deleted ${createdUsers.length} user(s)`,
    );
    process.exitCode = failures === 0 ? 0 : 1;
  });
