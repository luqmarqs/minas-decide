/**
 * BE-3 — fixes for the QA-2 findings (complements worker/tests/qa2-security.test.ts, whose
 * `it.fails` were flipped to `it`). In-memory fakes: NOT a substitute for the live tests in
 * supabase/tests/qa2-live.test.ts (Q02) and supabase/tests/round2.test.ts (SQL semantics).
 */
import { describe, expect, it } from 'vitest';
import { body, setup } from './fakes.ts';

const future = (days: number) =>
  new Date(Date.parse('2026-10-08T12:00:00Z') + days * 86_400_000).toISOString();
const activityInput = () => ({
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
});

const proposal = (over: Record<string, unknown> = {}) => ({
  territory_id: 'mg-3140001',
  name_proposed: 'Grupo Mariana Centro',
  join_url_proposed: 'https://chat.whatsapp.com/AbCdEfGhIjKlMn',
  proposer_name: 'Proponente',
  proposer_email: 'proponente@example.org',
  proposer_phone: '(31) 97777-1234',
  responsibility_accepted: true,
  consent_version: '2026-10',
  turnstile_token: `tok-${Math.random()}`,
  ...over,
});

const registration = () => ({
  display_name: 'Nome',
  email: 'pessoa@example.org',
  phone: '(31) 98888-7777',
  territory_id: 'mg-3140001-centro',
  terms_accepted: true,
  contact_opt_in: false,
  consent_version: '2026-10',
  turnstile_token: `tok-${Math.random()}`,
});

describe('QA2-01: any transition of the profile to verified is a promotion', () => {
  it('e-mail changed in Auth (secure change, already permanent): blocked until confirm-email + review', async () => {
    const s = setup();
    const v = s.users.verified();
    // GoTrue changed the address (email_change confirmed by the new inbox) outside the Worker
    v.user.email = 'nova-dona@example.org';
    v.user.amr_methods = ['email_change'];
    const before = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect(before.status).toBe(403);

    const conf = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: v.token });
    expect(conf.status).toBe(200);
    expect((await body(conf)).data?.profile_review_required).toBe(true);
    expect(s.auth.signedOutOthers).toEqual([v.token]);
    expect(s.repo.profiles.get(v.user.id)?.email_contact).toBe('nova-dona@example.org');
    const audit = s.repo.audit.filter((e) => e.action === 'profile.email_changed');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: v.user.id, entity_id: v.user.id, reason: null });
    expect(JSON.stringify(s.repo.audit)).not.toContain('nova-dona@');

    // still blocked while the review is pending; allowed after PATCH /me {profile_reviewed}
    const pending = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect(pending.status).toBe(403);
    const rev = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: v.token,
      json: { profile_reviewed: true },
    });
    expect(rev.status).toBe(200);
    const after = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect(after.status).toBe(201);
  });

  it('PATCH /me {profile_reviewed} does NOT re-sync a diverged e-mail (only confirm-email does)', async () => {
    const s = setup();
    const v = s.users.verified();
    v.user.email = 'outra@example.org';
    const rev = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: v.token,
      json: { profile_reviewed: true },
    });
    expect(rev.status).toBe(200);
    expect(s.repo.profiles.get(v.user.id)?.email_contact).not.toBe('outra@example.org');
    const act = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect(act.status).toBe(403);
  });

  it('e-mail comparison is case-insensitive; a repeated confirm-email is a no-op', async () => {
    const s = setup();
    const v = s.users.verified(undefined, 'Org.Case@Example.org');
    v.user.email = 'org.case@example.org';
    const conf = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: v.token });
    expect(conf.status).toBe(200);
    expect((await body(conf)).data?.profile_review_required).toBe(false);
    expect(s.auth.signedOutOthers).toHaveLength(0);
    const act = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect(act.status).toBe(201);
  });

  it('confirm-email without an e-mail proof in amr -> 403 EMAIL_NOT_VERIFIED; no session -> 401', async () => {
    const s = setup();
    const v = s.users.verified();
    v.user.email = 'nova@example.org';
    v.user.amr_methods = ['password'];
    const r = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: v.token });
    expect(r.status).toBe(403);
    expect((await body(r)).error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(s.repo.profiles.get(v.user.id)?.email_contact).not.toBe('nova@example.org');
    expect((await s.request('/api/v1/auth/confirm-email', { method: 'POST' })).status).toBe(401);
  });
});

