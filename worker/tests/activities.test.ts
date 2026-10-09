import { describe, expect, it } from 'vitest';
import { MyActivity, PublicActivity } from '../../shared/contracts/activities.ts';
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
  public_contact_opt_in: true,
  public_contact_type: 'whatsapp',
  public_contact_value: '(31) 98888-7777',
  ...over,
});

function deviceCookie(res: Response): string {
  const raw = res.headers.get('Set-Cookie') ?? '';
  const m = /mm_device=([^;]+)/.exec(raw);
  if (!m) throw new Error('no device cookie');
  return `mm_device=${m[1]}`;
}

describe('public activities', () => {
  it('lists published + cancelled only, without creator or moderation fields', async () => {
    const { request, repo } = setup();
    const creator = repo.uuid();
    repo.seedActivity(creator);
    repo.seedActivity(creator, { status: 'pending_review', title: 'Pendente secreta' });
    repo.seedActivity(creator, { status: 'rejected', title: 'Rejeitada secreta' });
    repo.seedActivity(creator, { status: 'cancelled', title: 'Cancelada pública' });
    const res = await request('/api/v1/activities');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    const text = await res.text();
    const items = (JSON.parse(text) as { data: { items: unknown[] } }).data.items.map((i) =>
      PublicActivity.parse(i),
    );
    expect(items.map((i) => i.title).sort()).toEqual([
      'Cancelada pública',
      'Panfletagem no centro',
    ]);
    expect(text).not.toContain(creator);
    expect(text).not.toContain('creator_user_id');
    expect(text).not.toContain('nota interna de moderação');
    expect(text).not.toContain('Pendente secreta');
  });

  it('validates bbox and paginates with an opaque cursor', async () => {
    const { request, repo } = setup();
    const creator = repo.uuid();
    for (let i = 0; i < 3; i++) repo.seedActivity(creator, { starts_at: future(i + 1) });
    expect((await request('/api/v1/activities?bbox=-50,-25,-30,-10')).status).toBe(400); // too large
    expect((await request('/api/v1/activities?bbox=1,2,3')).status).toBe(400);
    const p1 = await body(await request('/api/v1/activities?limit=2&bbox=-44,-21,-43,-20'));
    expect(p1.data?.items).toHaveLength(2);
    const cursor = String(p1.data?.next_cursor);
    const p2 = await body(
      await request(`/api/v1/activities?limit=2&cursor=${encodeURIComponent(cursor)}`),
    );
    expect(p2.data?.items).toHaveLength(1);
    expect(p2.data?.next_cursor).toBeNull();
    expect((await request('/api/v1/activities?cursor=garbage')).status).toBe(400);
  });

  it('detail: pending/unknown/invalid ids -> 404', async () => {
    const { request, repo } = setup();
    const pending = repo.seedActivity(repo.uuid(), { status: 'pending_review' });
    expect((await request(`/api/v1/activities/${pending.id}`)).status).toBe(404);
    expect((await request('/api/v1/activities/00000000-0000-4000-8000-ffffffffffff')).status).toBe(
      404,
    );
    expect((await request('/api/v1/activities/not-a-uuid')).status).toBe(404);
  });
});

