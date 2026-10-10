import { describe, expect, it } from 'vitest';
import { body, setup } from './fakes.ts';

const BASE = '/api/v1/admin/admins';

function withTarget(t: ReturnType<typeof setup>, over: { verified?: boolean } = {}) {
  const target = t.users.signedUp('nova.pessoa@example.org');
  if (over.verified === false) {
    t.auth.people.set(target.user.id, {
      id: target.user.id,
      email: 'nova.pessoa@example.org',
      email_verified: false,
      banned: false,
    });
  }
  return target;
}

describe('admin management (/admin/admins)', () => {
  it('lists admins with masked e-mails, self flag and missing users', async () => {
    const t = setup();
    const a = t.users.admin();
    const b = t.users.admin();
    t.repo.adminMeta.set(b.user.id, { created_at: '2026-10-01T00:00:00Z', created_by: a.user.id });
    t.auth.people.delete(b.user.id); // removed from Clerk
    const res = await t.request(BASE, { token: a.token });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    const items = (await body(res)).data!.items as Record<string, unknown>[];
    const self = items.find((i) => i.user_id === a.user.id)!;
    const gone = items.find((i) => i.user_id === b.user.id)!;
    expect(self.is_self).toBe(true);
    expect(String(self.email_masked)).toMatch(/^[a-z0-9]{2}\*\*\*@example\.org$/);
    expect(gone.status).toBe('missing');
    expect(gone.email_masked).toBeNull();
    expect(String(gone.created_by_masked)).toMatch(/\*\*\*@example\.org$/);
  });

  it('grants an admin: 201, audited without PII, target becomes admin', async () => {
    const t = setup();
    const a = t.users.admin();
    const target = withTarget(t);
    const res = await t.request(BASE, {
      method: 'POST',
      token: a.token,
      json: { email: '  Nova.Pessoa@Example.org ' },
    });
    expect(res.status).toBe(201);
    const text = JSON.stringify(await res.clone().json());
    expect(text).not.toContain('nova.pessoa@');
    const data = (await body(res)).data!;
    expect(data).toMatchObject({ user_id: target.user.id, created: true });
    expect(data.email_masked).toBe('no***@example.org');
    expect(t.repo.admins.has(target.user.id)).toBe(true);
    expect(t.repo.adminMeta.get(target.user.id)?.created_by).toBe(a.user.id);
    expect(t.repo.audit.filter((e) => e.action === 'admin.grant')).toEqual([
      { actor: a.user.id, action: 'admin.grant', entity_id: target.user.id, reason: null },
    ]);
    // idempotent: second call 200, no second audit row
    const again = await t.request(BASE, {
      method: 'POST',
      token: a.token,
      json: { email: 'nova.pessoa@example.org' },
    });
    expect(again.status).toBe(200);
    expect((await body(again)).data!.created).toBe(false);
    expect(t.repo.audit.filter((e) => e.action === 'admin.grant')).toHaveLength(1);
  });

  it('unknown e-mail -> neutral 404 and nothing stored', async () => {
    const t = setup();
    const a = t.users.admin();
    const res = await t.request(BASE, {
      method: 'POST',
      token: a.token,
      json: { email: 'ninguem@example.org' },
    });
    expect(res.status).toBe(404);
    expect((await body(res)).error?.code).toBe('NOT_FOUND');
    expect(t.repo.admins.size).toBe(1);
    expect(t.repo.audit.some((e) => e.action === 'admin.grant')).toBe(false);
  });

  it('unverified primary e-mail -> 400 VALIDATION_ERROR with field, nothing stored', async () => {
    const t = setup();
    const a = t.users.admin();
    const target = withTarget(t, { verified: false });
    const res = await t.request(BASE, {
      method: 'POST',
      token: a.token,
      json: { email: 'nova.pessoa@example.org' },
    });
    expect(res.status).toBe(400);
    const json = await body(res);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(json.error?.fields?.email).toBeDefined();
    expect(t.repo.admins.has(target.user.id)).toBe(false);
  });

  it('invalid body -> 400', async () => {
    const t = setup();
    const a = t.users.admin();
    const res = await t.request(BASE, { method: 'POST', token: a.token, json: { email: 'nope' } });
    expect(res.status).toBe(400);
  });

  it('revokes an admin (audited); self -> 400; malformed/unknown id -> 404', async () => {
    const t = setup();
    const a = t.users.admin();
    const b = t.users.admin();
    const self = await t.request(`${BASE}/${a.user.id}`, { method: 'DELETE', token: a.token });
    expect(self.status).toBe(400);
    expect(t.repo.admins.has(a.user.id)).toBe(true);

    const bad = await t.request(`${BASE}/not-an-id`, { method: 'DELETE', token: a.token });
    expect(bad.status).toBe(404);
    const unknown = await t.request(`${BASE}/user_doesNotExist1`, {
      method: 'DELETE',
      token: a.token,
    });
    expect(unknown.status).toBe(404);

    const res = await t.request(`${BASE}/${b.user.id}`, { method: 'DELETE', token: a.token });
    expect(res.status).toBe(200);
    expect((await body(res)).data!).toEqual({ user_id: b.user.id, removed: true });
    expect(t.repo.admins.has(b.user.id)).toBe(false);
    expect(t.repo.audit.filter((e) => e.action === 'admin.revoke')).toEqual([
      { actor: a.user.id, action: 'admin.revoke', entity_id: b.user.id, reason: null },
    ]);
  });

  it('last admin: Worker answers 409 when the list holds only the target', async () => {
    const t = setup();
    const a = t.users.admin();
    // The actor is an admin (checked from the table) but the list the route sees has one row:
    // emulate a stale/racing state by making listAdmins return only the target.
    const only = 'user_onlyAdmin0001';
    t.repo.listAdmins = async () => [
      { user_id: only, created_at: '2026-10-01T00:00:00Z', created_by: null },
    ];
    const res = await t.request(`${BASE}/${only}`, { method: 'DELETE', token: a.token });
    expect(res.status).toBe(409);
    expect((await body(res)).error?.code).toBe('CONFLICT');
    expect(t.repo.audit.some((e) => e.action === 'admin.revoke')).toBe(false);
  });

  it('database-level guard (fake mirrors svc_remove_admin): emptying the table -> CONFLICT', async () => {
    const t = setup();
    const a = t.users.admin();
    await expect(t.repo.removeAdmin(a.user.id, 'x')).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(t.repo.admins.has(a.user.id)).toBe(true);
  });

  it('non-admin, unverified admin and anonymous callers are refused', async () => {
    const t = setup();
    t.users.admin();
    const member = t.users.verified();
    const unverifiedAdmin = t.users.admin('aal1', undefined, { emailConfirmed: false });
    for (const token of [member.token, unverifiedAdmin.token]) {
      expect((await t.request(BASE, { token })).status).toBe(403);
      const post = await t.request(BASE, {
        method: 'POST',
        token,
        json: { email: 'x@example.org' },
      });
      expect(post.status).toBe(403);
      const del = await t.request(`${BASE}/user_abc123`, { method: 'DELETE', token });
      expect(del.status).toBe(403);
    }
    expect((await t.request(BASE)).status).toBe(401);
    expect(t.repo.admins.size).toBe(2);
  });

  it('re-checks Clerk on every call (fresh): a banned admin is refused immediately', async () => {
    const t = setup();
    const a = t.users.admin();
    expect((await t.request(BASE, { token: a.token })).status).toBe(200);
    const info = t.auth.people.get(a.user.id)!;
    t.auth.people.set(a.user.id, { ...info, banned: true });
    expect((await t.request(BASE, { token: a.token })).status).toBe(401);
  });

  it('rate-limits writes per user (admin_write 30/10min)', async () => {
    const t = setup();
    const a = t.users.admin();
    let last = 0;
    for (let i = 0; i < 31; i++) {
      const r = await t.request(BASE, {
        method: 'POST',
        token: a.token,
        json: { email: 'ninguem@example.org' },
      });
      last = r.status;
    }
    expect(last).toBe(429);
  });
});
