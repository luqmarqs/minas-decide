import { describe, expect, it } from 'vitest';
import { ApiError } from '../../shared/contracts/api.ts';
import { PublicGroupsResponse } from '../../shared/contracts/groups.ts';
import { TerritoryDetail, TerritorySearchResponse } from '../../shared/contracts/territory.ts';
import { body, setup } from './fakes.ts';

const validProposal = (over: Record<string, unknown> = {}) => ({
  territory_id: 'mg-3140001-centro',
  name_proposed: 'Grupo Centro Mariana',
  join_url_proposed: 'https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQrStUv',
  proposer_name: 'Ana Proponente',
  proposer_email: 'ana.proponente@example.org',
  proposer_phone: '(31) 99999-8888',
  responsibility_accepted: true,
  consent_version: 'v1',
  turnstile_token: `tok-${Math.random()}`,
  ...over,
});

describe('envelope, health, errors', () => {
  it('health returns {data,meta} with no-store and request id', async () => {
    const { request } = setup();
    const res = await request('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Request-Id')).toMatch(/^[0-9a-f-]{36}$/);
    const json = await body(res);
    expect(json.data).toMatchObject({ status: 'ok', writes_enabled: true });
    expect(json.meta.request_id).toBe(res.headers.get('X-Request-Id'));
  });

  it('unknown route -> 404 error envelope', async () => {
    const { request } = setup();
    const res = await request('/api/v1/nope');
    expect(res.status).toBe(404);
    expect(ApiError.safeParse(await res.json()).success).toBe(true);
  });

  it('malformed JSON -> 400 VALIDATION_ERROR without internals', async () => {
    const { request } = setup();
    const res = await request('/api/v1/groups/proposals', {
      method: 'POST',
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(400);
    const text = await res.text();
    expect(text).toContain('VALIDATION_ERROR');
    expect(text).not.toMatch(/stack|at \w+ \(|SyntaxError/);
  });
});

describe('territories', () => {
  it('search disambiguates homonymous neighbourhoods (T01) with public cache', async () => {
    const { request } = setup();
    const res = await request('/api/v1/territories/search?q=centro');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    const json = (await res.json()) as { data: unknown };
    const parsed = TerritorySearchResponse.parse(json.data);
    const labels = parsed.items.map((i) => i.label);
    expect(labels).toContain('Centro — Mariana/MG');
    expect(labels).toContain('Centro — Belo Horizonte/MG');
  });

  it('search rejects too-short queries', async () => {
    const { request } = setup();
    const res = await request('/api/v1/territories/search?q=a');
    expect(res.status).toBe(400);
    expect((await body(res)).error?.fields?.q).toBeDefined();
  });

  it('detail returns breadcrumb; unknown/invalid id -> 404', async () => {
    const { request } = setup();
    const ok = await request('/api/v1/territories/mg-3140001-centro');
    expect(ok.status).toBe(200);
    const detail = TerritoryDetail.parse(((await ok.json()) as { data: unknown }).data);
    expect(detail.breadcrumb.map((b) => b.id)).toEqual(['mg', 'mg-3140001', 'mg-3140001-centro']);
    expect(detail.coverage_note).toMatch(/aproximado/);
    expect((await request('/api/v1/territories/mg-9999999')).status).toBe(404);
    expect((await request('/api/v1/territories/DROP%20TABLE')).status).toBe(404);
  });

  it('metrics are never served by the API (snapshot only)', async () => {
    const { request } = setup();
    const res = await request('/api/v1/territories/mg-3140001/metrics?year=2022&round=1');
    expect(res.status).toBe(404);
    expect((await body(res)).error?.message).toMatch(/snapshot/);
  });
});

describe('groups (T12, T14, T26)', () => {
  it('lists only active groups with exact / municipality / none fallback', async () => {
    const { request, repo } = setup();
    repo.addGroup('mg-3140001', 'active');
    repo.addGroup('mg-3106200-centro', 'pending');
    const fallback = PublicGroupsResponse.parse(
      ((await (await request('/api/v1/groups?territory_id=mg-3140001-centro')).json()) as { data: unknown }).data,
    );
    expect(fallback.fallback).toBe('municipality');
    expect(fallback.items).toHaveLength(1);
    const none = PublicGroupsResponse.parse(
      ((await (await request('/api/v1/groups?territory_id=mg-3106200-centro')).json()) as { data: unknown }).data,
    );
    expect(none).toEqual({ items: [], fallback: 'none' });
    repo.addGroup('mg-3140001-centro', 'active');
    const exact = await body(await request('/api/v1/groups?territory_id=mg-3140001-centro'));
    expect(exact.data?.fallback).toBe('exact');
  });

  it('requires a valid territory_id', async () => {
    const { request } = setup();
    expect((await request('/api/v1/groups')).status).toBe(400);
    expect((await request('/api/v1/groups?territory_id=xx')).status).toBe(400);
  });

  it('T14: public group payload has exactly the public projection — no manager/proposer data', async () => {
    const { request, repo, users } = setup();
    const admin = users.admin();
    const created = await body(await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal() }));
    await request(`/api/v1/admin/groups/${String(created.data?.id)}/approve`, { method: 'POST', token: admin.token });
    const groupId = repo.groups[0]!.id;
    await request(`/api/v1/admin/groups/${groupId}/managers`, {
      method: 'POST',
      token: admin.token,
      json: { name: 'Responsável Secreto', email: 'resp.secreto@example.org', phone: '31988887777' },
    });
    const res = await request('/api/v1/groups?territory_id=mg-3140001-centro');
    const text = await res.text();
    const json = JSON.parse(text) as { data: { items: Record<string, unknown>[] } };
    expect(Object.keys(json.data.items[0]!).sort()).toEqual(
      ['display_name', 'id', 'join_url', 'status', 'territory_id', 'updated_at'].sort(),
    );
    for (const secret of ['ana.proponente', '99999', 'Ana Proponente', 'Responsável Secreto', 'resp.secreto', '88887777']) {
      expect(text).not.toContain(secret);
    }
  });

  it('T12: proposal stays pending and its link is not public', async () => {
    const { request } = setup();
    const res = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal() });
    expect(res.status).toBe(201);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect((await body(res)).data).toMatchObject({ status: 'pending' });
    const list = await (await request('/api/v1/groups?territory_id=mg-3140001-centro')).text();
    expect(list).not.toContain('AbCdEfGhIjKlMnOpQrStUv');
  });

  it('proposal re-submit (same idempotency key) does not duplicate', async () => {
    const { request, repo } = setup();
    const a = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ idempotency_key: 'key-12345678' }) });
    const b = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ idempotency_key: 'key-12345678' }) });
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect((await body(a)).data?.id).toBe((await body(b)).data?.id);
    expect(repo.proposals).toHaveLength(1);
  });

  it('T26: non-WhatsApp URL is rejected with a field error', async () => {
    const { request, repo } = setup();
    for (const url of ['https://bit.ly/abc', 'https://wa.me/5531999998888', 'javascript:alert(1)']) {
      const res = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ join_url_proposed: url }) });
      expect(res.status).toBe(400);
      expect((await body(res)).error?.fields?.join_url_proposed).toBeDefined();
    }
    expect(repo.proposals).toHaveLength(0);
  });

  it('invalid phone and unknown territory are field errors', async () => {
    const { request } = setup();
    const phone = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ proposer_phone: '3133334444' }) });
    expect((await body(phone)).error?.fields?.proposer_phone).toBeDefined();
    const terr = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ territory_id: 'mg-9999999' }) });
    expect((await body(terr)).error?.fields?.territory_id).toBeDefined();
  });

  it('rate limit: 6th proposal in 10 min -> 429 + Retry-After + abuse event (no raw IP)', async () => {
    const { request, repo } = setup();
    const headers = { 'CF-Connecting-IP': '203.0.113.7' };
    for (let i = 0; i < 5; i++) {
      const r = await request('/api/v1/groups/proposals', { method: 'POST', headers, json: validProposal({ idempotency_key: `k-${i}-123456` }) });
      expect(r.status).toBe(201);
    }
    const blocked = await request('/api/v1/groups/proposals', { method: 'POST', headers, json: validProposal() });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect((await body(blocked)).error?.code).toBe('RATE_LIMITED');
    expect(repo.abuse.some((e) => e.event_type === 'rate_limited')).toBe(true);
    expect(JSON.stringify(repo.abuse)).not.toContain('203.0.113.7');
    // other IPs are unaffected
    const other = await request('/api/v1/groups/proposals', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '198.51.100.1' },
      json: validProposal({ idempotency_key: 'k-other-123456' }),
    });
    expect(other.status).toBe(201);
  });
});

