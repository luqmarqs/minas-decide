import type { Context, MiddlewareHandler } from 'hono';
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

/**
 * Buckets. Keys are `bucket:<subject>`; the subject is the client IP unless noted.
 * QA-1 F05 (CGNAT / event Wi-Fi): RSVP and registration are keyed by IP + identity with a
 * looser per-IP ceiling, so many people behind one public IP are not blocked together.
 */
export const RATE_LIMITS = {
  /** per IP — runs before the session is resolved (protects Auth from token spraying) */
  registrations_ip: { limit: 30, windowMs: TEN_MIN },
  /** per IP + Clerk user id */
  registrations: { limit: 5, windowMs: TEN_MIN },
  proposals: { limit: 5, windowMs: TEN_MIN },
  /** per IP — ceiling for every RSVP from one network */
  rsvp_ip: { limit: 120, windowMs: TEN_MIN },
  /** per IP + activity + identity (user id or device HMAC) */
  rsvp_identity: { limit: 10, windowMs: TEN_MIN },
  activities_write: { limit: 20, windowMs: TEN_MIN },
  /** QA-1 F16: light limits on account endpoints */
  me_write: { limit: 60, windowMs: TEN_MIN },
  /**
   * QA3-01: per IP + Clerk user id on authenticated reads (GET /me, GET /my-activities and
   * every /admin/* route) — generous for people, bounds a token looping on the API.
   */
  account_read: { limit: 120, windowMs: 60 * 1000 },
  /** per IP + Clerk user id: admin grant/revoke (sensitive writes) */
  admin_write: { limit: 30, windowMs: TEN_MIN },
  /** per IP — Clerk webhook deliveries (Svix); signature is checked after this */
  webhook_ip: { limit: 300, windowMs: TEN_MIN },
} as const;

export type RateBucket = keyof typeof RATE_LIMITS;

/** Network subject for abuse logs: HMAC of the IP (raw IP never stored). */
export function subjectHash(secret: string, ip: string): Promise<string> {
  return hmacSha256Hex(secret, `ip:${ip}`);
}

/**
 * Counts one hit for `bucket` and `subject` (defaults to the client IP). Returns a 429
 * response when over the limit (and logs a minimised abuse event), or null when allowed.
 */
export async function hitLimit(
  c: Context<AppBindings>,
  bucket: RateBucket,
  subject?: string,
): Promise<Response | null> {
  const cfg = RATE_LIMITS[bucket];
  const deps = c.get('deps');
  const ip = clientIp(c);
  const key = `${bucket}:${subject ?? ip}`;
  const res = deps.limiter.check(key, cfg.limit, cfg.windowMs, deps.now());
  if (res.allowed) return null;
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

/** Middleware form keyed by client IP. */
export function rateLimit(bucket: RateBucket): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const blocked = await hitLimit(c, bucket);
    if (blocked) return blocked;
    await next();
  };
}

/** Middleware keyed by client IP + the authenticated user id (run after requireSession). */
export function rateLimitPerUser(bucket: RateBucket): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const user = c.get('user');
    const blocked = await hitLimit(c, bucket, `${clientIp(c)}|${user?.id ?? 'none'}`);
    if (blocked) return blocked;
    await next();
  };
}
