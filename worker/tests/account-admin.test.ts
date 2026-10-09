import { describe, expect, it } from 'vitest';
import { body, setup } from './fakes.ts';

const registration = (over: Record<string, unknown> = {}) => ({
  display_name: 'Maria Voluntária',
  email: `maria${Math.floor(Math.random() * 1e9)}@example.org`,
  phone: '(31) 99999-8888',
  territory_id: 'mg-3140001-centro',
  terms_accepted: true,
  contact_opt_in: true,
  consent_version: 'v1',
  turnstile_token: `tok-${Math.random()}`,
  ...over,
});

describe('registrations with a Clerk session (ADR 0005; T03, T04, T05)', () => {
  it('T03: invalid e-mail -> 400 with field error and nothing stored', async () => {
    const { request, users, repo } = setup();
    const s = users.signedUp();
    const res = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: 'nope' }),
    });
    expect(res.status).toBe(400);
    const json = await body(res);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(json.error?.fields?.email).toBeDefined();
    expect(repo.profiles.size).toBe(0);
  });

  it('T04: missing or invalid Turnstile token is blocked server-side', async () => {
    const { request, users, repo } = setup();
    const s = users.signedUp();
    const { turnstile_token: _omit, ...noToken } = registration({ email: s.user.email });
    const missing = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: noToken,
    });
    expect(missing.status).toBe(400);
    expect((await body(missing)).error?.fields?.turnstile_token).toBeDefined();
    const invalid = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: s.user.email, turnstile_token: 'bad-1' }),
    });
    expect((await body(invalid)).error?.code).toBe('TURNSTILE_FAILED');
    expect(repo.profiles.size).toBe(0);
  });

  it('requires a Clerk session: 401 without token, malformed header or invalid token', async () => {
    const { request, repo } = setup();
    expect(
      (await request('/api/v1/registrations', { method: 'POST', json: registration() })).status,
    ).toBe(401);
    const malformed = await request('/api/v1/registrations', {
      method: 'POST',
      headers: { Authorization: 'Basic abc' },
      json: registration(),
    });
    expect(malformed.status).toBe(401);
    const invalid = await request('/api/v1/registrations', {
      method: 'POST',
      token: 'not-a-valid-clerk-session-token',
      json: registration(),
    });
    expect(invalid.status).toBe(401);
    expect((await body(invalid)).error?.code).toBe('UNAUTHENTICATED');
    expect(repo.profiles.size).toBe(0);
  });

  it('e-mail not verified in Clerk -> 403 EMAIL_NOT_VERIFIED, no profile, Turnstile not spent', async () => {
    const { request, users, repo, turnstile } = setup();
    const s = users.unverified();
    const res = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: s.user.email }),
    });
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(repo.profiles.size).toBe(0);
    expect(turnstile.calls).toBe(0);
  });

  it('T05: valid registration -> 201, profile verified with the Clerk e-mail, audited, no-store', async () => {
    const { request, users, repo } = setup();
    const s = users.signedUp('maria.silva@example.org');
    const input = registration({ email: 'Maria.Silva@Example.org' });
    const res = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: input,
    });
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await body(res)).data).toEqual({
      profile_id: s.user.id,
      territory_id: 'mg-3140001-centro',
      email_verification_state: 'verified',
      session_state: 'verified',
    });
    const profile = repo.profiles.get(s.user.id);
    expect(profile?.phone_e164).toBe('+5531999998888');
    expect(profile?.email_contact).toBe('maria.silva@example.org');
    expect(profile?.email_verification_state).toBe('verified');
    expect(repo.audit.some((a) => a.action === 'profile.create' && a.actor === s.user.id)).toBe(
      true,
    );
    // idempotent re-submit from the same account
    const again = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: { ...input, turnstile_token: 'tok-again' },
    });
    expect(again.status).toBe(200);
    expect(repo.profiles.size).toBe(1);
  });

  it('the form e-mail must be the verified Clerk e-mail (400, nothing stored)', async () => {
    const { request, users, repo } = setup();
    const s = users.signedUp('dona@example.org');
    const res = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: 'outra@example.org' }),
    });
    expect(res.status).toBe(400);
    expect((await body(res)).error?.fields?.email).toBeDefined();
    expect(repo.profiles.size).toBe(0);
  });

  it('contact e-mail already held by another profile -> 409 neutral message, no profile', async () => {
    const { request, users, repo } = setup();
    const owner = users.verified(undefined, 'dup@example.org');
    const s = users.signedUp('dup@example.org');
    const res = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: owner.user.email }),
    });
    expect(res.status).toBe(409);
    const msg = (await body(res)).error?.message ?? '';
    expect(msg).not.toMatch(/existe|cadastrad[oa] por|outra conta/i);
    expect(repo.profiles.has(s.user.id)).toBe(false);
  });

  it('Clerk Backend API outage while resolving the e-mail -> 503 generic, nothing stored (QA3-05)', async () => {
    const { request, users, repo, auth } = setup();
    const s = users.signedUp();
    auth.outage = true;
    const res = await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: s.user.email }),
    });
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('5');
    expect(repo.profiles.size).toBe(0);
    const text = await res.text();
    expect(text).toContain('SERVICE_UNAVAILABLE');
    expect(text).not.toMatch(/stack|Error:|clerk/i);
  });

  it('session claims email/email_verified are used when present on cached routes (no Backend API call)', async () => {
    const { request, auth } = setup();
    auth.add(
      'tok-claims-padding-padding-padding',
      { id: 'user_claims000001', email: 'x@example.org', email_confirmed: false },
      { claims: { email: 'claims@example.org', email_verified: true } },
    );
    const res = await request('/api/v1/me', { token: 'tok-claims-padding-padding-padding' });
    expect(res.status).toBe(200);
    expect(auth.getUserCalls).toBe(0);
    expect((await body(res)).data?.email_verified).toBe(true);
  });

  it('registration ignores the claims shortcut and reads Clerk fresh (QA3-01/03)', async () => {
    const { request, auth, repo } = setup();
    auth.add(
      'tok-claims-padding-padding-padding',
      { id: 'user_claims000001', email: 'claims@example.org', email_confirmed: true },
      { claims: { email: 'claims@example.org', email_verified: true } },
    );
    const ok = await request('/api/v1/registrations', {
      method: 'POST',
      token: 'tok-claims-padding-padding-padding',
      json: registration({ email: 'claims@example.org' }),
    });
    expect(ok.status).toBe(201);
    expect(auth.getUserCalls).toBe(1);
    expect(repo.profiles.get('user_claims000001')?.email_contact).toBe('claims@example.org');

    // banned in Clerk while the token (with claims) is still valid -> refused on registration
    auth.add(
      'tok-claims-banned-padding-padding',
      { id: 'user_claims000002', email: 'banned@example.org', email_confirmed: true },
      { claims: { email: 'banned@example.org', email_verified: true }, banned: true },
    );
    const banned = await request('/api/v1/registrations', {
      method: 'POST',
      token: 'tok-claims-banned-padding-padding',
      json: registration({ email: 'banned@example.org' }),
    });
    expect(banned.status).toBe(401);
    expect(repo.profiles.has('user_claims000002')).toBe(false);
  });

  it('the Clerk user is resolved once per request (verify + getUser memoised)', async () => {
    const { request, users, auth } = setup();
    const v = users.verified();
    auth.verifyCalls = 0;
    auth.getUserCalls = 0;
    const res = await request('/api/v1/my-activities', { token: v.token });
    expect(res.status).toBe(200);
    expect(auth.verifyCalls).toBe(1);
    expect(auth.getUserCalls).toBe(1);
  });

  it('banned/deleted Clerk user or non-active session status -> 401', async () => {
    const { request, auth } = setup();
    auth.add(
      'tok-banned-padding-padding-padding',
      { id: 'user_banned000001', email: 'b@example.org', email_confirmed: true },
      { banned: true },
    );
    auth.add(
      'tok-pending-padding-padding-padding',
      { id: 'user_pending00001', email: 'p@example.org', email_confirmed: true },
      { claims: { sts: 'pending' } },
    );
    auth.add('tok-gone-padding-padding-padding', {
      id: 'user_gone00000001',
      email: 'g@example.org',
      email_confirmed: true,
    });
    auth.people.delete('user_gone00000001');
    for (const token of [
      'tok-banned-padding-padding-padding',
      'tok-pending-padding-padding-padding',
      'tok-gone-padding-padding-padding',
    ]) {
      expect([token, (await request('/api/v1/me', { token })).status]).toEqual([token, 401]);
    }
  });

  it('registration rate limit (F05): per IP + subject, with a looser per-IP ceiling', async () => {
    const { request, users } = setup();
    // same account, invalid payload each time: 6th attempt in 10 min -> 429
    const one = users.signedUp();
    let status = 0;
    for (let i = 0; i < 6; i++) {
      status = (
        await request('/api/v1/registrations', {
          method: 'POST',
          token: one.token,
          json: registration({ email: one.user.email, turnstile_token: `bad-${i}` }),
        })
      ).status;
    }
    expect(status).toBe(429);
    // many people behind the same IP (CGNAT) are not blocked by one another
    for (let i = 0; i < 20; i++) {
      const p = users.signedUp(`pessoa${i}@example.org`);
      const r = await request('/api/v1/registrations', {
        method: 'POST',
        token: p.token,
        json: registration({ email: p.user.email }),
      });
      expect(r.status).toBe(201);
    }
    // ...up to the per-IP ceiling (30/10 min)
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const p = users.signedUp(`extra${i}@example.org`);
      statuses.push(
        (
          await request('/api/v1/registrations', {
            method: 'POST',
            token: p.token,
            json: registration({ email: p.user.email }),
          })
        ).status,
      );
    }
    expect(statuses).toContain(429);
  });
});