describe('turnstile (T04, T17)', () => {
  it('invalid token -> TURNSTILE_FAILED, nothing stored', async () => {
    const { request, repo } = setup();
    const res = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ turnstile_token: 'bad-token' }) });
    expect(res.status).toBe(400);
    expect((await body(res)).error?.code).toBe('TURNSTILE_FAILED');
    expect(repo.proposals).toHaveLength(0);
    expect(repo.abuse.some((e) => e.event_type === 'turnstile_rejected')).toBe(true);
  });

  it('T17: a token can be used only once', async () => {
    const { request, turnstile } = setup();
    const first = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ turnstile_token: 'same-token', idempotency_key: 'a-12345678' }) });
    expect(first.status).toBe(201);
    const second = await request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ turnstile_token: 'same-token', idempotency_key: 'b-12345678' }) });
    expect(second.status).toBe(400);
    expect((await body(second)).error?.code).toBe('TURNSTILE_FAILED');
    expect(turnstile.calls).toBe(1); // reuse is caught before calling Siteverify again
  });

  it('wrong hostname is rejected for real secrets but ignored for the Cloudflare test secret', async () => {
    const real = setup();
    const r1 = await real.request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ turnstile_token: 'wronghost-1' }) });
    expect((await body(r1)).error?.code).toBe('TURNSTILE_FAILED');
    const testKey = setup({ TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' });
    const r2 = await testKey.request('/api/v1/groups/proposals', { method: 'POST', json: validProposal({ turnstile_token: 'wronghost-2' }) });
    expect(r2.status).toBe(201);
  });

  it('the Cloudflare test secret is refused in production', async () => {
    const prod = setup({ TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', APP_ENV: 'production' });
    const res = await prod.request('/api/v1/groups/proposals', { method: 'POST', json: validProposal() });
    expect((await body(res)).error?.code).toBe('TURNSTILE_FAILED');
  });
});