describe('QA2-02: confirm-email fails closed when other sessions cannot be revoked', () => {
  async function provisional() {
    const s = setup();
    const a = s.users.anonymous();
    const reg = await s.request('/api/v1/registrations', {
      method: 'POST',
      token: a.token,
      json: registration(),
    });
    expect(reg.status).toBe(201);
    a.user.email = 'pessoa@example.org';
    a.user.email_confirmed = true;
    a.user.amr_methods = ['otp'];
    return { s, a };
  }

  it('two failures -> 500 INTERNAL_ERROR, profile not verified, no review flag', async () => {
    const { s, a } = await provisional();
    let calls = 0;
    s.auth.signOutOthers = async () => {
      calls += 1;
      return false;
    };
    const r = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: a.token });
    expect(r.status).toBe(500);
    expect((await body(r)).error?.code).toBe('INTERNAL_ERROR');
    expect(calls).toBe(2);
    expect(s.repo.profiles.get(a.user.id)?.email_verification_state).toBe('pending');
    expect(s.repo.profiles.get(a.user.id)?.review_required_at).toBeNull();
  });

  it('a throwing gateway is also a failure (500)', async () => {
    const { s, a } = await provisional();
    s.auth.signOutOthers = async () => {
      throw new Error('timeout');
    };
    const r = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: a.token });
    expect(r.status).toBe(500);
    expect(s.repo.profiles.get(a.user.id)?.email_verification_state).toBe('pending');
  });

  it('first attempt fails, retry succeeds -> 200 verified + review flag', async () => {
    const { s, a } = await provisional();
    let calls = 0;
    s.auth.signOutOthers = async () => ++calls > 1;
    const r = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: a.token });
    expect(r.status).toBe(200);
    expect(calls).toBe(2);
    expect(s.repo.profiles.get(a.user.id)?.email_verification_state).toBe('verified');
    expect((await body(r)).data?.profile_review_required).toBe(true);
  });
});

