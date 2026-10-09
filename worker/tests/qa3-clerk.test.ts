/**
 * QA-3 (Clerk audit) fixes, route level with fakes: QA3-01 (per-isolate user cache + per-user
 * rate limit on authenticated reads), QA3-02 (GET /me tolerates e-mail sync conflicts; Clerk
 * webhook `user.deleted` with a real Svix signature), QA3-05 (503 on auth outage), QA3-06
 * (suspended accounts are not admins and cannot PATCH /me).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMITS } from '../middleware/rate-limit.ts';
import { USER_CACHE_TTL_MS, UserInfoCache } from '../services/user-cache.ts';
import { CLERK_WEBHOOK_ACTOR } from '../routes/webhooks.ts';
import { body, setup } from './fakes.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

function suspend(repo: ReturnType<typeof setup>['repo'], id: string) {
  const p = repo.profiles.get(id);
  if (!p) throw new Error('no profile');
  p.account_state = 'suspended';
}

async function createProfileFor(s: ReturnType<typeof setup>, id: string, email: string) {
  await s.repo.createProfile({
    user_id: id,
    display_name: 'Pessoa Teste',
    email,
    email_state: 'verified',
    phone: '+5531999990000',
    territory_id: 'mg-3140001',
    consent_version: 'v1',
    contact_opt_in: false,
  });
}

// ---------------------------------------------------------------- QA3-05
describe('QA3-05: auth outage -> 503 SERVICE_UNAVAILABLE, never 401/500', () => {
  it('JWKS/network failure while verifying the token -> 503 + Retry-After, generic body', async () => {
    const s = setup();
    const v = s.users.verified();
    s.auth.verifyOutage = true;
    for (const path of ['/api/v1/me', '/api/v1/my-activities', '/api/v1/admin/queue']) {
      const res = await s.request(path, { token: v.token });
      expect([path, res.status]).toEqual([path, 503]);
      expect(res.headers.get('Retry-After')).toBe('5');
      const b = await body(res);
      expect(b.error?.code).toBe('SERVICE_UNAVAILABLE');
      expect(b.error?.message).toBe('Serviço de autenticação indisponível, tente de novo');
      expect(JSON.stringify(b)).not.toMatch(/stack|jwk|clerk/i);
    }
  });

  it('Backend API throttling/outage (getUser) -> 503 on GET /me', async () => {
    const s = setup();
    const v = s.users.verified();
    s.auth.outage = true;
    const res = await s.request('/api/v1/me', { token: v.token });
    expect(res.status).toBe(503);
    expect((await body(res)).error?.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('control: an invalid token is still 401', async () => {
    const s = setup();
    const res = await s.request('/api/v1/me', { token: 'tok-unknown-padding-padding-padding' });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------- QA3-01
describe('QA3-01: Clerk user cache (60 s, per isolate) + per-user limit on authenticated reads', () => {
  it('GET /me reuses the cached Clerk lookup until the TTL expires', async () => {
    const s = setup();
    const v = s.users.verified();
    s.auth.getUserCalls = 0;
    expect((await s.request('/api/v1/me', { token: v.token })).status).toBe(200);
    expect((await s.request('/api/v1/me', { token: v.token })).status).toBe(200);
    expect((await s.request('/api/v1/my-activities', { token: v.token })).status).toBe(200);
    expect(s.auth.getUserCalls).toBe(1);
    s.advance(USER_CACHE_TTL_MS + 1);
    expect((await s.request('/api/v1/me', { token: v.token })).status).toBe(200);
    expect(s.auth.getUserCalls).toBe(2);
  });

  it('PATCH /me drops the cached lookup', async () => {
    const s = setup();
    const v = s.users.verified();
    s.auth.getUserCalls = 0;
    await s.request('/api/v1/me', { token: v.token });
    const patch = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: v.token,
      json: { display_name: 'Nome Novo' },
    });
    expect(patch.status).toBe(200);
    expect(s.auth.getUserCalls).toBe(1); // PATCH itself was served from the cache...
    await s.request('/api/v1/me', { token: v.token });
    expect(s.auth.getUserCalls).toBe(2); // ...and invalidated it
  });

  it('a ban in Clerk is seen immediately by registration and contact reveal (always fresh)', async () => {
    const s = setup();
    const admin = s.users.admin();
    const id = '00000000-0000-4000-8000-000000000001';
    expect((await s.request('/api/v1/admin/queue', { token: admin.token })).status).toBe(200);
    s.auth.getUserCalls = 0;
    // reveal-contact reads Clerk again even with a warm cache
    const r1 = await s.request(`/api/v1/admin/group-proposals/${id}/reveal-contact`, {
      method: 'POST',
      token: admin.token,
    });
    expect(r1.status).toBe(404); // no such proposal, but past the fresh admin check
    expect(s.auth.getUserCalls).toBe(1);

    s.auth.people.get(admin.user.id)!.banned = true;
    // cached route: still within the 60 s window (documented trade-off)
    expect((await s.request('/api/v1/admin/queue', { token: admin.token })).status).toBe(200);
    const r2 = await s.request(`/api/v1/admin/group-proposals/${id}/reveal-contact`, {
      method: 'POST',
      token: admin.token,
    });
    expect(r2.status).toBe(401);

    const signed = s.users.signedUp();
    await s.request('/api/v1/me', { token: signed.token }); // warms the cache
    s.auth.people.get(signed.user.id)!.banned = true;
    const reg = await s.request('/api/v1/registrations', {
      method: 'POST',
      token: signed.token,
      json: { email: signed.user.email },
    });
    expect(reg.status).toBe(401);
  });

  it('banned user with e-mail claims is refused on reveal-contact (QA3-03)', async () => {
    const s = setup();
    s.repo.admins.add('user_claimadmin01');
    s.auth.add(
      'tok-claim-admin-padding-padding',
      { id: 'user_claimadmin01', email: 'adm@example.org', email_confirmed: true },
      { claims: { email: 'adm@example.org', email_verified: true }, banned: true },
    );
    const q = await s.request('/api/v1/admin/queue', { token: 'tok-claim-admin-padding-padding' });
    expect(q.status).toBe(200); // claims shortcut: token lifetime window
    const r = await s.request(
      '/api/v1/admin/group-proposals/00000000-0000-4000-8000-000000000001/reveal-contact',
      { method: 'POST', token: 'tok-claim-admin-padding-padding' },
    );
    expect(r.status).toBe(401);
  });

  it('GET /me, GET /my-activities and /admin/* are limited per IP + user (429 + Retry-After)', async () => {
    const limit = RATE_LIMITS.account_read.limit;
    for (const [path, kind] of [
      ['/api/v1/me', 'verified'],
      ['/api/v1/my-activities', 'verified'],
      ['/api/v1/admin/queue', 'admin'],
      ['/api/v1/admin/security-events', 'admin'],
    ] as const) {
      const s = setup();
      const who = kind === 'admin' ? s.users.admin() : s.users.verified();
      for (let i = 0; i < limit; i++) {
        const r = await s.request(path, { token: who.token });
        expect([path, i, r.status]).toEqual([path, i, 200]);
      }
      const blocked = await s.request(path, { token: who.token });
      expect([path, blocked.status]).toEqual([path, 429]);
      expect(blocked.headers.get('Retry-After')).toBeTruthy();
      // another user from the same IP is not affected
      const other = kind === 'admin' ? s.users.admin() : s.users.verified();
      expect((await s.request(path, { token: other.token })).status).toBe(200);
    }
  });

  it('a non-admin looping on /admin/* is rate limited before the admin check', async () => {
    const s = setup();
    const v = s.users.verified();
    for (let i = 0; i < RATE_LIMITS.account_read.limit; i++) {
      expect((await s.request('/api/v1/admin/queue', { token: v.token })).status).toBe(403);
    }
    expect((await s.request('/api/v1/admin/queue', { token: v.token })).status).toBe(429);
  });
});

describe('UserInfoCache (LRU + TTL)', () => {
  const info = (id: string) => ({ id, email: null, email_verified: false, banned: false });

  it('expires after the TTL and evicts the least recently used entry', () => {
    const c = new UserInfoCache(1000, 2);
    c.set('user_a', info('user_a'), 0);
    c.set('user_b', info('user_b'), 0);
    expect(c.get('user_a', 10)?.id).toBe('user_a'); // a becomes most recent
    c.set('user_c', info('user_c'), 10); // evicts b
    expect(c.get('user_b', 10)).toBeNull();
    expect(c.get('user_a', 10)?.id).toBe('user_a');
    expect(c.get('user_c', 10)?.id).toBe('user_c');
    expect(c.size).toBe(2);
    expect(c.get('user_a', 1000)).toBeNull(); // expired
    c.invalidate('user_c');
    expect(c.get('user_c', 10)).toBeNull();
  });

  it('never grows past the default maximum (500)', () => {
    const c = new UserInfoCache();
    for (let i = 0; i < 800; i++) c.set(`user_${i}`, info(`user_${i}`), 0);
    expect(c.size).toBe(500);
  });
});

// ---------------------------------------------------------------- QA3-06
describe('QA3-06: suspended accounts', () => {
  it('a suspended profile is never admin (admin routes 403, GET /me is_admin false)', async () => {
    const s = setup();
    const admin = s.users.admin();
    await createProfileFor(s, admin.user.id, admin.user.email!);
    expect((await s.request('/api/v1/admin/queue', { token: admin.token })).status).toBe(200);
    suspend(s.repo, admin.user.id);
    const q = await s.request('/api/v1/admin/queue', { token: admin.token });
    expect(q.status).toBe(403);
    expect((await body(q)).error?.code).toBe('FORBIDDEN');
    const me = (await body(await s.request('/api/v1/me', { token: admin.token }))).data;
    expect(me).toMatchObject({ is_admin: false, account_state: 'suspended' });
  });

  it('PATCH /me of a suspended account -> 403, nothing changed', async () => {
    const s = setup();
    const v = s.users.verified();
    suspend(s.repo, v.user.id);
    const res = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: v.token,
      json: { display_name: 'Outro Nome' },
    });
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe('FORBIDDEN');
    expect(s.repo.profiles.get(v.user.id)?.display_name).toBe('Organizador Teste');
  });
});

// ---------------------------------------------------------------- QA3-02 (a)
describe('QA3-02: GET /me never fails on an e-mail sync conflict', () => {
  it('Clerk e-mail held by another profile -> 200 with email_sync_conflict, profile untouched, warn without PII', async () => {
    const s = setup();
    s.users.verified(undefined, 'ocupado@example.org'); // orphan-like profile
    const v = s.users.verified(undefined, 'minha@example.org');
    s.auth.people.set(v.user.id, {
      id: v.user.id,
      email: 'ocupado@example.org',
      email_verified: true,
      banned: false,
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const res = await s.request('/api/v1/me', { token: v.token });
    expect(res.status).toBe(200);
    const me = (await body(res)).data;
    expect(me?.email_sync_conflict).toBe(true);
    expect(me?.email_masked).toBe('oc***@example.org');
    expect(s.repo.profiles.get(v.user.id)?.email_contact).toBe('minha@example.org');
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0]?.[0]);
    expect(logged).toContain('email_sync_conflict');
    expect(logged).not.toMatch(/@|user_/);
  });

  it('no conflict -> field absent', async () => {
    const s = setup();
    const v = s.users.verified();
    const me = (await body(await s.request('/api/v1/me', { token: v.token }))).data;
    expect(me && 'email_sync_conflict' in me).toBe(false);
  });
});

// ---------------------------------------------------------------- QA3-02 (b) webhook
const SECRET_BYTES = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const SECRET = `whsec_${btoa(String.fromCharCode(...SECRET_BYTES))}`;

async function svixSign(id: string, ts: number, payload: string, secretBytes = SECRET_BYTES) {
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${ts}.${payload}`),
  );
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
}

async function deliver(
  s: ReturnType<typeof setup>,
  event: unknown,
  opts: { ts?: number; secretBytes?: Uint8Array<ArrayBuffer>; omit?: string; raw?: string } = {},
) {
  const payload = opts.raw ?? JSON.stringify(event);
  const id = 'msg_2abcDEF';
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'svix-id': id,
    'svix-timestamp': String(ts),
    'svix-signature': await svixSign(id, ts, payload, opts.secretBytes),
  };
  if (opts.omit) delete headers[opts.omit];
  return s.request('/api/v1/webhooks/clerk', { method: 'POST', headers, body: payload });
}

const userDeleted = (id: string) => ({
  type: 'user.deleted',
  object: 'event',
  data: { id, object: 'user', deleted: true },
  timestamp: Date.now(),
  instance_id: 'ins_test',
});

describe('QA3-02: Clerk webhook (Svix) user.deleted -> erasure', () => {
  it('webhook disabled when the signing secret is not configured -> 404', async () => {
    const s = setup();
    const res = await deliver(s, userDeleted('user_test000001'));
    expect(res.status).toBe(404);
    expect((await body(res)).error?.code).toBe('NOT_FOUND');
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
  });

  it('valid user.deleted -> erases RSVPs/activities/profile/admin row + audit by system actor', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET });
    const v = s.users.verified();
    s.repo.admins.add(v.user.id);
    await s.request('/api/v1/me', { token: v.token }); // warm the cache
    const res = await deliver(s, userDeleted(v.user.id));
    expect(res.status).toBe(200);
    expect((await body(res)).data).toEqual({ handled: true });
    expect(res.headers.get('Cache-Control')).toMatch(/no-store/);
    expect(s.repo.erased).toEqual([v.user.id]);
    expect(s.repo.profiles.has(v.user.id)).toBe(false);
    expect(s.repo.admins.has(v.user.id)).toBe(false);
    expect(
      s.repo.audit.some(
        (a) =>
          a.actor === CLERK_WEBHOOK_ACTOR &&
          a.action === 'user.erase_by_clerk_webhook' &&
          a.entity_id === v.user.id,
      ),
    ).toBe(true);
    expect(s.userCache.get(v.user.id, Date.now())).toBeNull();
    // replay of the same delivery is harmless (idempotent erasure)
    expect((await deliver(s, userDeleted(v.user.id))).status).toBe(200);
  });

  it('the erased e-mail is free again: a new Clerk account with it can register', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET });
    const old = s.users.verified(undefined, 'mesmo@example.org');
    expect((await deliver(s, userDeleted(old.user.id))).status).toBe(200);
    expect(await s.repo.emailInUse('mesmo@example.org', 'user_someoneelse1')).toBe(false);
  });

  it('works while writes are suspended (erasure only)', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET, WRITES_ENABLED: 'false' });
    const v = s.users.verified();
    expect((await deliver(s, userDeleted(v.user.id))).status).toBe(200);
    expect(s.repo.profiles.has(v.user.id)).toBe(false);
  });

  it('unknown event types are acknowledged and ignored', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET });
    const v = s.users.verified();
    const res = await deliver(s, { ...userDeleted(v.user.id), type: 'user.updated' });
    expect(res.status).toBe(200);
    expect((await body(res)).data).toEqual({ handled: false });
    expect(s.repo.profiles.has(v.user.id)).toBe(true);
    expect(s.repo.erased).toEqual([]);
  });

  it('wrong secret, tampered body, missing header or stale timestamp -> 401, nothing erased', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET });
    const v = s.users.verified();
    const wrongKey = new Uint8Array(32).fill(9);
    const cases: Response[] = [
      await deliver(s, userDeleted(v.user.id), { secretBytes: wrongKey }),
      await deliver(s, userDeleted(v.user.id), { omit: 'svix-signature' }),
      await deliver(s, userDeleted(v.user.id), { omit: 'svix-id' }),
      await deliver(s, userDeleted(v.user.id), { ts: Math.floor(Date.now() / 1000) - 3600 }),
    ];
    // tampered: signature computed for one body, another body sent
    const id = 'msg_tamper';
    const ts = Math.floor(Date.now() / 1000);
    cases.push(
      await s.request('/api/v1/webhooks/clerk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'svix-id': id,
          'svix-timestamp': String(ts),
          'svix-signature': await svixSign(id, ts, JSON.stringify(userDeleted('user_other00001'))),
        },
        body: JSON.stringify(userDeleted(v.user.id)),
      }),
    );
    for (const [i, r] of cases.entries()) {
      expect([i, r.status]).toEqual([i, 401]);
      expect((await body(r)).error?.code).toBe('UNAUTHENTICATED');
    }
    expect(s.repo.profiles.has(v.user.id)).toBe(true);
    expect(s.repo.erased).toEqual([]);
  });

  it('signed event with an invalid user id -> 400, nothing erased', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET });
    const res = await deliver(s, userDeleted("user_' or 1=1--"));
    expect(res.status).toBe(400);
    expect(s.repo.erased).toEqual([]);
  });

  it('oversized body -> 400 before any processing', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET });
    const res = await deliver(s, null, { raw: JSON.stringify({ pad: 'x'.repeat(40 * 1024) }) });
    expect(res.status).toBe(400);
    expect(s.repo.erased).toEqual([]);
  });

  it('rate limited per IP -> 429', async () => {
    const s = setup({ CLERK_WEBHOOK_SIGNING_SECRET: SECRET });
    for (let i = 0; i < RATE_LIMITS.webhook_ip.limit; i++) {
      const r = await s.request('/api/v1/webhooks/clerk', { method: 'POST', body: '{}' });
      expect(r.status).toBe(401);
    }
    const r = await s.request('/api/v1/webhooks/clerk', { method: 'POST', body: '{}' });
    expect(r.status).toBe(429);
  });
});
