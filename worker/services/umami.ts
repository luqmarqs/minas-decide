import type { AdminSiteMetrics } from '../../shared/contracts/admin.ts';
import type { Env } from '../env.ts';

/**
 * Reads AGGREGATE audience numbers from the self-hosted Umami (D44) on the server, so the
 * read-only Umami credentials never reach the browser. Everything is best effort: callers get
 * `unconfigured` / `unavailable` and the route never fails because of Umami.
 *
 * Per-isolate state (like `user-cache.ts`): JWT cached ~50 min (renewed once on 401), results
 * cached 60 s per period. Failures are never cached. Logs carry no URL credentials/tokens.
 */
export const UMAMI_TOKEN_TTL_MS = 50 * 60_000;
export const UMAMI_RESULT_TTL_MS = 60_000;
export const UMAMI_TIMEOUT_MS = 5_000;
const SP_OFFSET_MS = 3 * 3_600_000; // America/Sao_Paulo is UTC-3 all year (no DST since 2019)
const DAY_MS = 86_400_000;

export type UmamiResult =
  { status: 'ok'; site: AdminSiteMetrics } | { status: 'unconfigured' | 'unavailable'; site: null };

interface UmamiConfig {
  base: string;
  websiteId: string;
  username: string;
  password: string;
}

const tokenState: { token: string | null; expiresAt: number; pending: Promise<string> | null } = {
  token: null,
  expiresAt: 0,
  pending: null,
};
const results = new Map<string, { expiresAt: number; site: AdminSiteMetrics }>();

/** Test hook. */
export function resetUmamiCache(): void {
  tokenState.token = null;
  tokenState.expiresAt = 0;
  tokenState.pending = null;
  results.clear();
}

class UmamiError extends Error {
  constructor(
    readonly kind: string,
    readonly status?: number,
  ) {
    super(kind);
  }
}

function readConfig(env: Env): UmamiConfig | null {
  const { UMAMI_API_URL, UMAMI_WEBSITE_ID, UMAMI_USERNAME, UMAMI_PASSWORD } = env;
  if (!UMAMI_API_URL || !UMAMI_WEBSITE_ID || !UMAMI_USERNAME || !UMAMI_PASSWORD) return null;
  if (!/^[0-9a-f-]{36}$/i.test(UMAMI_WEBSITE_ID)) return null;
  let url: URL;
  try {
    url = new URL(UMAMI_API_URL);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return null;
  }
  return {
    base: url.origin,
    websiteId: UMAMI_WEBSITE_ID,
    username: UMAMI_USERNAME,
    password: UMAMI_PASSWORD,
  };
}

async function login(cfg: UmamiConfig, now: number): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: cfg.username, password: cfg.password }),
      signal: AbortSignal.timeout(UMAMI_TIMEOUT_MS),
    });
  } catch {
    throw new UmamiError('login_network');
  }
  if (!res.ok) throw new UmamiError('login_rejected', res.status);
  const json = (await res.json().catch(() => null)) as { token?: unknown } | null;
  if (!json || typeof json.token !== 'string' || json.token === '') {
    throw new UmamiError('login_no_token');
  }
  tokenState.token = json.token;
  tokenState.expiresAt = now + UMAMI_TOKEN_TTL_MS;
  return json.token;
}

/** One login at a time per isolate; `stale` = the token that just got a 401 (renew only then). */
function getToken(cfg: UmamiConfig, now: number, stale?: string): Promise<string> {
  if (tokenState.pending) return tokenState.pending;
  if (tokenState.token && tokenState.expiresAt > now && tokenState.token !== stale) {
    return Promise.resolve(tokenState.token);
  }
  const p = login(cfg, now).finally(() => {
    tokenState.pending = null;
  });
  tokenState.pending = p;
  return p;
}

async function apiGet(
  cfg: UmamiConfig,
  now: number,
  path: string,
  params: Record<string, string | number>,
): Promise<unknown> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const url = `${cfg.base}/api/websites/${cfg.websiteId}/${path}?${qs.toString()}`;
  const call = async (token: string): Promise<Response> => {
    try {
      return await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(UMAMI_TIMEOUT_MS),
      });
    } catch {
      throw new UmamiError('network');
    }
  };
  let token = await getToken(cfg, now);
  let res = await call(token);
  if (res.status === 401) {
    token = await getToken(cfg, now, token);
    res = await call(token);
  }
  if (!res.ok) throw new UmamiError('http', res.status);
  try {
    return await res.json();
  } catch {
    throw new UmamiError('bad_json');
  }
}

