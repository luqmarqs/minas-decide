/**
 * QA-1 (qa-security) — adversarial tests written by an independent auditor.
 *
 * Convention:
 *   - `it(...)`        = control verified OK (must keep passing).
 *   - `it.fails(...)`  = FINDING. The assertion encodes the SECURE expectation and currently
 *                        fails, so the test is green. When the finding is fixed, the test
 *                        starts failing: remove `.fails` and keep it as a regression test.
 */
import { describe, expect, it } from 'vitest';
import { body, setup } from './fakes.ts';

const future = (days: number) =>
  new Date(Date.parse('2026-10-08T12:00:00Z') + days * 86_400_000).toISOString();

const activityInput = (over: Record<string, unknown> = {}) => ({
  title: 'Panfletagem na praça',
  type: 'panfletagem',
  description: 'Vamos distribuir material na praça central.',
  territory_id: 'mg-3140001-centro',
  public_address: 'Praça Gomes Freire, Mariana',
  coordinates: [-43.41, -20.38],
  location_confirmed: true,
  starts_at: future(3),
  ends_at: future(3.1),
  timezone: 'America/Sao_Paulo',
  public_contact_opt_in: false,
  ...over,
});

const registration = (over: Record<string, unknown> = {}) => ({
  display_name: 'Pessoa Teste',
  email: 'pessoa@example.org',
  phone: '(31) 98888-7777',
  territory_id: 'mg-3140001-centro',
  terms_accepted: true,
  contact_opt_in: false,
  consent_version: '2026-10',
  turnstile_token: `tok-${Math.random()}`,
  ...over,
});

type Setup = ReturnType<typeof setup>;

async function withProfile(s: Setup, userId: string, email: string): Promise<void> {
  await s.repo.createProfile({
    user_id: userId,
    display_name: 'Org',
    email,
    phone: '+5531988887777',
    territory_id: 'mg-3140001',
    consent_version: '1',
    contact_opt_in: false,
    email_state: 'verified',
  });
}

describe('QA-1 findings (it.fails = vulnerable today; it = fixed, kept as regression)', () => {
  it('F01: verified user WITHOUT profile (direct Supabase Auth signup) must not organize', async () => {
    const s = setup();
    const { token, user } = s.users.verified(); // permanent, email confirmed
    s.repo.profiles.delete(user.id); // simulate a direct GoTrue signup: no profile row
    expect(s.repo.profiles.has(user.id)).toBe(false);
    const res = await s.request('/api/v1/activities', {
      method: 'POST',
      token,
      json: activityInput(),
    });
    expect(res.status).toBe(403);
  });

  it('F02: author changing the PUBLIC CONTACT of a published activity must go back to moderation', async () => {
    const s = setup();
    const { token, user } = s.users.verified();
    await withProfile(s, user.id, user.email!);
    const row = s.repo.seedActivity(user.id, { status: 'published' });
    const res = await s.request(`/api/v1/activities/${row.id}`, {
      method: 'PATCH',
      token,
      json: {
        version: row.version,
        public_contact_opt_in: true,
        public_contact_type: 'whatsapp',
        public_contact_value: '(31) 97777-6666',
      },
    });
    expect(res.status).toBe(200);
    const j = await body(res);
    expect(j.data?.status).toBe('pending_review');
  });

  it('F03: Turnstile TEST secret must be refused outside local/test (e.g. staging)', async () => {
    const s = setup({
      APP_ENV: 'staging',
      TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    });
    // FakeTurnstile returns hostname "evil.example" for tokens starting with "wronghost".
    const res = await s.request('/api/v1/auth/send-link', {
      method: 'POST',
      json: { email: 'x@example.org', turnstile_token: 'wronghost-123' },
    });
    expect(res.status).toBe(400);
  });

  it('F04: Siteverify response WITHOUT action must not satisfy an expected action', async () => {
    const s = setup(); // non-test secret; FakeTurnstile always returns action=null
    const res = await s.request('/api/v1/auth/send-link', {
      method: 'POST',
      json: { email: 'x@example.org', turnstile_token: 'tok-no-action' },
    });
    expect(res.status).not.toBe(202);
  });

  it('F05: activity coordinates far outside Minas Gerais must be rejected', async () => {
    const s = setup();
    const { token, user } = s.users.verified();
    await withProfile(s, user.id, user.email!);
    const res = await s.request('/api/v1/activities', {
      method: 'POST',
      token,
      json: activityInput({ coordinates: [2.35, 48.85] }), // Paris, territory = Mariana/MG
    });
    expect(res.status).toBe(400);
  });

  it.fails(
    'F06: registration must not reveal whether an e-mail already has an account (409 vs 201)',
    async () => {
      const s = setup();
      s.users.verified(undefined, 'existe@example.org'); // existing auth user
      const a = s.users.anonymous();
      const b = s.users.anonymous();
      const taken = await s.request('/api/v1/registrations', {
        method: 'POST',
        token: a.token,
        json: registration({ email: 'existe@example.org' }),
      });
      const free = await s.request('/api/v1/registrations', {
        method: 'POST',
        token: b.token,
        json: registration({ email: 'naoexiste@example.org' }),
      });
      expect(taken.status).toBe(free.status);
    },
  );

  it('F07: starts_at absurdly far in the future must be rejected', async () => {
    const s = setup();
    const { token, user } = s.users.verified();
    await withProfile(s, user.id, user.email!);
    const res = await s.request('/api/v1/activities', {
      method: 'POST',
      token,
      json: activityInput({ starts_at: '9999-12-30T00:00:00Z', ends_at: null }),
    });
    expect(res.status).toBe(400);
  });
});

