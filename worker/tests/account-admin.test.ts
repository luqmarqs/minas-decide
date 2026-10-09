import { describe, expect, it } from 'vitest';
import { MeResponse, RegistrationResult } from '../../shared/contracts/registration.ts';
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

describe('registrations (T03, T04, T05, T18)', () => {
  it('T03: invalid e-mail -> 400 with field error and nothing stored', async () => {
    const { request, users, repo, auth } = setup();
    const s = users.anonymous();
    const res = await request('/api/v1/registrations', { method: 'POST', token: s.token, json: registration({ email: 'nope' }) });
    expect(res.status).toBe(400);
    const json = await body(res);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(json.error?.fields?.email).toBeDefined();
    expect(repo.profiles.size).toBe(0);
    expect(auth.linked).toHaveLength(0);
  });

  it('T04: missing or invalid Turnstile token is blocked server-side', async () => {
    const { request, users, repo } = setup();
    const s = users.anonymous();
    const { turnstile_token: _omit, ...noToken } = registration();
    const missing = await request('/api/v1/registrations', { method: 'POST', token: s.token, json: noToken });
    expect(missing.status).toBe(400);
    expect((await body(missing)).error?.fields?.turnstile_token).toBeDefined();
    const invalid = await request('/api/v1/registrations', { method: 'POST', token: s.token, json: registration({ turnstile_token: 'bad-1' }) });
    expect((await body(invalid)).error?.code).toBe('TURNSTILE_FAILED');
    expect(repo.profiles.size).toBe(0);
  });

  it('requires a provisional session (401 without token)', async () => {
    const { request } = setup();
    expect((await request('/api/v1/registrations', { method: 'POST', json: registration() })).status).toBe(401);
  });

  it('T05: valid registration -> 201 provisional session, e-mail linked + magic link sent, no-store', async () => {
    const { request, users, repo, auth } = setup();
    const s = users.anonymous();
    const input = registration();
    const res = await request('/api/v1/registrations', { method: 'POST', token: s.token, json: input });
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const result = RegistrationResult.parse((await body(res)).data);
    expect(result).toEqual({
      profile_id: s.user.id,
      territory_id: 'mg-3140001-centro',
      email_verification_state: 'pending',
      session_state: 'provisional',
    });
    expect(repo.profiles.get(s.user.id)?.phone_e164).toBe('+5531999998888');
    expect(auth.linked).toEqual([{ userId: s.user.id, email: input.email }]);
    expect(auth.magicLinks).toEqual([input.email]);
    // idempotent re-submit from the same session (new Turnstile token)
    const again = await request('/api/v1/registrations', { method: 'POST', token: s.token, json: { ...input, turnstile_token: 'tok-again' } });
    expect(again.status).toBe(200);
  });

  it('magic link failure is reported honestly as unverified (no fake success)', async () => {
    const { request, users, auth } = setup();
    auth.magicLinkOk = false;
    const s = users.anonymous();
    const res = await request('/api/v1/registrations', { method: 'POST', token: s.token, json: registration() });
    expect((await body(res)).data?.email_verification_state).toBe('unverified');
  });

  it('e-mail owned by another account -> 409 neutral message, no profile', async () => {
    const { request, users, repo } = setup();
    const owner = users.verified();
    const s = users.anonymous();
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

  it('T18: Auth link failure compensates (profile removed) and returns an error', async () => {
    const { request, users, repo, auth } = setup();
    auth.linkOk = false;
    const s = users.anonymous();
    const res = await request('/api/v1/registrations', { method: 'POST', token: s.token, json: registration() });
    expect(res.status).toBe(500);
    expect(repo.profiles.size).toBe(0);
    expect(await res.text()).not.toMatch(/stack|Error:/);
  });

  it('a permanent account cannot register again', async () => {
    const { request, users } = setup();
    const v = users.verified();
    const res = await request('/api/v1/registrations', { method: 'POST', token: v.token, json: registration() });
    expect(res.status).toBe(409);
  });

  it('registration rate limit: 6th attempt in 10 min -> 429', async () => {
    const { request, users } = setup();
    let status = 0;
    for (let i = 0; i < 6; i++) {
      status = (await request('/api/v1/registrations', { method: 'POST', token: users.anonymous().token, json: registration() })).status;
    }
    expect(status).toBe(429);
  });
});

describe('me & auth', () => {
  it('GET /me for a provisional session: masked e-mail, not verified, no-store', async () => {
    const { request, users } = setup();
    const s = users.anonymous();
    const input = registration({ email: 'maria.silva@example.org' });
    await request('/api/v1/registrations', { method: 'POST', token: s.token, json: input });
    const res = await request('/api/v1/me', { token: s.token });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const me = MeResponse.parse((await body(res)).data);
    expect(me).toMatchObject({ is_anonymous: true, email_verified: false, is_admin: false, display_name: 'Maria Voluntária' });
    expect(me.email_masked).toBe('ma***@example.org');
    expect(JSON.stringify(me)).not.toContain('99999');
    expect((await request('/api/v1/me')).status).toBe(401);
  });

  it('PATCH /me only changes allowed fields; unknown territory rejected; no profile -> 404', async () => {
    const { request, users } = setup();
    const s = users.anonymous();
    expect((await request('/api/v1/me', { method: 'PATCH', token: s.token, json: { display_name: 'Novo Nome' } })).status).toBe(404);
    await request('/api/v1/registrations', { method: 'POST', token: s.token, json: registration() });
    const ok = await request('/api/v1/me', {
      method: 'PATCH',
      token: s.token,
      json: { display_name: 'Novo <i>Nome</i>', selected_territory_id: 'mg-3106200', is_admin: true },
    });
    expect((await body(ok)).data).toMatchObject({ display_name: 'Novo Nome', selected_territory_id: 'mg-3106200', is_admin: false });
    const bad = await request('/api/v1/me', { method: 'PATCH', token: s.token, json: { selected_territory_id: 'mg-9999999' } });
    expect(bad.status).toBe(400);
  });

  it('send-link answers neutrally even when the provider refuses', async () => {
    const { request, auth } = setup();
    auth.magicLinkOk = false;
    const res = await request('/api/v1/auth/send-link', { method: 'POST', json: { email: 'quem@example.org', turnstile_token: 'tok-1' } });
    expect(res.status).toBe(202);
    expect((await body(res)).data?.status).toBe('sent_if_exists');
  });

  it('send-link: 4th request in 10 min -> 429', async () => {
    const { request } = setup();
    let status = 0;
    for (let i = 0; i < 4; i++) {
      status = (await request('/api/v1/auth/send-link', { method: 'POST', json: { email: 'x@example.org', turnstile_token: `t-${i}` } })).status;
    }
    expect(status).toBe(429);
  });

  it('confirm-email: requires e-mail proof in THIS session, then promotes and revokes other sessions', async () => {
    const { request, users, auth } = setup();
    const s = users.anonymous();
    // anonymous session without e-mail proof (e.g. the original or a squatter session)
    s.user.email = 'maria@example.org';
    s.user.email_confirmed = true;
    const denied = await request('/api/v1/auth/confirm-email', { method: 'POST', token: s.token });
    expect(denied.status).toBe(403);
    expect(auth.promoted).toHaveLength(0);
    // session created by the magic link click
    s.user.amr_methods = ['otp'];
    const res = await request('/api/v1/auth/confirm-email', { method: 'POST', token: s.token });
    expect(res.status).toBe(200);
    expect((await body(res)).data).toMatchObject({ is_anonymous: false, email_verified: true, requires_session_refresh: true });
    expect(auth.promoted).toEqual([s.user.id]);
    expect(auth.signedOutOthers).toEqual([s.token]);
  });

  it('confirm-email without confirmed e-mail -> 403 EMAIL_NOT_VERIFIED', async () => {
    const { request, users } = setup();
    const res = await request('/api/v1/auth/confirm-email', { method: 'POST', token: users.anonymous().token });
    expect((await body(res)).error?.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('admin (T22, T15, T28 logic)', () => {
  it('T22: no session -> 401; non-admin -> 403 + minimised security log', async () => {
    const { request, users, repo } = setup();
    expect((await request('/api/v1/admin/queue')).status).toBe(401);
    const v = users.verified();
    const res = await request('/api/v1/admin/queue', { token: v.token, headers: { 'CF-Connecting-IP': '203.0.113.9' } });
    expect(res.status).toBe(403);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const ev = repo.abuse.find((e) => e.event_type === 'admin_denied');
    expect(ev).toBeDefined();
    expect(JSON.stringify(repo.abuse)).not.toContain('203.0.113.9');
    expect(JSON.stringify(repo.abuse)).not.toContain(v.user.id);
  });

  it('T15: admin without MFA (aal1) -> 403 outside local; allowed with explicit local bypass', async () => {
    const remote = setup({ APP_ENV: 'staging' });
    const a1 = remote.users.admin('aal1');
    expect((await remote.request('/api/v1/admin/queue', { token: a1.token })).status).toBe(403);
    const local = setup({ APP_ENV: 'local' });
    const a2 = local.users.admin('aal1');
    expect((await local.request('/api/v1/admin/queue', { token: a2.token })).status).toBe(200);
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
    const first = await request(`/api/v1/admin/groups/${id}/approve`, { method: 'POST', token: admin.token });
    expect(first.status).toBe(200);
    const second = await request(`/api/v1/admin/groups/${id}/approve`, { method: 'POST', token: admin.token });
    expect(second.status).toBe(409);
    expect(repo.groups).toHaveLength(1);
    expect((await body(await request('/api/v1/groups?territory_id=mg-3140001'))).data?.fallback).toBe('exact');
  });

  it('reject requires a reason; unknown ids -> 404', async () => {
    const { request, users } = setup();
    const admin = users.admin();
    const missing = await request('/api/v1/admin/groups/00000000-0000-4000-8000-0000000000aa/reject', { method: 'POST', token: admin.token, json: {} });
    expect(missing.status).toBe(400);
    const unknown = await request('/api/v1/admin/groups/00000000-0000-4000-8000-0000000000aa/reject', {
      method: 'POST',
      token: admin.token,
      json: { reason: 'spam evidente' },
    });
    expect(unknown.status).toBe(404);
  });

  it('T08: admin approves an activity -> appears publicly; reject of non-pending -> 409', async () => {
    const { request, users, repo } = setup();
    const admin = users.admin();
    const a = repo.seedActivity(repo.uuid(), { status: 'pending_review' });
    const res = await request(`/api/v1/admin/activities/${a.id}/approve`, { method: 'POST', token: admin.token });
    expect((await body(res)).data).toMatchObject({ status: 'published' });
    expect((await request(`/api/v1/activities/${a.id}`)).status).toBe(200);
    const rej = await request(`/api/v1/admin/activities/${a.id}/reject`, { method: 'POST', token: admin.token, json: { reason: 'tarde demais' } });
    expect(rej.status).toBe(409);
  });

  it('PATCH group validates the invite URL and is audited; managers stay private', async () => {
    const { request, users, repo } = setup();
    const admin = users.admin();
    const g = repo.addGroup('mg-3140001');
    const bad = await request(`/api/v1/admin/groups/${g.id}`, { method: 'PATCH', token: admin.token, json: { join_url: 'https://bit.ly/x', reason: 'troca' } });
    expect(bad.status).toBe(400);
    const off = await request(`/api/v1/admin/groups/${g.id}`, { method: 'PATCH', token: admin.token, json: { status: 'inactive', reason: 'link quebrado' } });
    expect((await body(off)).data?.status).toBe('inactive');
    expect(repo.audit.some((e) => e.action === 'group.update')).toBe(true);
    expect((await body(await request('/api/v1/groups?territory_id=mg-3140001'))).data?.fallback).toBe('none');
    const mgr = await request(`/api/v1/admin/groups/${g.id}/managers`, { method: 'POST', token: admin.token, json: { name: 'Fulano', phone: '123' } });
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
    expect(Object.keys(items[0]!).sort()).toEqual(['block_code', 'created_at', 'event_type', 'id', 'route']);
  });
});