/** Umami v2 returns `{value, prev}` per stat, other versions plain numbers. */
function statValue(v: unknown): number {
  const n =
    typeof v === 'number'
      ? v
      : v && typeof v === 'object' && 'value' in v
        ? Number((v as { value: unknown }).value)
        : 0;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

type Point = { x: unknown; y: unknown };
function points(v: unknown): Point[] {
  return Array.isArray(v) ? (v as Point[]).filter((p) => p && typeof p === 'object') : [];
}
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

function labelCounts(raw: unknown, fallback: string): { label: string; count: number }[] {
  return points(raw)
    .map((p) => ({
      label: typeof p.x === 'string' && p.x !== '' ? p.x : fallback,
      count: num(p.y),
    }))
    .slice(0, 10);
}

const spDay = (ms: number) => new Date(ms - SP_OFFSET_MS).toISOString().slice(0, 10);

async function pageMetrics(cfg: UmamiConfig, now: number, base: Record<string, string | number>) {
  try {
    // Umami >= 2.1x names it `path`; older versions use `url`.
    return await apiGet(cfg, now, 'metrics', { ...base, type: 'path' });
  } catch (err) {
    if (err instanceof UmamiError && err.kind === 'http' && err.status === 400) {
      return apiGet(cfg, now, 'metrics', { ...base, type: 'url' });
    }
    throw err;
  }
}

async function fetchSite(cfg: UmamiConfig, now: number, days: number): Promise<AdminSiteMetrics> {
  const firstDay = spDay(now - (days - 1) * DAY_MS);
  const startAt = Date.parse(`${firstDay}T00:00:00-03:00`);
  const range = { startAt, endAt: now };
  const [stats, series, pages, referrers, devices] = await Promise.all([
    apiGet(cfg, now, 'stats', range),
    apiGet(cfg, now, 'pageviews', { ...range, unit: 'day', timezone: 'America/Sao_Paulo' }),
    pageMetrics(cfg, now, { ...range, limit: 10 }),
    apiGet(cfg, now, 'metrics', { ...range, type: 'referrer', limit: 10 }),
    apiGet(cfg, now, 'metrics', { ...range, type: 'device', limit: 10 }),
  ]);
  const s = (stats && typeof stats === 'object' ? stats : {}) as Record<string, unknown>;
  const visits = statValue(s.visits);
  const bounces = statValue(s.bounces);
  const totaltime = statValue(s.totaltime);

  const pv = new Map<string, number>();
  const vis = new Map<string, number>();
  const sr = (series && typeof series === 'object' ? series : {}) as Record<string, unknown>;
  for (const p of points(sr.pageviews)) pv.set(String(p.x).slice(0, 10), num(p.y));
  for (const p of points(sr.sessions)) vis.set(String(p.x).slice(0, 10), num(p.y));
  const by_day: AdminSiteMetrics['by_day'] = [];
  for (let i = 0; i < days; i++) {
    const day = spDay(now - (days - 1 - i) * DAY_MS);
    by_day.push({ day, pageviews: pv.get(day) ?? 0, visitors: vis.get(day) ?? 0 });
  }

  return {
    days,
    visitors: statValue(s.visitors),
    visits,
    pageviews: statValue(s.pageviews),
    bounces,
    bounce_rate: visits > 0 ? Math.min(1, bounces / visits) : null,
    avg_visit_seconds: visits > 0 ? totaltime / visits : null,
    by_day,
    top_pages: labelCounts(pages, '(sem caminho)'),
    top_referrers: labelCounts(referrers, 'Acesso direto'),
    devices: labelCounts(devices, 'Desconhecido'),
  };
}

export async function getSiteMetrics(env: Env, days: number, now: number): Promise<UmamiResult> {
  const cfg = readConfig(env);
  if (!cfg) return { status: 'unconfigured', site: null };
  const key = `${cfg.base}|${cfg.websiteId}|${days}`;
  const hit = results.get(key);
  if (hit && hit.expiresAt > now) return { status: 'ok', site: hit.site };
  try {
    const site = await fetchSite(cfg, now, days);
    results.set(key, { expiresAt: now + UMAMI_RESULT_TTL_MS, site });
    return { status: 'ok', site };
  } catch (err) {
    const e = err instanceof UmamiError ? err : null;
    console.warn(
      JSON.stringify({
        level: 'warn',
        where: 'umami',
        kind: e?.kind ?? 'unexpected',
        status: e?.status ?? null,
      }),
    );
    return { status: 'unavailable', site: null };
  }
}
