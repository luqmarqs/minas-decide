import type { MiddlewareHandler } from 'hono';
import type { AppBindings, Env } from '../env.ts';
import { isLocal } from '../env.ts';
import { clientIp } from '../http.ts';
import { respondError } from './errors.ts';
import { subjectHash } from './rate-limit.ts';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function allowedOrigins(env: Env): Set<string> {
  const list = [env.PUBLIC_ORIGIN, ...(env.ALLOWED_ORIGINS ?? '').split(',')];
  const out = new Set<string>();
  for (const item of list) {
    const o = item ? normalizeOrigin(item) : null;
    if (o) out.add(o);
  }
  return out;
}

export function isOriginAllowed(env: Env, origin: string): boolean {
  const o = normalizeOrigin(origin);
  if (!o) return false; // includes the literal "null" origin (sandboxed frames, file://)
  if (allowedOrigins(env).has(o)) return true;
  // Local development only: any loopback port (Vite 5173, wrangler 87xx, preview).
  return isLocal(env) && LOOPBACK.has(new URL(o).hostname);
}

/**
 * QA-1 F14: mutations (POST/PATCH/DELETE/PUT) carrying an `Origin` header must come from
 * PUBLIC_ORIGIN or ALLOWED_ORIGINS. Requests WITHOUT Origin (curl, scripts, server-to-server)
 * pass: browsers always send Origin on cross-site and same-origin non-GET fetches, so a
 * forged cross-site form/fetch is refused while non-browser clients keep working. This is
 * defence in depth on top of Bearer tokens (not ambient) and SameSite=Lax cookies.
 */
export const originGuard: MiddlewareHandler<AppBindings> = async (c, next) => {
  const origin = c.req.header('Origin');
  if (!SAFE.has(c.req.method) && origin !== undefined && !isOriginAllowed(c.env, origin)) {
    try {
      await c.get('deps').repo.recordAbuse({
        subject_hash: await subjectHash(c.env.RSVP_DEVICE_SECRET, clientIp(c)),
        route: 'origin',
        event_type: 'origin_denied',
        block_code: 'FORBIDDEN',
      });
    } catch {
      // best effort
    }
    return respondError(c, 'FORBIDDEN', 'Origem da requisição não permitida.');
  }
  await next();
};