describe('me (ADR 0005)', () => {
  it('GET /me after registration: masked e-mail, verified, not anonymous, no review, no-store', async () => {
    const { request, users } = setup();
    const s = users.signedUp('maria.silva@example.org');
    await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: 'maria.silva@example.org' }),
    });
    const res = await request('/api/v1/me', { token: s.token });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const me = (await body(res)).data;
    expect(me).toMatchObject({
      user_id: s.user.id,
      is_anonymous: false,
      email_verified: true,
      is_admin: false,
      display_name: 'Maria Voluntária',
      profile_review_required: false,
    });
    expect(me?.email_masked).toBe('ma***@example.org');
    expect(JSON.stringify(me)).not.toContain('99999');
    expect((await request('/api/v1/me')).status).toBe(401);
  });

  it('GET /me with an unverified Clerk e-mail -> email_verified false', async () => {
    const { request, users } = setup();
    const s = users.unverified();
    const me = (await body(await request('/api/v1/me', { token: s.token }))).data;
    expect(me).toMatchObject({ email_verified: false, is_admin: false, display_name: null });
  });

  it('GET /me re-syncs the profile e-mail after a verified primary change in Clerk (audited)', async () => {
    const { request, users, repo, auth } = setup();
    const v = users.verified(undefined, 'antigo@example.org');
    auth.people.set(v.user.id, {
      id: v.user.id,
      email: 'novo@example.org',
      email_verified: true,
      banned: false,
    });
    const res = await request('/api/v1/me', { token: v.token });
    expect(res.status).toBe(200);
    expect(repo.profiles.get(v.user.id)?.email_contact).toBe('novo@example.org');
    expect(repo.audit.some((a) => a.action === 'profile.email_changed')).toBe(true);
  });

  it('PATCH /me only changes allowed fields; unknown territory rejected; no profile -> 404', async () => {
    const { request, users } = setup();
    const s = users.signedUp();
    expect(
      (
        await request('/api/v1/me', {
          method: 'PATCH',
          token: s.token,
          json: { display_name: 'Novo Nome' },
        })
      ).status,
    ).toBe(404);
    await request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: registration({ email: s.user.email }),
    });
    const ok = await request('/api/v1/me', {
      method: 'PATCH',
      token: s.token,
      json: {
        display_name: 'Novo <i>Nome</i>',
        selected_territory_id: 'mg-3106200',
        is_admin: true,
      },
    });
    expect((await body(ok)).data).toMatchObject({
      display_name: 'Novo Nome',
      selected_territory_id: 'mg-3106200',
      is_admin: false,
    });
    const bad = await request('/api/v1/me', {
      method: 'PATCH',
      token: s.token,
      json: { selected_territory_id: 'mg-9999999' },
    });
    expect(bad.status).toBe(400);
  });

  it('removed Supabase Auth routes answer 404 (send-link, confirm-email)', async () => {
    const { request, users } = setup();
    const v = users.verified();
    for (const path of ['/api/v1/auth/send-link', '/api/v1/auth/confirm-email']) {
      const res = await request(path, {
        method: 'POST',
        token: v.token,
        json: { email: 'quem@example.org', turnstile_token: 'tok-1' },
      });
      expect([path, res.status]).toEqual([path, 404]);
    }
  });
});