describe('writes suspended', () => {
  it('every mutation -> 503 WRITES_SUSPENDED, reads keep working', async () => {
    const { request, repo, users } = setup({ WRITES_ENABLED: 'false' });
    const a = repo.seedActivity(repo.uuid());
    const v = users.verified();
    const mutations: [string, string][] = [
      ['POST', '/api/v1/groups/proposals'],
      ['POST', '/api/v1/registrations'],
      ['POST', `/api/v1/activities/${a.id}/rsvp`],
      ['DELETE', `/api/v1/activities/${a.id}/rsvp`],
      ['POST', '/api/v1/activities'],
      ['PATCH', `/api/v1/activities/${a.id}`],
      ['POST', `/api/v1/activities/${a.id}/cancel`],
      ['PATCH', '/api/v1/me'],
      ['POST', '/api/v1/auth/send-link'],
      ['POST', `/api/v1/admin/activities/${a.id}/approve`],
    ];
    for (const [method, path] of mutations) {
      const res = await request(path, { method, token: v.token, json: {} });
      expect(res.status, `${method} ${path}`).toBe(503);
      expect((await body(res)).error?.code).toBe('WRITES_SUSPENDED');
    }
    expect((await request('/api/v1/activities')).status).toBe(200);
    expect((await request('/api/v1/health')).status).toBe(200);
  });
});

describe('envelope schema', () => {
  it('list bodies are {data:{items,next_cursor}, meta:{request_id}}', async () => {
    const { request } = setup();
    const json = (await (await request('/api/v1/activities')).json()) as Record<string, unknown>;
    expect(Object.keys(json).sort()).toEqual(['data', 'meta']);
    expect(json.data).toEqual({ items: [], next_cursor: null });
  });
});

describe('structured logging', () => {
  it('logs one line per request with the matched route and no PII/tokens', async () => {
    const { request, users } = setup({ APP_ENV: 'local' });
    const lines: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
    try {
      const s = users.anonymous();
      await request('/api/v1/territories/search?q=mariana');
      await request('/api/v1/me', { token: s.token });
    } finally {
      console.log = orig;
    }
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed.map((p) => p.route)).toEqual(['/api/v1/territories/search', '/api/v1/me']);
    expect(Object.keys(parsed[0]!).sort()).toEqual(['method', 'ms', 'rate_limited', 'request_id', 'route', 'status']);
    expect(lines.join('\n')).not.toMatch(/tok-anon|mariana|Bearer/);
  });
});
