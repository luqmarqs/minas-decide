import type { MiddlewareHandler } from 'hono';
import type { AppBindings } from '../env.ts';
import { respondError } from './errors.ts';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Incident switch (spec §9.13): WRITES_ENABLED !== 'true' suspends every mutation; reads continue. */
export const writesEnabled: MiddlewareHandler<AppBindings> = async (c, next) => {
  if (!SAFE.has(c.req.method) && c.env.WRITES_ENABLED !== 'true') {
    return respondError(c, 'WRITES_SUSPENDED');
  }
  await next();
};
