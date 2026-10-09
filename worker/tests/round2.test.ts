/**
 * Round 2 (BE-2): P-SEC-1, QA-1 F05/F09/F11/F12/F14/F16, I03, suspension and audited reveal.
 */
import { describe, expect, it, vi } from 'vitest';
import { MeResponse } from '../../shared/contracts/registration.ts';
import { AdminGroupProposal, AdminRevealContactResponse } from '../../shared/contracts/admin.ts';
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

describe('P-SEC-1: profile review after promotion', () => {
  async function registeredAndPromoted() {
    const s = setup();
    const a = s.users.anonymous();
    const reg = await s.request('/api/v1/registrations', {
      method: 'POST',
      token: a.token,
      json: registration({ email: 'vitima@example.org' }),
    });
    expect(reg.status).toBe(201);
    // magic-link session of the inbox owner
    a.user.email = 'vitima@example.org';
    a.user.email_confirmed = true;
    a.user.amr_methods = ['otp'];
    const conf = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: a.token });
    expect(conf.status).toBe(200);
    a.user.is_anonymous = false;
    a.user.jwt_is_anonymous = false;
    return { s, a, conf };
  }

  it('promotion sets the review flag; /me exposes masked phone and the flag', async () => {
    const { s, a, conf } = await registeredAndPromoted();
    expect((await body(conf)).data?.profile_review_required).toBe(true);
    const me = MeResponse.parse(
      (await body(await s.request('/api/v1/me', { token: a.token }))).data,
    );
    expect(me.profile_review_required).toBe(true);
    expect(me.phone_masked).toBe('+55 (31) 9****-**77');
    expect(JSON.stringify(me)).not.toContain('988887777');
  });

  it('confirm-email on an already permanent account does not raise the flag', async () => {
    const s = setup();
    const v = s.users.verified();
    const r = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: v.token });
    expect(r.status).toBe(200);
    expect((await body(r)).data?.profile_review_required).toBe(false);
  });

  it('PATCH /me {phone, profile_reviewed} edits own phone, clears the flag, audits without PII', async () => {
    const { s, a } = await registeredAndPromoted();
    const r = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: a.token,
      json: { phone: '(31) 96666-5544', profile_reviewed: true },
    });
    expect(r.status).toBe(200);
    const me = MeResponse.parse((await body(r)).data);
    expect(me.profile_review_required).toBe(false);
    expect(me.phone_masked).toBe('+55 (31) 9****-**44');
    expect(s.repo.profiles.get(a.user.id)?.phone_e164).toBe('+5531966665544');
    const actions = s.repo.audit.filter((e) => e.entity_id === a.user.id).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['profile.phone_change', 'profile.review']));
    expect(JSON.stringify(s.repo.audit)).not.toMatch(/96666|5544|vitima/);
  });

  it('phone is editable only by its owner; invalid phone -> 400', async () => {
    const s = setup();
    const owner = s.users.verified();
    const other = s.users.verified();
    const before = s.repo.profiles.get(owner.user.id)?.phone_e164;
    const r = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: other.token,
      json: { phone: '31955554444' },
    });
    expect(r.status).toBe(200);
    expect(s.repo.profiles.get(owner.user.id)?.phone_e164).toBe(before);
    expect(s.repo.profiles.get(other.user.id)?.phone_e164).toBe('+5531955554444');
    const bad = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: other.token,
      json: { phone: '1234' },
    });
    expect(bad.status).toBe(400);
    const noSession = await s.request('/api/v1/me', {
      method: 'PATCH',
      json: { phone: '31955554444' },
    });
    expect(noSession.status).toBe(401);
    const forged = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: other.token,
      json: { profile_reviewed: false },
    });
    expect(forged.status).toBe(400);
  });
});

