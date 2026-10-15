import { describe, expect, it } from 'vitest';
import { body, setup } from './fakes.ts';

type T = ReturnType<typeof setup>;

/** The home registration (D48/D49), stored as the public route would store it. */
async function register(t: T, email: string, over: Record<string, unknown> = {}) {
  await t.repo.createVolunteerSignup({
    display_name: 'Maria Voluntária',
    email,
    phone: '+5531999998888',
    territory_id: 'mg-3140001-centro',
    consent_version: 'v1',
    contact_opt_in: true,
    ...over,
  });
}

const ACTIVITY = {
  title: 'Panfletagem no centro',
  type: 'panfletagem',
  description: 'Distribuição de material da campanha na praça.',
  territory_id: 'mg-3140001',
  public_address: 'Praça Gomes Freire, Mariana',
  coordinates: [-43.416, -20.378],
  location_confirmed: true,
  starts_at: '2026-10-20T13:00:00.000Z',
  ends_at: null,
  timezone: 'America/Sao_Paulo',
  public_contact_opt_in: false,
};

describe('D49: login linked to the registration by verified e-mail', () => {
  it('login of an e-mail WITH a registration becomes organizer via GET /me (profile from the registration)', async () => {
    const t = setup();
    await register(t, 'maria.silva@example.org');
    const s = t.users.signedUp('maria.silva@example.org');
    const res = await t.request('/api/v1/me', { token: s.token });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const me = (await body(res)).data;
    expect(me).toMatchObject({
      user_id: s.user.id,
      display_name: 'Maria Voluntária',
      email_verified: true,
      registration_required: false,
      selected_territory_id: 'mg-3140001-centro',
    });
    expect(me?.email_masked).toBe('ma***@example.org');
    expect(JSON.stringify(me)).not.toContain('99999');
    const profile = t.repo.profiles.get(s.user.id);
    expect(profile).toMatchObject({
      email_contact: 'maria.silva@example.org',
      phone_e164: '+5531999998888',
      email_verification_state: 'verified',
      account_state: 'active',
    });
    expect(t.repo.volunteers.get('maria.silva@example.org')?.user_id).toBe(s.user.id);
    expect(t.repo.audit.filter((a) => a.action === 'organizer.link')).toEqual([
      { actor: s.user.id, action: 'organizer.link', entity_id: s.user.id, reason: null },
    ]);
    // and can organize right away
    const act = await t.request('/api/v1/activities', {
      method: 'POST',
      token: s.token,
      json: ACTIVITY,
    });
    expect(act.status).toBe(201);
  });

  it('link is idempotent: repeated /me and organizer calls keep ONE profile and ONE link', async () => {
    const t = setup();
    await register(t, 'idem@example.org');
    const s = t.users.signedUp('idem@example.org');
    for (let i = 0; i < 3; i++) await t.request('/api/v1/me', { token: s.token });
    await t.request('/api/v1/my-activities', { token: s.token });
    expect(t.repo.profiles.size).toBe(1);
    expect([...t.repo.volunteers.values()].filter((v) => v.user_id === s.user.id)).toHaveLength(1);
    expect(t.repo.audit.filter((a) => a.action === 'organizer.link')).toHaveLength(1);
  });

  it('the first organizer action links too (no prior GET /me)', async () => {
    const t = setup();
    await register(t, 'direto@example.org');
    const s = t.users.signedUp('direto@example.org');
    const res = await t.request('/api/v1/activities', {
      method: 'POST',
      token: s.token,
      json: ACTIVITY,
    });
    expect(res.status).toBe(201);
    expect(t.repo.profiles.has(s.user.id)).toBe(true);
  });

  it('login WITHOUT a registration works but is not organizer: /me registration_required, 403 on organizer routes', async () => {
    const t = setup();
    const s = t.users.signedUp('semcadastro@example.org');
    const me = (await body(await t.request('/api/v1/me', { token: s.token }))).data;
    expect(me).toMatchObject({ registration_required: true, display_name: null });
    const act = await t.request('/api/v1/activities', {
      method: 'POST',
      token: s.token,
      json: ACTIVITY,
    });
    expect(act.status).toBe(403);
    expect((await body(act)).error?.message).toMatch(/cadastro/);
    expect((await t.request('/api/v1/my-activities', { token: s.token })).status).toBe(403);
    expect(t.repo.profiles.size).toBe(0);
  });

  it('an UNVERIFIED Clerk e-mail never links (not even with a matching registration)', async () => {
    const t = setup();
    await register(t, 'pendente@example.org');
    const s = t.users.unverified('pendente@example.org');
    const me = (await body(await t.request('/api/v1/me', { token: s.token }))).data;
    expect(me).toMatchObject({ email_verified: false, registration_required: true });
    const act = await t.request('/api/v1/activities', {
      method: 'POST',
      token: s.token,
      json: ACTIVITY,
    });
    expect(act.status).toBe(403);
    expect((await body(act)).error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(t.repo.linkCalls).toEqual([]);
    expect(t.repo.profiles.size).toBe(0);
    expect(t.repo.volunteers.get('pendente@example.org')?.user_id).toBeNull();
  });

  it('a registration linked to ANOTHER live organizer is not taken over', async () => {
    const t = setup();
    await register(t, 'dono@example.org');
    const owner = t.users.signedUp('dono@example.org');
    await t.request('/api/v1/me', { token: owner.token });
    const other = t.users.signedUp('dono@example.org');
    const me = (await body(await t.request('/api/v1/me', { token: other.token }))).data;
    expect(me?.registration_required).toBe(true);
    expect(t.repo.volunteers.get('dono@example.org')?.user_id).toBe(owner.user.id);
    expect(t.repo.profiles.has(other.user.id)).toBe(false);
  });

  it('the public registration route does not change because of a session (no PII, same answer)', async () => {
    const t = setup();
    const s = t.users.signedUp('qualquer@example.org');
    const res = await t.request('/api/v1/registrations', {
      method: 'POST',
      token: s.token,
      json: {
        display_name: 'Pessoa',
        email: 'qualquer@example.org',
        phone: '(31) 99999-8888',
        territory_id: 'mg-3140001',
        terms_accepted: true,
        contact_opt_in: false,
        consent_version: 'v1',
        turnstile_token: 'tok-public-1234567',
      },
    });
    expect((await body(res)).data).toEqual({ territory_id: 'mg-3140001', status: 'received' });
    expect(t.repo.profiles.size).toBe(0);
  });

  it('POST /registrations/account no longer exists (D49)', async () => {
    const t = setup();
    const s = t.users.signedUp();
    const res = await t.request('/api/v1/registrations/account', {
      method: 'POST',
      token: s.token,
      json: {},
    });
    expect(res.status).toBe(404);
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
});

describe('me (ADR 0005)', () => {
  it('GET /me after registration + login: masked e-mail, verified, not anonymous, no review, no-store', async () => {
    const t = setup();
    const { request, users } = t;
    await register(t, 'maria.silva@example.org');
    const s = users.signedUp('maria.silva@example.org');
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
    const t = setup();
    const { request, users } = t;
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
    await register(t, s.user.email!);
    await request('/api/v1/me', { token: s.token }); // links the login (D49)
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
