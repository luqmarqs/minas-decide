import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetUmamiCache } from '../services/umami.ts';
import { body, setup } from './fakes.ts';

const URL_ = '/api/v1/admin/metrics';
const SITE = '659cb853-768c-4dfd-9919-6a05d87b2c74';
const UMAMI = {
  UMAMI_API_URL: 'https://analytics.example.test',
  UMAMI_WEBSITE_ID: SITE,
  UMAMI_USERNAME: 'viewer',
  UMAMI_PASSWORD: 'viewer-pass-placeholder',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

interface Calls {
  login: number;
  paths: string[];
  tokens: string[];
}

/** Umami simulator. `rejectTokens` = tokens answering 401 (to test renewal). */
function stubUmami(over: { rejectTokens?: Set<string>; failWith?: () => Response } = {}) {
  const calls: Calls = { login: 0, paths: [], tokens: [] };
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input.toString());
    if (url.pathname === '/api/auth/login') {
      calls.login++;
      expect(JSON.parse(String(init?.body))).toEqual({
        username: 'viewer',
        password: 'viewer-pass-placeholder',
      });
      return json({ token: `jwt-${calls.login}` });
    }
    const auth = new Headers(init?.headers).get('Authorization') ?? '';
    calls.tokens.push(auth);
    if (over.rejectTokens?.has(auth.replace('Bearer ', ''))) return json({ error: 'x' }, 401);
    if (over.failWith) return over.failWith();
    const tail = url.pathname.replace(`/api/websites/${SITE}/`, '');
    calls.paths.push(`${tail}?${url.searchParams.get('type') ?? ''}`);
    if (tail === 'stats') {
      return json({
        pageviews: { value: 120, prev: 90 },
        visitors: { value: 40, prev: 30 },
        visits: 50,
        bounces: { value: 20, prev: 10 },
        totaltime: { value: 5000, prev: 0 },
      });
    }
    if (tail === 'pageviews') {
      return json({
        pageviews: [
          { x: '2026-10-08 00:00:00', y: 7 },
          { x: '2026-10-07', y: 3 },
        ],
        sessions: [{ x: '2026-10-08T00:00:00-03:00', y: 4 }],
      });
    }
    const type = url.searchParams.get('type');
    if (type === 'path')
      return json([
        { x: '/', y: 80 },
        { x: '/mapa', y: 20 },
      ]);
    if (type === 'referrer')
      return json([
        { x: '', y: 9 },
        { x: 'google.com', y: 5 },
      ]);
    return json([{ x: 'mobile', y: 30 }]);
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}

beforeEach(() => resetUmamiCache());
afterEach(() => vi.unstubAllGlobals());