describe('QA2-03/04: edge cache purge and canonical keys', () => {
  it('reject and unsuspend also purge; approving a neighborhood group purges its URL', async () => {
    const s = setup({ APP_ENV: 'local' }, { edgeCache: true });
    const admin = s.users.admin('aal2').token;
    const hood = '/api/v1/groups?territory_id=mg-3140001-centro';
    expect((await body(await s.request(hood))).data?.fallback).toBe('none');
    const p = await body(
      await s.request('/api/v1/groups/proposals', {
        method: 'POST',
        json: proposal({ territory_id: 'mg-3140001-centro' }),
      }),
    );
    const ap = await s.request(`/api/v1/admin/groups/${String(p.data?.id)}/approve`, {
      method: 'POST',
      token: admin,
    });
    expect(ap.status).toBe(200);
    expect((await body(await s.request(hood))).data?.fallback).toBe('exact');

    const p2 = await body(
      await s.request('/api/v1/groups/proposals', {
        method: 'POST',
        json: proposal({ join_url_proposed: 'https://chat.whatsapp.com/ZyXwVuTsRqPoNm' }),
      }),
    );
    s.edgeCache!.deletes.length = 0;
    const rj = await s.request(`/api/v1/admin/groups/${String(p2.data?.id)}/reject`, {
      method: 'POST',
      token: admin,
      json: { reason: 'link inválido' },
    });
    expect(rj.status).toBe(200);
    expect(s.edgeCache!.deletes.some((u) => u.endsWith('/groups?territory_id=mg-3140001'))).toBe(
      true,
    );

    const g = s.repo.addGroup('mg-3140001');
    await s.request(`/api/v1/admin/groups/${g.id}/suspend`, {
      method: 'POST',
      token: admin,
      json: { reason: 'denúncia' },
    });
    const muni = '/api/v1/groups?territory_id=mg-3140001';
    expect((await body(await s.request(muni))).data?.items).toHaveLength(0);
    const un = await s.request(`/api/v1/admin/groups/${g.id}/unsuspend`, {
      method: 'POST',
      token: admin,
      json: { reason: 'revisado' },
    });
    expect(un.status).toBe(200);
    expect((await body(await s.request(muni))).data?.items).toHaveLength(1);
  });

  it('activity detail with an extra param is purged by the suspension', async () => {
    const s = setup({}, { edgeCache: true });
    const row = s.repo.seedActivity(s.repo.uuid());
    const busted = `/api/v1/activities/${row.id}?x=1`;
    expect((await s.request(busted)).status).toBe(200);
    expect((await s.request(busted)).headers.get('X-Cache')).toBe('HIT');
    const sus = await s.request(`/api/v1/admin/activities/${row.id}/suspend`, {
      method: 'POST',
      token: s.users.admin('aal2').token,
      json: { reason: 'denúncia' },
    });
    expect(sus.status).toBe(200);
    expect((await s.request(busted)).status).toBe(404);
  });

  it('param order and unknown params share one cache entry', async () => {
    const s = setup({}, { edgeCache: true });
    const a = await s.request('/api/v1/territories/search?q=mariana&limit=5');
    expect(a.headers.get('X-Cache')).toBe('MISS');
    const b = await s.request('/api/v1/territories/search?limit=5&q=mariana&utm=1');
    expect(b.headers.get('X-Cache')).toBe('HIT');
    expect([...s.edgeCache!.store.keys()].filter((k) => k.includes('/territories/search'))).toEqual(
      ['http://localhost/api/v1/territories/search?q=mariana&limit=5'],
    );
  });
});