describe('admin (T22, T15, T28 logic)', () => {
  it('T22: no session -> 401; non-admin -> 403 + minimised security log', async () => {
    const { request, users, repo } = setup();
    expect((await request('/api/v1/admin/queue')).status).toBe(401);
    const v = users.verified();
    const res = await request('/api/v1/admin/queue', {
      token: v.token,
      headers: { 'CF-Connecting-IP': '203.0.113.9' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const ev = repo.abuse.find((e) => e.event_type === 'admin_denied');
    expect(ev).toBeDefined();
    expect(JSON.stringify(repo.abuse)).not.toContain('203.0.113.9');
    expect(JSON.stringify(repo.abuse)).not.toContain(v.user.id);
  });

  it('T15 (D35): admin without MFA (aal1) is accepted in local, staging and production', async () => {
    for (const APP_ENV of ['local', 'staging', 'production']) {
      const s = setup({ APP_ENV });
      const a = s.users.admin('aal1');
      const r = await s.request('/api/v1/admin/queue', { token: a.token });
      expect([APP_ENV, r.status]).toEqual([APP_ENV, 200]);
    }
  });

  it('queue masks proposer contact; approve twice -> second 409 (no duplicate group)', async () => {
    const { request, users, repo } = setup();
    const admin = users.admin('aal2');
    await request('/api/v1/groups/proposals', {
      method: 'POST',
      json: {
        territory_id: 'mg-3140001',
        name_proposed: 'Grupo Mariana',
        join_url_proposed: 'https://chat.whatsapp.com/ZyXwVuTsRqPoNmLkJiHg',
        proposer_name: 'João',
        proposer_email: 'joao.silva@example.org',
        proposer_phone: '31977776666',
        responsibility_accepted: true,
        consent_version: 'v1',
        turnstile_token: 'tok-q',
      },
    });
    const q = await request('/api/v1/admin/queue?kind=groups', { token: admin.token });
    const text = await q.text();
    expect(text).toContain('jo***@example.org');
    expect(text).not.toContain('joao.silva');
    expect(text).not.toContain('977776666');
    const id = repo.proposals[0]!.id;
    const first = await request(`/api/v1/admin/groups/${id}/approve`, {
      method: 'POST',
      token: admin.token,
    });
    expect(first.status).toBe(200);
    const second = await request(`/api/v1/admin/groups/${id}/approve`, {
      method: 'POST',
      token: admin.token,
    });
    expect(second.status).toBe(409);
    expect(repo.groups).toHaveLength(1);
    expect(
      (await body(await request('/api/v1/groups?territory_id=mg-3140001'))).data?.fallback,
    ).toBe('exact');
  });

  it('reject requires a reason; unknown ids -> 404', async () => {
    const { request, users } = setup();
    const admin = users.admin();
    const missing = await request(
      '/api/v1/admin/groups/00000000-0000-4000-8000-0000000000aa/reject',
      { method: 'POST', token: admin.token, json: {} },
    );
    expect(missing.status).toBe(400);
    const unknown = await request(
      '/api/v1/admin/groups/00000000-0000-4000-8000-0000000000aa/reject',
      {
        method: 'POST',
        token: admin.token,
        json: { reason: 'spam evidente' },
      },
    );
    expect(unknown.status).toBe(404);
  });

  it('T08: admin approves an activity -> appears publicly; reject of non-pending -> 409', async () => {
    const { request, users, repo } = setup();
    const admin = users.admin();
    const a = repo.seedActivity(repo.uuid(), { status: 'pending_review' });
    const res = await request(`/api/v1/admin/activities/${a.id}/approve`, {
      method: 'POST',
      token: admin.token,
    });
    expect((await body(res)).data).toMatchObject({ status: 'published' });
    expect((await request(`/api/v1/activities/${a.id}`)).status).toBe(200);
    const rej = await request(`/api/v1/admin/activities/${a.id}/reject`, {
      method: 'POST',
      token: admin.token,
      json: { reason: 'tarde demais' },
    });
    expect(rej.status).toBe(409);
  });

  it('PATCH group validates the invite URL and is audited; managers stay private', async () => {
    const { request, users, repo } = setup();
    const admin = users.admin();
    const g = repo.addGroup('mg-3140001');
    const bad = await request(`/api/v1/admin/groups/${g.id}`, {
      method: 'PATCH',
      token: admin.token,
      json: { join_url: 'https://bit.ly/x', reason: 'troca' },
    });
    expect(bad.status).toBe(400);
    const off = await request(`/api/v1/admin/groups/${g.id}`, {
      method: 'PATCH',
      token: admin.token,
      json: { status: 'inactive', reason: 'link quebrado' },
    });
    expect((await body(off)).data?.status).toBe('inactive');
    expect(repo.audit.some((e) => e.action === 'group.update')).toBe(true);
    expect(
      (await body(await request('/api/v1/groups?territory_id=mg-3140001'))).data?.fallback,
    ).toBe('none');
    const mgr = await request(`/api/v1/admin/groups/${g.id}/managers`, {
      method: 'POST',
      token: admin.token,
      json: { name: 'Fulano', phone: '123' },
    });
    expect(mgr.status).toBe(400);
  });

  it('security events list exposes only minimised fields', async () => {
    const { request, users } = setup();
    const v = users.verified();
    await request('/api/v1/admin/queue', { token: v.token });
    const admin = users.admin();
    const res = await request('/api/v1/admin/security-events', { token: admin.token });
    const items = (await body(res)).data?.items ?? [];
    expect(items.length).toBeGreaterThan(0);
    expect(Object.keys(items[0]!).sort()).toEqual([
      'block_code',
      'created_at',
      'event_type',
      'id',
      'route',
    ]);
  });
});
