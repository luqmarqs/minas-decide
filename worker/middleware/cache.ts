import type { Context, MiddlewareHandler } from 'hono';
import { municipalityIdOf } from '../../shared/contracts/snapshot.ts';
import type { AppBindings } from '../env.ts';

/** Short public cache for anonymous list/detail reads (only on 200). */
export function cachePublic(maxAgeSec = 60): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', `public, max-age=${maxAgeSec}`);
    else c.header('Cache-Control', 'no-store');
  };
}

/**
 * QA2-04: canonical cache key = origin + path + ONLY the known query params, in a fixed order
 * (first value of each, as the handlers read it). Unknown params (`&x=1`, cache busters) and
 * param order never create a second cache entry that the purge cannot reach.
 */
export function canonicalCacheUrl(raw: string, keyParams: readonly string[]): string {
  const url = new URL(raw);
  const out = new URLSearchParams();
  for (const k of keyParams) {
    const v = url.searchParams.get(k);
    if (v !== null) out.set(k, v);
  }
  const qs = out.toString();
  return `${url.origin}${url.pathname}${qs ? `?${qs}` : ''}`;
}

function cacheKey(url: string): Request {
  return new Request(url, { method: 'GET' });
}

function background(c: Context<AppBindings>, p: Promise<unknown>): Promise<unknown> | null {
  try {
    c.executionCtx.waitUntil(p);
    return null;
  } catch {
    return p; // no ExecutionContext (tests): caller awaits it
  }
}

/**
 * QA-1 F16: public GETs are cached in the colo's Cache API (`caches.default`) for `ttlSec`
 * seconds, on top of `Cache-Control: public, max-age`. The key is the canonical URL built from
 * `keyParams` (QA2-04). Only 200s are stored. Responses never depend on the caller (these
 * routes ignore Authorization/cookies). A HIT keeps the original body (so `meta.request_id`
 * is the one of the request that filled the cache) but gets a fresh `X-Request-Id` header and
 * `X-Cache: HIT`. Without a Cache API (Node tests, `edgeCache: null`) this degrades to
 * `cachePublic`.
 */
export function edgeCached(
  ttlSec = 60,
  keyParams: readonly string[] = [],
): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const cache = c.get('deps').edgeCache;
    const key = canonicalCacheUrl(c.req.url, keyParams);
    if (cache && c.req.method === 'GET') {
      const hit = await cache.match(cacheKey(key)).catch(() => undefined);
      if (hit) {
        const res = new Response(hit.body, hit);
        res.headers.set('X-Cache', 'HIT');
        return res;
      }
    }
    await next();
    if (c.res.status !== 200) {
      c.header('Cache-Control', 'no-store');
      return;
    }
    c.header('Cache-Control', `public, max-age=${ttlSec}`);
    if (cache && c.req.method === 'GET') {
      c.header('X-Cache', 'MISS');
      const copy = c.res.clone();
      const pending = background(
        c,
        cache.put(cacheKey(key), copy).catch(() => undefined),
      );
      if (pending) await pending;
    }
  };
}

const PURGE_BATCH = 50;

/**
 * Best-effort invalidation of public URLs after a mutation. `paths` are relative to /api/v1
 * and are canonicalized with every param they carry (same order as `edgeCached` keyParams).
 * The Cache API is PER COLO: this only purges the current data center; other colos expire
 * within the TTL (60 s). List URLs with arbitrary query strings (bbox, from/to, cursor) are
 * not enumerable and also expire within the TTL.
 */
export async function purgePublic(c: Context<AppBindings>, paths: string[]): Promise<void> {
  const cache = c.get('deps').edgeCache;
  if (!cache) return;
  const origin = new URL(c.req.url).origin;
  const urls = [...new Set(paths)].map((p) => {
    const u = `${origin}/api/v1${p}`;
    return canonicalCacheUrl(u, [...new URL(u).searchParams.keys()]);
  });
  for (let i = 0; i < urls.length; i += PURGE_BATCH) {
    await Promise.all(
      urls.slice(i, i + PURGE_BATCH).map((u) => cache.delete(cacheKey(u)).catch(() => false)),
    );
  }
}

export function activityPaths(id: string): string[] {
  return [`/activities/${id}`];
}

/** Query params that key the public routes' edge cache (must match their Zod schemas). */
export const GROUPS_KEY = ['territory_id'] as const;
export const ACTIVITIES_KEY = ['bbox', 'territory_id', 'from', 'to', 'limit', 'cursor'] as const;
export const TERRITORY_SEARCH_KEY = ['q', 'limit'] as const;

/**
 * Every cached /groups URL whose body may change when a group of `territoryId` changes:
 * the territory itself, its municipality and — for a municipal group — every neighborhood of
 * that municipality, because a neighborhood without groups falls back to the municipality's
 * list (QA2-04).
 */
export async function groupPaths(c: Context<AppBindings>, territoryId: string): Promise<string[]> {
  const ids = new Set([territoryId]);
  const muni = municipalityIdOf(territoryId);
  if (muni) ids.add(muni);
  if (muni && muni === territoryId && c.get('deps').edgeCache) {
    try {
      for (const child of await c.get('deps').repo.listChildIds(muni)) ids.add(child);
    } catch {
      // best effort: the mutation already committed; those URLs expire within the TTL
    }
  }
  return [...ids].map((t) => `/groups?territory_id=${encodeURIComponent(t)}`);
}

/** Purges every cached /groups URL affected by a change in `territoryId` (current colo). */
export async function purgeGroups(c: Context<AppBindings>, territoryId: string): Promise<void> {
  if (!c.get('deps').edgeCache) return;
  await purgePublic(c, await groupPaths(c, territoryId));
}

/** Account, registration, admin and RSVP responses are never cached. */
export const noStore: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
};
