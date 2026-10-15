import { describe, expect, it } from 'vitest';
import { MyActivity } from '../../shared/contracts/activities.ts';
import { body, setup } from './fakes.ts';

/** D50: POST /admin/activities — admin creates an activity that is published at once. */
const URL_ = '/api/v1/admin/activities';

const input = (over: Record<string, unknown> = {}) => ({
  title: 'Caminhada pela virada',
  type: 'caminhada',
  description: 'Caminhada com material da campanha pelo centro histórico.',
  territory_id: 'mg-3140001',
  public_address: 'Praça Gomes Freire, Mariana',
  coordinates: [-43.416, -20.378],
  location_confirmed: true,
  starts_at: '2026-10-20T13:00:00.000Z',
  ends_at: '2026-10-20T15:00:00.000Z',
  timezone: 'America/Sao_Paulo',
  public_contact_opt_in: false,
  idempotency_key: 'admin-key-0001',
  ...over,
});

describe('POST /admin/activities (D50)', () => {
  it('no session -> 401; organizer (non-admin) -> 403; nothing created', async () => {
    const t = setup();
    expect((await t.request(URL_, { method: 'POST', json: input() })).status).toBe(401);
    const v = t.users.verified();
    const res = await t.request(URL_, { method: 'POST', token: v.token, json: input() });
    expect(res.status).toBe(403);
    expect(t.repo.activities).toHaveLength(0);
  });

  it('admin -> 201, PUBLISHED at once, creator = admin, audited without PII, visible publicly', async () => {
    const t = setup();
    const a = t.users.admin();
    const res = await t.request(URL_, { method: 'POST', token: a.token, json: input() });
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    const data = (await body(res)).data;
    expect(MyActivity.safeParse(data).success).toBe(true);
    expect(data).toMatchObject({ status: 'published', title: 'Caminhada pela virada' });
    const row = t.repo.activities[0]!;
    expect(row.creator_user_id).toBe(a.user.id);
    expect(row.status).toBe('published');
    expect(t.repo.audit.filter((e) => e.action === 'admin.activity.create')).toEqual([
      { actor: a.user.id, action: 'admin.activity.create', entity_id: row.id, reason: null },
    ]);
    const pub = await t.request(`/api/v1/activities/${row.id}`);
    expect(pub.status).toBe(200);
    expect(JSON.stringify((await body(pub)).data)).not.toContain(a.user.id);
  });

  it('idempotent: the same key returns the same activity (200), a new key creates another', async () => {
    const t = setup();
    const a = t.users.admin();
    const first = await t.request(URL_, { method: 'POST', token: a.token, json: input() });
    const again = await t.request(URL_, { method: 'POST', token: a.token, json: input() });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect((await body(again)).data?.id).toBe((await body(first)).data?.id);
    expect(t.repo.activities).toHaveLength(1);
    const other = await t.request(URL_, {
      method: 'POST',
      token: a.token,
      json: input({ idempotency_key: 'admin-key-0002' }),
    });
    expect(other.status).toBe(201);
    expect(t.repo.activities).toHaveLength(2);
  });

  it('same validation as organizers: past date, outside MG, unknown territory, missing key -> 400', async () => {
    const t = setup();
    const a = t.users.admin();
    const cases: [Record<string, unknown>, string][] = [
      [{ starts_at: '2026-10-01T13:00:00.000Z', ends_at: null }, 'starts_at'],
      [{ coordinates: [-46.6, -25.5] }, 'coordinates'],
      [{ territory_id: 'mg-9999999' }, 'territory_id'],
      [{ idempotency_key: undefined }, 'idempotency_key'],
      [{ title: 'abc' }, 'title'],
    ];
    for (const [over, field] of cases) {
      const res = await t.request(URL_, { method: 'POST', token: a.token, json: input(over) });
      expect([field, res.status]).toEqual([field, 400]);
      const keys = Object.keys((await body(res)).error?.fields ?? {});
      expect(
        keys.some((k) => k === field || k.startsWith(`${field}.`)),
        `${field}: ${keys.join(',')}`,
      ).toBe(true);
    }
    expect(t.repo.activities).toHaveLength(0);
  });

  it('admin can edit and cancel it with the existing activity routes', async () => {
    const t = setup();
    const a = t.users.admin();
    const created = (
      await body(await t.request(URL_, { method: 'POST', token: a.token, json: input() }))
    ).data as { id: string; version: number };
    const patch = await t.request(`/api/v1/activities/${created.id}`, {
      method: 'PATCH',
      token: a.token,
      json: { title: 'Caminhada pela virada (novo horário)', version: created.version },
    });
    expect(patch.status).toBe(200);
    expect((await body(patch)).data?.status).toBe('published'); // admin edits stay published
    const cancel = await t.request(`/api/v1/activities/${created.id}/cancel`, {
      method: 'POST',
      token: a.token,
      json: {},
    });
    expect(cancel.status).toBe(200);
    expect((await body(cancel)).data?.status).toBe('cancelled');
  });
});