describe('QA2-05: idempotency key scoped per submitter', () => {
  it('same submitter (same IP, no session) + same key -> dedupe (200, same id)', async () => {
    const s = setup({ APP_ENV: 'local' });
    const k = 'my-key-123456789';
    const h = { 'CF-Connecting-IP': '203.0.113.7' };
    const a = await s.request('/api/v1/groups/proposals', {
      method: 'POST',
      headers: h,
      json: proposal({ idempotency_key: k }),
    });
    const b = await s.request('/api/v1/groups/proposals', {
      method: 'POST',
      headers: h,
      json: proposal({ idempotency_key: k }),
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect((await body(b)).data?.id).toBe((await body(a)).data?.id);
  });

  it('same session user from two IPs + same key -> dedupe; another user -> new proposal', async () => {
    const s = setup({ APP_ENV: 'local' });
    const k = 'my-key-abcdefghij';
    const u = s.users.verified();
    const other = s.users.verified();
    const send = (token: string, ip: string) =>
      s.request('/api/v1/groups/proposals', {
        method: 'POST',
        token,
        headers: { 'CF-Connecting-IP': ip },
        json: proposal({ idempotency_key: k }),
      });
    expect((await send(u.token, '203.0.113.1')).status).toBe(201);
    expect((await send(u.token, '203.0.113.2')).status).toBe(200);
    expect((await send(other.token, '203.0.113.1')).status).toBe(201);
  });
});

describe('QA2-09: unsuspend restores the previous state', () => {
  it('group inactive -> suspended -> inactive; active -> suspended -> active', async () => {
    const s = setup();
    const admin = s.users.admin('aal2').token;
    const inactive = s.repo.addGroup('mg-3140001', 'inactive');
    const active = s.repo.addGroup('mg-3106200', 'active');
    for (const [g, expected] of [
      [inactive, 'inactive'],
      [active, 'active'],
    ] as const) {
      const sus = await s.request(`/api/v1/admin/groups/${g.id}/suspend`, {
        method: 'POST',
        token: admin,
        json: { reason: 'denúncia' },
      });
      expect((await body(sus)).data?.status).toBe('suspended');
      const un = await s.request(`/api/v1/admin/groups/${g.id}/unsuspend`, {
        method: 'POST',
        token: admin,
        json: { reason: 'revisado' },
      });
      expect((await body(un)).data?.status).toBe(expected);
    }
    const again = await s.request(`/api/v1/admin/groups/${inactive.id}/unsuspend`, {
      method: 'POST',
      token: admin,
      json: { reason: 'de novo' },
    });
    expect(again.status).toBe(409);
  });

  it('cancelled activity -> suspended -> cancelled; published -> suspended -> pending_review', async () => {
    const s = setup();
    const admin = s.users.admin('aal2').token;
    const cancelled = s.repo.seedActivity(s.repo.uuid(), { status: 'cancelled' });
    const published = s.repo.seedActivity(s.repo.uuid());
    for (const [row, expected] of [
      [cancelled, 'cancelled'],
      [published, 'pending_review'],
    ] as const) {
      const sus = await s.request(`/api/v1/admin/activities/${row.id}/suspend`, {
        method: 'POST',
        token: admin,
        json: { reason: 'denúncia' },
      });
      expect(sus.status).toBe(200);
      const un = await s.request(`/api/v1/admin/activities/${row.id}/unsuspend`, {
        method: 'POST',
        token: admin,
        json: { reason: 'revisado' },
      });
      expect(un.status).toBe(200);
      expect((await body(un)).data?.status).toBe(expected);
      expect(s.repo.activities.find((a) => a.id === row.id)?.status).toBe(expected);
    }
    const missing = await s.request(
      '/api/v1/admin/activities/00000000-0000-4000-8000-0000000fffff/unsuspend',
      { method: 'POST', token: admin, json: { reason: 'revisado' } },
    );
    expect(missing.status).toBe(404);
  });
});

describe('QA2-12: admin outside local needs a VERIFIED TOTP factor', () => {
  for (const APP_ENV of ['staging', 'production']) {
    it(`${APP_ENV}: aal2 without verified factor -> 403; with factor -> 200; aal1 with factor -> 403`, async () => {
      const s = setup({ APP_ENV, WRITES_ENABLED: 'true' });
      const noFactor = s.users.admin('aal2', undefined, false);
      expect((await s.request('/api/v1/admin/queue', { token: noFactor.token })).status).toBe(403);
      const withFactor = s.users.admin('aal2');
      const ok = await s.request('/api/v1/admin/queue', { token: withFactor.token });
      expect(ok.status).toBe(200);
      const aal1 = s.users.admin('aal1', undefined, true);
      expect((await s.request('/api/v1/admin/queue', { token: aal1.token })).status).toBe(403);
    });
  }

  it('factor lookup is done once per request and fails closed on error', async () => {
    const s = setup({ APP_ENV: 'staging', WRITES_ENABLED: 'true' });
    const a = s.users.admin('aal2');
    const before = s.auth.totpChecks;
    expect((await s.request('/api/v1/admin/queue', { token: a.token })).status).toBe(200);
    expect(s.auth.totpChecks - before).toBe(1);
    s.auth.hasVerifiedTotp = async () => {
      throw new Error('auth down');
    };
    expect((await s.request('/api/v1/admin/queue', { token: a.token })).status).toBe(403);
  });

  it('local keeps the logged bypass (aal1, no factor) and never asks the factor API', async () => {
    const s = setup({ APP_ENV: 'local' });
    const a = s.users.admin('aal1', undefined, false);
    expect((await s.request('/api/v1/admin/queue', { token: a.token })).status).toBe(200);
    expect(s.auth.totpChecks).toBe(0);
  });
});
