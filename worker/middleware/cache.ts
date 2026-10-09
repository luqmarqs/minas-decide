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
 * QA-1 F16: public GETs are cached in the colo's Cache API (`caches.default`), keyed by the
 * full URL, for `ttlSec` seconds, on top of `Cache-Control: public, max-age`. Only 200s are
 * stored. Responses never depend on the caller (these routes ignore Authorization/cookies).
 * A HIT keeps the original body (so `meta.request_id` is the one of the request that filled
 * the cache) but gets a fresh `X-Request-Id` header and `X-Cache: HIT`.
 * Without a Cache API (Node tests, `edgeCache: null`) this degrades to `cachePublic`.
 */
export function edgeCached(ttlSec = 60): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const cache = c.get('deps').edgeCache;
    if (cache && c.req.method === 'GET') {
      const hit = await cache.match(cacheKey(c.req.url)).catch(() => undefined);
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
        cache.put(cacheKey(c.req.url), copy).catch(() => undefined),
      );
      if (pending) await pending;
    }
  };
}

/**
 * Best-effort invalidation of exact public URLs after a mutation. The Cache API is PER COLO:
 * this only purges the current data center; other colos expire within the TTL (60 s).
 * List URLs with arbitrary query strings (bbox, from/to, cursor) are not enumerable and
 * also expire within the TTL.
 */
export async function purgePublic(c: Context<AppBindings>, paths: string[]): Promise<void> {
  const cache = c.get('deps').edgeCache;
  if (!cache) return;
  const origin = new URL(c.req.url).origin;
  await Promise.all(
    paths.map((p) => cache.delete(cacheKey(`${origin}/api/v1${p}`)).catch(() => false)),
  );
}

export function activityPaths(id: string): string[] {
  return [`/activities/${id}`];
}

export function groupPaths(territoryId: string): string[] {
  const ids = new Set([territoryId]);
  const muni = municipalityIdOf(territoryId);
  if (muni) ids.add(muni);
  return [...ids].map((t) => `/groups?territory_id=${encodeURIComponent(t)}`);
}

/** Account, registration, admin and RSVP responses are never cached. */
export const noStore: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
};