describe('F09/F12: activity bounds', () => {
  async function organizer() {
    const s = setup();
    const v = s.users.verified();
    return { s, v };
  }

  it('POST: outside MG, > 366 days ahead, > 24 h long -> 400', async () => {
    const { s, v } = await organizer();
    for (const over of [
      { coordinates: [-38.5, -12.9] }, // Salvador/BA
      { coordinates: [-43.41, -24.0] },
      { starts_at: future(367), ends_at: null },
      { starts_at: future(3), ends_at: future(4.1) },
    ]) {
      const r = await s.request('/api/v1/activities', {
        method: 'POST',
        token: v.token,
        json: activityInput(over),
      });
      expect(r.status, JSON.stringify(over)).toBe(400);
    }
    const okRes = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput({ starts_at: future(365), ends_at: future(365.9) }),
    });
    expect(okRes.status).toBe(201);
  });

  it('PATCH: coordinates outside MG, far start or long duration -> 400', async () => {
    const { s, v } = await organizer();
    const row = s.repo.seedActivity(v.user.id, { status: 'pending_review' });
    for (const patch of [
      { coordinates: [2.35, 48.85] },
      { starts_at: '9999-12-30T00:00:00Z' },
      { ends_at: new Date(Date.parse(row.starts_at) + 25 * 3_600_000).toISOString() },
    ]) {
      const r = await s.request(`/api/v1/activities/${row.id}`, {
        method: 'PATCH',
        token: v.token,
        json: { version: row.version, ...patch },
      });
      expect(r.status, JSON.stringify(patch)).toBe(400);
    }
  });
});

describe('F14: Origin check on mutations', () => {
  const evil = { Origin: 'https://evil.example' };

  it('foreign Origin -> 403 (logged); PUBLIC_ORIGIN, ALLOWED_ORIGINS and no Origin pass', async () => {
    const s = setup({ ALLOWED_ORIGINS: 'https://preview.example, https://outra.example' });
    const row = s.repo.seedActivity(s.repo.uuid());
    const path = `/api/v1/activities/${row.id}/rsvp`;
    const denied = await s.request(path, { method: 'POST', headers: evil });
    expect(denied.status).toBe(403);
    expect((await body(denied)).error?.code).toBe('FORBIDDEN');
    expect(s.repo.abuse.some((e) => e.event_type === 'origin_denied')).toBe(true);
    expect(s.repo.rsvps).toHaveLength(0);
    for (const origin of ['http://127.0.0.1:8787', 'https://preview.example']) {
      const r = await s.request(path, { method: 'POST', headers: { Origin: origin } });
      expect(r.status, origin).toBe(200);
    }
    expect((await s.request(path, { method: 'POST' })).status).toBe(200);
    expect((await s.request(path, { method: 'POST', headers: { Origin: 'null' } })).status).toBe(
      403,
    );
  });

  it('GET with a foreign Origin is not blocked; loopback origins only accepted in local', async () => {
    const s = setup();
    expect((await s.request('/api/v1/health', { headers: evil })).status).toBe(200);
    const row = s.repo.seedActivity(s.repo.uuid());
    const loop = { Origin: 'http://localhost:5173' };
    expect(
      (await s.request(`/api/v1/activities/${row.id}/rsvp`, { method: 'POST', headers: loop }))
        .status,
    ).toBe(403);
    const l = setup({ APP_ENV: 'local' });
    const row2 = l.repo.seedActivity(l.repo.uuid());
    expect(
      (await l.request(`/api/v1/activities/${row2.id}/rsvp`, { method: 'POST', headers: loop }))
        .status,
    ).toBe(200);
  });
});