describe('QA-1 controls (verified OK)', () => {
  it('admin with aal1 is denied outside local; MFA bypass only with APP_ENV=local', async () => {
    const s = setup({ APP_ENV: 'staging' });
    const a = s.users.admin('aal1');
    expect((await s.request('/api/v1/admin/queue?kind=groups', { token: a.token })).status).toBe(
      403,
    );
    const p = setup({ APP_ENV: 'production' });
    const c = p.users.admin('aal1');
    expect((await p.request('/api/v1/admin/queue?kind=groups', { token: c.token })).status).toBe(
      403,
    );
    const l = setup({ APP_ENV: 'local' });
    const b = l.users.admin('aal1');
    expect((await l.request('/api/v1/admin/queue?kind=groups', { token: b.token })).status).toBe(
      200,
    );
  });

  it('non-admin verified user and anonymous session are denied on admin routes', async () => {
    const s = setup();
    const v = s.users.verified();
    const an = s.users.anonymous();
    for (const t of [v.token, an.token]) {
      expect((await s.request('/api/v1/admin/queue?kind=activities', { token: t })).status).toBe(
        403,
      );
      const r = await s.request(
        '/api/v1/admin/activities/00000000-0000-4000-8000-0000000000aa/approve',
        { method: 'POST', token: t },
      );
      expect(r.status).toBe(403);
    }
  });

  it('IDOR: another organizer cannot PATCH or cancel an activity (404, no oracle)', async () => {
    const s = setup();
    const owner = s.users.verified();
    const other = s.users.verified();
    await withProfile(s, other.user.id, other.user.email!);
    const row = s.repo.seedActivity(owner.user.id, { status: 'pending_review' });
    const p = await s.request(`/api/v1/activities/${row.id}`, {
      method: 'PATCH',
      token: other.token,
      json: { version: row.version, title: 'Título trocado por outro' },
    });
    expect(p.status).toBe(404);
    const c = await s.request(`/api/v1/activities/${row.id}/cancel`, {
      method: 'POST',
      token: other.token,
    });
    expect(c.status).toBe(404);
  });

  it('RSVP DELETE by a different / forged device identity cannot cancel another RSVP', async () => {
    const s = setup();
    const row = s.repo.seedActivity(s.repo.uuid(), { status: 'published' });
    expect((await s.request(`/api/v1/activities/${row.id}/rsvp`, { method: 'POST' })).status).toBe(
      200,
    );
    const b = await s.request(`/api/v1/activities/${row.id}/rsvp`, { method: 'POST' });
    const cookieB = /mm_device=([^;]+)/.exec(b.headers.get('Set-Cookie') ?? '')?.[1] ?? '';
    const d = await s.request(`/api/v1/activities/${row.id}/rsvp`, {
      method: 'DELETE',
      cookie: `mm_device=${cookieB}`,
    });
    expect((await body(d)).data?.rsvp_count_approx).toBe(1);
    const forged = await s.request(`/api/v1/activities/${row.id}/rsvp`, {
      method: 'DELETE',
      cookie: `mm_device=${'A'.repeat(43)}`,
    });
    expect(forged.status).toBe(404);
  });

  it('mm_device cookie flags outside local: HttpOnly, Secure, SameSite=Lax, Path=/api', async () => {
    const s = setup({ APP_ENV: 'staging' });
    const row = s.repo.seedActivity(s.repo.uuid(), { status: 'published' });
    const res = await s.request(`/api/v1/activities/${row.id}/rsvp`, { method: 'POST' });
    const sc = res.headers.get('Set-Cookie') ?? '';
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/Secure/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\/api/);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('Turnstile token reuse fails on second use', async () => {
    const s = setup();
    const t = 'tok-reuse-1234567890';
    const r1 = await s.request('/api/v1/auth/send-link', {
      method: 'POST',
      json: { email: 'a@example.org', turnstile_token: t },
    });
    expect(r1.status).toBe(202);
    const r2 = await s.request('/api/v1/auth/send-link', {
      method: 'POST',
      json: { email: 'b@example.org', turnstile_token: t },
    });
    expect(r2.status).toBe(400);
    expect((await body(r2)).error?.code).toBe('TURNSTILE_FAILED');
  });

  it('HTML in activity title/description is stripped from the response', async () => {
    const s = setup();
    const { token, user } = s.users.verified();
    await withProfile(s, user.id, user.email!);
    const res = await s.request('/api/v1/activities', {
      method: 'POST',
      token,
      json: activityInput({
        title: 'Ato <script>alert(1)</script> na praça',
        description: 'Descrição <img src=x onerror=alert(1)> segura aqui',
      }),
    });
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain('<script');
    expect(text).not.toContain('onerror');
  });
});
