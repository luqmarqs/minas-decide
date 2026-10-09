import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../env.ts';
import { clientIp } from '../http.ts';
import { hmacSha256Hex } from '../services/crypto.ts';
import { respondError } from './errors.ts';

/**
 * BEST-EFFORT sliding-window limiter kept in memory PER ISOLATE (no KV/Durable Objects in
 * the MVP — D13). Different isolates/colos do not share counters, so the effective global
 * limit can be higher. Database uniqueness/idempotency remain the real guarantees.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly maxKeys = 10_000) {}

  check(
    key: string,
    limit: number,
    windowMs: number,
    now: number,
  ): { allowed: boolean; retryAfterSec: number } {
    const since = now - windowMs;
    const list = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (list.length >= limit) {
      this.hits.set(key, list);
      const oldest = list[0] ?? now;
      return {
        allowed: false,
        retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
      };
    }
    list.push(now);
    this.hits.set(key, list);
    if (this.hits.size > this.maxKeys) this.prune(since);
    return { allowed: true, retryAfterSec: 0 };
  }

  private prune(since: number): void {
    for (const [k, v] of this.hits) {
      if (!v.some((t) => t > since)) this.hits.delete(k);
    }
    // still too big: drop oldest insertion-ordered keys
    for (const k of this.hits.keys()) {
      if (this.hits.size <= this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

const TEN_MIN = 10 * 60 * 1000;

export const RATE_LIMITS = {
  registrations: { limit: 5, windowMs: TEN_MIN },
  proposals: { limit: 5, windowMs: TEN_MIN },
  rsvp: { limit: 30, windowMs: TEN_MIN },
  send_link: { limit: 3, windowMs: TEN_MIN },
  activities_write: { limit: 20, windowMs: TEN_MIN },
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

/** Network subject for abuse logs: HMAC of the IP (raw IP never stored). */
export function subjectHash(secret: string, ip: string): Promise<string> {
  return hmacSha256Hex(secret, `ip:${ip}`);
}

export function rateLimit(bucket: RateBucket): MiddlewareHandler<AppBindings> {
  const cfg = RATE_LIMITS[bucket];
  return async (c, next) => {
    const deps = c.get('deps');
    const ip = clientIp(c);
    const res = deps.limiter.check(`${bucket}:${ip}`, cfg.limit, cfg.windowMs, deps.now());
    if (!res.allowed) {
      c.set('rateLimited', true);
      try {
        await deps.repo.recordAbuse({
          subject_hash: await subjectHash(c.env.RSVP_DEVICE_SECRET, ip),
          route: bucket,
          event_type: 'rate_limited',
          block_code: 'RATE_LIMITED',
        });
      } catch {
        // best effort: never fail the 429 because logging failed
      }
      c.header('Retry-After', String(res.retryAfterSec));
      return respondError(c, 'RATE_LIMITED');
    }
    await next();
  };
}