describe('F11: proposal idempotency', () => {
  async function admin(s: ReturnType<typeof setup>) {
    return s.users.admin('aal2').token;
  }

  it('a rejected proposal re-sent with the same content -> new pending proposal (201)', async () => {
    const s = setup();
    const first = await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() });
    expect(first.status).toBe(201);
    const id1 = String((await body(first)).data?.id);
    const dup = await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() });
    expect(dup.status).toBe(200);
    expect((await body(dup)).data?.id).toBe(id1);
    const rej = await s.request(`/api/v1/admin/groups/${id1}/reject`, {
      method: 'POST',
      token: await admin(s),
      json: { reason: 'link inválido' },
    });
    expect(rej.status).toBe(200);
    const again = await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() });
    expect(again.status).toBe(201);
    const j = await body(again);
    expect(j.data?.id).not.toBe(id1);
    expect(j.data?.status).toBe('pending');
  });

  it('approved proposals are never a dedupe target; content key is scoped to the day', async () => {
    const s = setup();
    const t = await admin(s);
    const p1 = await body(
      await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() }),
    );
    await s.request(`/api/v1/admin/groups/${String(p1.data?.id)}/approve`, {
      method: 'POST',
      token: t,
    });
    const after = await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() });
    expect(after.status).toBe(201);
    s.advance(86_400_000);
    const nextDay = await s.request('/api/v1/groups/proposals', {
      method: 'POST',
      json: proposal(),
    });
    expect(nextDay.status).toBe(201);
  });

  it('explicit idempotency_key dedupes for 24 h only', async () => {
    const s = setup();
    const p = proposal({ idempotency_key: 'chave-explicita-123' });
    expect(
      (await s.request('/api/v1/groups/proposals', { method: 'POST', json: { ...p } })).status,
    ).toBe(201);
    s.advance(23 * 3_600_000);
    expect(
      (
        await s.request('/api/v1/groups/proposals', {
          method: 'POST',
          json: { ...p, turnstile_token: 'tok-2' },
        })
      ).status,
    ).toBe(200);
    s.advance(2 * 3_600_000);
    expect(
      (
        await s.request('/api/v1/groups/proposals', {
          method: 'POST',
          json: { ...p, turnstile_token: 'tok-3' },
        })
      ).status,
    ).toBe(201);
  });
});

describe('F16: edge cache and light limits', () => {
  it('public detail is cached by URL (HIT) and purged when an admin suspends it', async () => {
    const s = setup({}, { edgeCache: true });
    const row = s.repo.seedActivity(s.repo.uuid());
    const url = `/api/v1/activities/${row.id}`;
    const a = await s.request(url);
    expect(a.status).toBe(200);
    expect(a.headers.get('X-Cache')).toBe('MISS');
    const b = await s.request(url);
    expect(b.headers.get('X-Cache')).toBe('HIT');
    expect(b.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(b.headers.get('X-Request-Id')).not.toBe(a.headers.get('X-Request-Id'));
    const sus = await s.request(`/api/v1/admin/activities/${row.id}/suspend`, {
      method: 'POST',
      token: s.users.admin('aal2').token,
      json: { reason: 'conteúdo indevido' },
    });
    expect(sus.status).toBe(200);
    expect((await s.request(url)).status).toBe(404);
  });

  it('non-200 responses are never stored; works without a Cache API', async () => {
    const s = setup({}, { edgeCache: true });
    const missing = '/api/v1/activities/00000000-0000-4000-8000-00000000ffff';
    expect((await s.request(missing)).status).toBe(404);
    expect(s.edgeCache?.puts).toBe(0);
    const n = setup();
    expect((await n.request('/api/v1/territories/mg-3140001')).status).toBe(200);
  });

  it('PATCH /me and confirm-email: 61st request in 10 min -> 429', async () => {
    const s = setup();
    const v = s.users.verified();
    let last = 0;
    for (let i = 0; i < 61; i++)
      last = (
        await s.request('/api/v1/me', {
          method: 'PATCH',
          token: v.token,
          json: { contact_opt_in: true },
        })
      ).status;
    expect(last).toBe(429);
    let lastConfirm = 0;
    for (let i = 0; i < 61; i++)
      lastConfirm = (
        await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: v.token })
      ).status;
    expect(lastConfirm).toBe(429);
  });
});

describe('I03: RSVP_DEVICE_SECRET validated on first request', () => {
  it('short or placeholder secret -> 500 INTERNAL_ERROR + misconfigured log (no value)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      for (const secret of ['curto', 'change-me-to-a-random-32-byte-string']) {
        const s = setup({ RSVP_DEVICE_SECRET: secret });
        const r = await s.request('/api/v1/health');
        expect(r.status).toBe(500);
        expect((await body(r)).error?.code).toBe('INTERNAL_ERROR');
        const logs = spy.mock.calls.map((c) => String(c[0]));
        expect(logs.some((l) => l.includes('"misconfigured"'))).toBe(true);
        expect(logs.join('\n')).not.toContain(secret);
      }
    } finally {
      spy.mockRestore();
    }
    expect((await setup().request('/api/v1/health')).status).toBe(200);
  });
});