describe('GET /admin/metrics', () => {
  it('internal ok, Umami unconfigured -> site null / unconfigured, no-store', async () => {
    const t = setup();
    const a = t.users.admin();
    const res = await t.request(URL_, { token: a.token });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    const data = (await body(res)).data!;
    expect(data.site).toBeNull();
    expect(data.site_status).toBe('unconfigured');
    expect(data.days).toBe(30);
    const internal = data.internal as {
      profiles: { by_day: unknown[] };
      admins: { total: number };
    };
    expect(internal.admins.total).toBe(1);
    expect(internal.profiles.by_day).toHaveLength(30);
    expect(t.repo.metricsCalls).toEqual([30]);
  });

  it('only aggregates: no e-mail, phone or user ids in the answer', async () => {
    const t = setup();
    const a = t.users.admin();
    t.users.verified();
    const text = await (await t.request(URL_, { token: a.token })).text();
    expect(text).not.toMatch(/@example|\+55|user_test|display_name/);
  });

  it('days=7|90 reaches the repo; invalid days -> 400', async () => {
    const t = setup();
    const a = t.users.admin();
    expect((await t.request(`${URL_}?days=7`, { token: a.token })).status).toBe(200);
    expect((await t.request(`${URL_}?days=90`, { token: a.token })).status).toBe(200);
    expect(t.repo.metricsCalls).toEqual([7, 90]);
    for (const bad of ['0', '15', '366', 'abc', '-7']) {
      const res = await t.request(`${URL_}?days=${bad}`, { token: a.token });
      expect(res.status).toBe(400);
      expect((await body(res)).error?.code).toBe('VALIDATION_ERROR');
    }
  });

  it('non-admin 403, anonymous 401', async () => {
    const t = setup();
    const u = t.users.verified();
    const res = await t.request(URL_, { token: u.token });
    expect(res.status).toBe(403);
    expect(t.repo.metricsCalls).toEqual([]);
    expect((await t.request(URL_)).status).toBe(401);
  });

  it('reads Umami: login + stats + pageviews + metrics (v2 {value,prev} and plain numbers)', async () => {
    const { fn, calls } = stubUmami();
    const t = setup(UMAMI);
    const a = t.users.admin();
    const res = await t.request(`${URL_}?days=7`, { token: a.token });
    expect(res.status).toBe(200);
    const data = (await body(res)).data!;
    expect(data.site_status).toBe('ok');
    const site = data.site as Record<string, unknown> & {
      by_day: { day: string; pageviews: number; visitors: number }[];
    };
    expect(site).toMatchObject({
      days: 7,
      visitors: 40,
      visits: 50,
      pageviews: 120,
      bounces: 20,
      bounce_rate: 0.4,
      avg_visit_seconds: 100,
      top_pages: [
        { label: '/', count: 80 },
        { label: '/mapa', count: 20 },
      ],
      top_referrers: [
        { label: 'Acesso direto', count: 9 },
        { label: 'google.com', count: 5 },
      ],
      devices: [{ label: 'mobile', count: 30 }],
    });
    expect(site.by_day).toHaveLength(7);
    expect(site.by_day.at(-1)).toEqual({ day: '2026-10-08', pageviews: 7, visitors: 4 });
    expect(site.by_day.at(-2)).toEqual({ day: '2026-10-07', pageviews: 3, visitors: 0 });
    expect(calls.login).toBe(1);
    expect(calls.tokens.every((x) => x === 'Bearer jwt-1')).toBe(true);
    expect(calls.paths).toEqual(
      expect.arrayContaining([
        'stats?',
        'pageviews?',
        'metrics?path',
        'metrics?referrer',
        'metrics?device',
      ]),
    );
    // credentials never leave the Worker
    expect(JSON.stringify(data)).not.toContain('viewer-pass');
    expect(fn).toHaveBeenCalled();
  });

  it('falls back to type=url when the Umami version rejects type=path', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        if (url.pathname === '/api/auth/login') return json({ token: 't' });
        const type = url.searchParams.get('type');
        calls.push(`${url.pathname.split('/').pop()}?${type ?? ''}`);
        if (type === 'path') return json({ error: 'bad type' }, 400);
        if (type) return json([{ x: '/a', y: 1 }]);
        if (url.pathname.endsWith('/stats'))
          return json({ pageviews: 1, visitors: 1, visits: 1, bounces: 0, totaltime: 10 });
        return json({ pageviews: [], sessions: [] });
      }),
    );
    const t = setup(UMAMI);
    const a = t.users.admin();
    const data = (await body(await t.request(URL_, { token: a.token }))).data!;
    expect(data.site_status).toBe('ok');
    expect(calls).toContain('metrics?url');
  });

  it('caches the result for 60 s per period and the JWT across periods', async () => {
    const { calls } = stubUmami();
    const t = setup(UMAMI);
    const a = t.users.admin();
    await t.request(`${URL_}?days=30`, { token: a.token });
    const after1 = calls.paths.length;
    await t.request(`${URL_}?days=30`, { token: a.token });
    expect(calls.paths.length).toBe(after1); // served from cache
    await t.request(`${URL_}?days=7`, { token: a.token }); // other period: new reads, same JWT
    expect(calls.paths.length).toBeGreaterThan(after1);
    expect(calls.login).toBe(1);
    t.advance(61_000);
    await t.request(`${URL_}?days=30`, { token: a.token });
    expect(calls.paths.length).toBeGreaterThan(after1 * 2);
  });

  it('401 from Umami renews the JWT once and retries', async () => {
    const { calls } = stubUmami({ rejectTokens: new Set(['jwt-1']) });
    const t = setup(UMAMI);
    const a = t.users.admin();
    const data = (await body(await t.request(URL_, { token: a.token }))).data!;
    expect(data.site_status).toBe('ok');
    expect(calls.login).toBe(2);
    expect(calls.tokens.at(-1)).toBe('Bearer jwt-2');
  });

  it('persistent 401, 5xx, network error and timeout -> unavailable, never 500, no secrets logged', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const scenarios: [string, () => void][] = [
      ['401', () => stubUmami({ rejectTokens: new Set(['jwt-1', 'jwt-2', 'jwt-3']) })],
      ['5xx', () => stubUmami({ failWith: () => json({ error: 'boom' }, 503) })],
      [
        'network',
        () =>
          void vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
              throw new TypeError('fetch failed');
            }),
          ),
      ],
      [
        'timeout',
        () =>
          void vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
              throw new DOMException('timed out', 'TimeoutError');
            }),
          ),
      ],
      [
        'login rejected',
        () =>
          void vi.stubGlobal(
            'fetch',
            vi.fn(async () => json({ error: 'no' }, 401)),
          ),
      ],
    ];
    for (const [name, arrange] of scenarios) {
      resetUmamiCache();
      arrange();
      const t = setup(UMAMI);
      const a = t.users.admin();
      const res = await t.request(URL_, { token: a.token });
      expect(res.status, name).toBe(200);
      const data = (await body(res)).data!;
      expect(data.site, name).toBeNull();
      expect(data.site_status, name).toBe('unavailable');
      expect(data.internal, name).toBeTruthy();
    }
    const logged = warn.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('umami');
    expect(logged).not.toMatch(/viewer-pass|jwt-|Bearer/);
    warn.mockRestore();
  });

  it('ignores an unsafe/invalid Umami config (http, bad website id) as unconfigured', async () => {
    const { fn } = stubUmami();
    for (const over of [
      { UMAMI_API_URL: 'http://analytics.example.test' },
      { UMAMI_WEBSITE_ID: '../../etc' },
    ]) {
      const t = setup({ ...UMAMI, ...over });
      const a = t.users.admin();
      const data = (await body(await t.request(URL_, { token: a.token }))).data!;
      expect(data.site_status).toBe('unconfigured');
    }
    expect(fn).not.toHaveBeenCalled();
  });
});