describe('organizer flow (T06, T07, T16, T21, T27)', () => {
  it('T06: Clerk session with unverified e-mail cannot create -> 403 EMAIL_NOT_VERIFIED; no session -> 401', async () => {
    const { request, users, repo } = setup();
    const anon = users.unverified();
    const res = await request('/api/v1/activities', {
      method: 'POST',
      token: anon.token,
      json: activityInput(),
    });
    expect(res.status).toBe(403);
    expect((await body(res)).error?.code).toBe('EMAIL_NOT_VERIFIED');
    expect(
      (await request('/api/v1/activities', { method: 'POST', json: activityInput() })).status,
    ).toBe(401);
    expect(repo.activities).toHaveLength(0);
  });

  it('verified in Clerk but the profile is not verified in the database -> 403', async () => {
    const { request, users, repo } = setup();
    const v = users.verified();
    repo.profiles.get(v.user.id)!.email_verification_state = 'pending';
    const res = await request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput(),
    });
    expect((await body(res)).error?.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('T07: verified organizer creates -> pending_review, invisible to the public; T16 HTML neutralised', async () => {
    const { request, users } = setup();
    const v = users.verified();
    const res = await request('/api/v1/activities', {
      method: 'POST',
      token: v.token,
      json: activityInput({
        title: '<b>Mutirão</b> no bairro',
        description: 'Venha! <script>alert(1)</script><img src=x onerror=alert(2)> Traga água.',
      }),
    });
    expect(res.status).toBe(201);
    const created = MyActivity.parse((await body(res)).data);
    expect(created.status).toBe('pending_review');
    expect(created.title).toBe('Mutirão no bairro');
    expect(created.description_sanitized).not.toMatch(/[<>]/);
    expect(created.contact_public).toEqual({ type: 'whatsapp', value: '+5531988887777' });
    const list = await (await request('/api/v1/activities')).text();
    expect(list).not.toContain(created.id);
    expect((await request(`/api/v1/activities/${created.id}`)).status).toBe(404);
    const mine = await body(await request('/api/v1/my-activities', { token: v.token }));
    expect(mine.data?.items?.[0]?.id).toBe(created.id);
  });

  it('rejects past dates, ends before start, bad contact and unknown territory', async () => {
    const { request, users } = setup();
    const v = users.verified();
    const cases: [Record<string, unknown>, string][] = [
      [{ starts_at: '2020-01-01T10:00:00Z', ends_at: null }, 'starts_at'],
      [{ ends_at: future(2) }, 'ends_at'],
      [{ public_contact_value: 'abc' }, 'public_contact_value'],
      [{ territory_id: 'mg-9999999' }, 'territory_id'],
      [{ location_confirmed: false }, 'location_confirmed'],
    ];
    for (const [over, field] of cases) {
      const res = await request('/api/v1/activities', {
        method: 'POST',
        token: v.token,
        json: activityInput(over),
      });
      expect(res.status, field).toBe(400);
      expect((await body(res)).error?.fields?.[field], field).toBeDefined();
    }
  });

  it('T21: sensitive edit of a published activity goes back to review; version is enforced', async () => {
    const { request, users, repo } = setup();
    const v = users.verified();
    const a = repo.seedActivity(v.user.id);
    const stale = await request(`/api/v1/activities/${a.id}`, {
      method: 'PATCH',
      token: v.token,
      json: { version: 99, title: 'Novo título aqui' },
    });
    expect(stale.status).toBe(409);
    const res = await request(`/api/v1/activities/${a.id}`, {
      method: 'PATCH',
      token: v.token,
      json: { version: 1, starts_at: future(5), ends_at: null },
    });
    expect(res.status).toBe(200);
    const updated = MyActivity.parse((await body(res)).data);
    expect(updated.status).toBe('pending_review');
    expect(updated.version).toBe(2);
    expect((await request(`/api/v1/activities/${a.id}`)).status).toBe(404);
  });

  it('T27: turning the public contact off hides it immediately; non-sensitive edit keeps it published', async () => {
    const { request, users, repo } = setup();
    const v = users.verified();
    const a = repo.seedActivity(v.user.id);
    expect((await body(await request(`/api/v1/activities/${a.id}`))).data?.contact_public).toEqual({
      type: 'instagram',
      value: '@organizador',
    });
    const res = await request(`/api/v1/activities/${a.id}`, {
      method: 'PATCH',
      token: v.token,
      json: { version: 1, public_contact_opt_in: false },
    });
    expect((await body(res)).data?.status).toBe('published');
    const pub = await request(`/api/v1/activities/${a.id}`);
    const text = await pub.text();
    expect(
      (JSON.parse(text) as { data: { contact_public: unknown } }).data.contact_public,
    ).toBeNull();
    expect(text).not.toContain('@organizador');
  });

  it('PATCH without the contact keys does not silently drop the contact (Zod default workaround)', async () => {
    const { request, users, repo } = setup();
    const v = users.verified();
    const a = repo.seedActivity(v.user.id);
    await request(`/api/v1/activities/${a.id}`, {
      method: 'PATCH',
      token: v.token,
      json: { version: 1, type: 'encontro' },
    });
    expect(
      (await body(await request(`/api/v1/activities/${a.id}`))).data?.contact_public,
    ).not.toBeNull();
  });

  it("another organizer cannot edit or cancel someone else's activity (404)", async () => {
    const { request, users, repo } = setup();
    const owner = users.verified();
    const other = users.verified();
    const a = repo.seedActivity(owner.user.id);
    expect(
      (
        await request(`/api/v1/activities/${a.id}`, {
          method: 'PATCH',
          token: other.token,
          json: { version: 1, title: 'Sequestrado!' },
        })
      ).status,
    ).toBe(404);
    expect(
      (await request(`/api/v1/activities/${a.id}/cancel`, { method: 'POST', token: other.token }))
        .status,
    ).toBe(404);
    expect(repo.activities[0]!.status).toBe('published');
  });

  it('author cancels (audited); cancelled activity cannot be edited again', async () => {
    const { request, users, repo } = setup();
    const v = users.verified();
    const a = repo.seedActivity(v.user.id);
    const res = await request(`/api/v1/activities/${a.id}/cancel`, {
      method: 'POST',
      token: v.token,
      json: { reason: 'chuva forte' },
    });
    expect((await body(res)).data?.status).toBe('cancelled');
    expect(repo.audit.some((e) => e.action === 'activity.cancel' && e.entity_id === a.id)).toBe(
      true,
    );
    expect(
      (await request(`/api/v1/activities/${a.id}/cancel`, { method: 'POST', token: v.token }))
        .status,
    ).toBe(409);
  });

  it('my-activities requires a verified organizer', async () => {
    const { request, users } = setup();
    expect((await request('/api/v1/my-activities')).status).toBe(401);
    expect(
      (await request('/api/v1/my-activities', { token: users.unverified().token })).status,
    ).toBe(403);
    const ok = await request('/api/v1/my-activities', { token: users.verified().token });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('RSVP (T09, T10, T11)', () => {
  it('T09: repeated "Eu vou" from one device counts once; cookie is HttpOnly/Lax/Path=/api/Secure', async () => {
    const { request, repo } = setup();
    const a = repo.seedActivity(repo.uuid());
    const first = await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST' });
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    const setCookie = first.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toMatch(/mm_device=[A-Za-z0-9_-]{43};/);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);
    expect(setCookie).toMatch(/Path=\/api/);
    expect(setCookie).toMatch(/Max-Age=31536000/);
    expect(setCookie).toMatch(/Secure/);
    const cookie = deviceCookie(first);
    for (let i = 0; i < 4; i++) {
      const again = await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST', cookie });
      expect((await body(again)).data).toMatchObject({ going: true, rsvp_count_approx: 1 });
    }
    expect(repo.rsvps).toHaveLength(1);
    // the hash/device is never returned
    const text = await (
      await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST', cookie })
    ).text();
    expect(text).not.toContain(cookie.split('=')[1]!);
    expect(text).not.toMatch(/[0-9a-f]{64}/);
  });

  it('cookie is not Secure only when APP_ENV=local', async () => {
    const { request, repo } = setup({ APP_ENV: 'local' });
    const a = repo.seedActivity(repo.uuid());
    const res = await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST' });
    expect(res.headers.get('Set-Cookie')).not.toMatch(/Secure/);
  });

  it('T10: cancelling my intention does not touch other RSVPs', async () => {
    const { request, repo } = setup();
    const a = repo.seedActivity(repo.uuid());
    const mine = deviceCookie(await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST' }));
    await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST' }); // another device
    const del = await request(`/api/v1/activities/${a.id}/rsvp`, {
      method: 'DELETE',
      cookie: mine,
    });
    expect((await body(del)).data).toMatchObject({ going: false, rsvp_count_approx: 1 });
    expect(repo.rsvps.filter((r) => r.status === 'going')).toHaveLength(1);
  });

  it("T11: a visitor cannot cancel someone else's RSVP", async () => {
    const { request, repo } = setup();
    const a = repo.seedActivity(repo.uuid());
    await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST' });
    const noIdentity = await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'DELETE' });
    expect(noIdentity.status).toBe(403);
    const forged = await request(`/api/v1/activities/${a.id}/rsvp`, {
      method: 'DELETE',
      cookie: 'mm_device=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    expect(forged.status).toBe(404);
    expect(repo.rsvps.filter((r) => r.status === 'going')).toHaveLength(1);
  });

  it('Clerk session RSVP uses the Clerk user id (idempotent across devices of the same user)', async () => {
    const { request, repo, users } = setup();
    const a = repo.seedActivity(repo.uuid());
    const s = users.signedUp();
    await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST', token: s.token });
    const r = await request(`/api/v1/activities/${a.id}/rsvp`, {
      method: 'POST',
      token: s.token,
      cookie: 'mm_device=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    });
    expect((await body(r)).data?.rsvp_count_approx).toBe(1);
    expect(repo.rsvps[0]!.user_id).toBe(s.user.id);
  });

  it('cancelled activity -> 409; pending activity -> 404; invalid token -> 401', async () => {
    const { request, repo } = setup();
    const cancelled = repo.seedActivity(repo.uuid(), { status: 'cancelled' });
    const pending = repo.seedActivity(repo.uuid(), { status: 'pending_review' });
    expect(
      (await request(`/api/v1/activities/${cancelled.id}/rsvp`, { method: 'POST' })).status,
    ).toBe(409);
    expect(
      (await request(`/api/v1/activities/${pending.id}/rsvp`, { method: 'POST' })).status,
    ).toBe(404);
    expect(
      (
        await request(`/api/v1/activities/${pending.id}/rsvp`, {
          method: 'POST',
          token: 'expired-token-xxxxxxxxxxxxxxxx',
        })
      ).status,
    ).toBe(401);
  });

  it('F05: 40 identities behind one IP on the same activity are not blocked', async () => {
    const { request, repo } = setup();
    const a = repo.seedActivity(repo.uuid());
    const headers = { 'CF-Connecting-IP': '203.0.113.50' };
    for (let i = 0; i < 40; i++) {
      const r = await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST', headers });
      expect(r.status).toBe(200);
    }
    expect(repo.rsvps.filter((r) => r.activity_id === a.id)).toHaveLength(40);
  });

  it('F05: the same identity repeated beyond 10/10 min -> 429; other identities keep working', async () => {
    const { request, repo } = setup();
    const a = repo.seedActivity(repo.uuid());
    const headers = { 'CF-Connecting-IP': '203.0.113.51' };
    const first = await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST', headers });
    const cookie = deviceCookie(first);
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const method = i % 2 === 0 ? 'DELETE' : 'POST';
      statuses.push(
        (await request(`/api/v1/activities/${a.id}/rsvp`, { method, headers, cookie })).status,
      );
    }
    expect(statuses.slice(0, 9).every((st) => st === 200)).toBe(true);
    expect(statuses[9]).toBe(429);
    const other = await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST', headers });
    expect(other.status).toBe(200);
  });

  it('F05: per-IP ceiling (120/10 min) still applies to fresh identities', async () => {
    const { request, repo } = setup();
    const a = repo.seedActivity(repo.uuid());
    const headers = { 'CF-Connecting-IP': '203.0.113.52' };
    let last = 0;
    for (let i = 0; i < 121; i++)
      last = (await request(`/api/v1/activities/${a.id}/rsvp`, { method: 'POST', headers })).status;
    expect(last).toBe(429);
  });
});