describe('suspension (admin, audited)', () => {
  it('group: reason required, non-admin/anonymous denied, disappears publicly, unsuspend -> active', async () => {
    const s = setup();
    const g = s.repo.addGroup('mg-3140001');
    const path = `/api/v1/admin/groups/${g.id}/suspend`;
    const admin = s.users.admin('aal2').token;
    expect((await s.request(path, { method: 'POST', json: { reason: 'x' } })).status).toBe(401);
    expect(
      (
        await s.request(path, {
          method: 'POST',
          token: s.users.verified().token,
          json: { reason: 'abuso' },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await s.request(path, {
          method: 'POST',
          token: s.users.anonymous().token,
          json: { reason: 'abuso' },
        })
      ).status,
    ).toBe(403);
    expect((await s.request(path, { method: 'POST', token: admin, json: {} })).status).toBe(400);
    const r = await s.request(path, { method: 'POST', token: admin, json: { reason: 'abuso' } });
    expect(r.status).toBe(200);
    expect((await body(r)).data?.status).toBe('suspended');
    const pub = await body(await s.request('/api/v1/groups?territory_id=mg-3140001'));
    expect(pub.data?.items).toHaveLength(0);
    expect(
      (await s.request(path, { method: 'POST', token: admin, json: { reason: 'de novo' } })).status,
    ).toBe(409);
    expect(
      (
        await s.request('/api/v1/admin/groups/00000000-0000-4000-8000-00000000ffff/suspend', {
          method: 'POST',
          token: admin,
          json: { reason: 'abuso' },
        })
      ).status,
    ).toBe(404);
    const un = await s.request(`/api/v1/admin/groups/${g.id}/unsuspend`, {
      method: 'POST',
      token: admin,
      json: { reason: 'revisado' },
    });
    expect((await body(un)).data?.status).toBe('active');
    expect(
      (await body(await s.request('/api/v1/groups?territory_id=mg-3140001'))).data?.items,
    ).toHaveLength(1);
    expect(s.repo.audit.map((e) => e.action)).toEqual(
      expect.arrayContaining(['group.suspend', 'group.unsuspend']),
    );
  });

  it('activity: suspended is not public, refuses RSVP and edits; unsuspend -> pending_review', async () => {
    const s = setup();
    const owner = s.users.verified();
    const row = s.repo.seedActivity(owner.user.id);
    const admin = s.users.admin('aal2').token;
    const sus = await s.request(`/api/v1/admin/activities/${row.id}/suspend`, {
      method: 'POST',
      token: admin,
      json: { reason: 'denúncia' },
    });
    expect(sus.status).toBe(200);
    expect((await s.request(`/api/v1/activities/${row.id}`)).status).toBe(404);
    expect((await body(await s.request('/api/v1/activities'))).data?.items).toHaveLength(0);
    expect((await s.request(`/api/v1/activities/${row.id}/rsvp`, { method: 'POST' })).status).toBe(
      404,
    );
    const edit = await s.request(`/api/v1/activities/${row.id}`, {
      method: 'PATCH',
      token: owner.token,
      json: { version: row.version, title: 'Tentando reabrir' },
    });
    expect(edit.status).toBe(409);
    const q = await body(
      await s.request('/api/v1/admin/queue?kind=activities&status=suspended', { token: admin }),
    );
    expect(q.data?.items).toHaveLength(1);
    const un = await s.request(`/api/v1/admin/activities/${row.id}/unsuspend`, {
      method: 'POST',
      token: admin,
      json: { reason: 'resolvido' },
    });
    expect((await body(un)).data?.status).toBe('pending_review');
    expect((await s.request(`/api/v1/activities/${row.id}`)).status).toBe(404);
  });
});

describe('audited contact reveal', () => {
  async function withProposal() {
    const s = setup({ APP_ENV: 'local' });
    const p = await body(
      await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() }),
    );
    return { s, id: String(p.data?.id) };
  }

  it('admin gets full contact; the reveal is audited', async () => {
    const { s, id } = await withProposal();
    const admin = s.users.admin('aal2');
    const r = await s.request(`/api/v1/admin/group-proposals/${id}/reveal-contact`, {
      method: 'POST',
      token: admin.token,
      json: { reason: 'contato para validar o grupo' },
    });
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('no-store');
    const data = AdminRevealContactResponse.parse((await body(r)).data);
    expect(data).toMatchObject({
      proposal_id: id,
      proposer_email: 'proponente@example.org',
      proposer_phone: '+5531977771234',
    });
    expect(
      s.repo.audit.some(
        (e) =>
          e.action === 'proposal.reveal_contact' && e.entity_id === id && e.actor === admin.user.id,
      ),
    ).toBe(true);
  });

  it('D35: aal1 admin gets the contact (audited) in staging/production too', async () => {
    for (const APP_ENV of ['staging', 'production']) {
      const s = setup({ APP_ENV, WRITES_ENABLED: 'true' });
      const p = await body(
        await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() }),
      );
      const id = String(p.data?.id);
      const admin = s.users.admin('aal1');
      const r = await s.request(`/api/v1/admin/group-proposals/${id}/reveal-contact`, {
        method: 'POST',
        token: admin.token,
      });
      expect([APP_ENV, r.status]).toEqual([APP_ENV, 200]);
      expect(AdminRevealContactResponse.parse((await body(r)).data).proposer_email).toBe(
        'proponente@example.org',
      );
      expect(
        s.repo.audit.some(
          (e) =>
            e.action === 'proposal.reveal_contact' &&
            e.entity_id === id &&
            e.actor === admin.user.id,
        ),
      ).toBe(true);
    }
  });

  it('non-admin, anonymous and unconfirmed-e-mail admin -> 403 without leak or audit; unknown 404', async () => {
    const { s, id } = await withProposal();
    const path = `/api/v1/admin/group-proposals/${id}/reveal-contact`;
    expect((await s.request(path, { method: 'POST' })).status).toBe(401);
    for (const token of [
      s.users.verified().token,
      s.users.anonymous().token,
      s.users.admin('aal1', undefined, { emailConfirmed: false }).token,
    ]) {
      const r = await s.request(path, { method: 'POST', token });
      expect(r.status).toBe(403);
      expect(JSON.stringify(await body(r))).not.toContain('proponente@');
    }
    expect(s.repo.audit.some((e) => e.action === 'proposal.reveal_contact')).toBe(false);
    expect(
      (
        await s.request(
          '/api/v1/admin/group-proposals/00000000-0000-4000-8000-00000000ffff/reveal-contact',
          { method: 'POST', token: s.users.admin('aal2').token },
        )
      ).status,
    ).toBe(404);
  });

  it('queue items carry group_id after approval and keep contact masked', async () => {
    const { s, id } = await withProposal();
    const admin = s.users.admin('aal2').token;
    const before = await body(await s.request('/api/v1/admin/queue?kind=groups', { token: admin }));
    expect(AdminGroupProposal.parse(before.data?.items?.[0]).group_id).toBeNull();
    const ap = await body(
      await s.request(`/api/v1/admin/groups/${id}/approve`, { method: 'POST', token: admin }),
    );
    const after = await body(
      await s.request('/api/v1/admin/queue?kind=groups&status=active', { token: admin }),
    );
    const item = AdminGroupProposal.parse(after.data?.items?.[0]);
    expect(item.group_id).toBe(ap.data?.group_id);
    expect(item.proposer_email_masked).not.toContain('proponente@');
  });
});

describe('P-SEC-1: organizer actions blocked while profile review is pending', () => {
  it('POST /activities -> 403 until PATCH /me {profile_reviewed:true}', async () => {
    const s = setup();
    const v = s.users.verified();
    await s.repo.updateProfile(v.user.id, { review_required: true });
    const blocked = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect(blocked.status).toBe(403);
    const reviewed = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: v.token,
      json: { profile_reviewed: true },
    });
    expect(reviewed.status).toBe(200);
    const ok = await s.request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect(ok.status).toBe(201);
  });
});
