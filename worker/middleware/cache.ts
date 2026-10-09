import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../env.ts';

/** Short public cache for anonymous list/detail reads (only on 200). */
export function cachePublic(maxAgeSec = 60): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    await next();
    if (c.res.status === 200) c.header('Cache-Control', `public, max-age=${maxAgeSec}`);
    else c.header('Cache-Control', 'no-store');
  };
}

/** Account, registration, admin and RSVP responses are never cached. */
export const noStore: MiddlewareHandler<AppBindings> = async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
};
