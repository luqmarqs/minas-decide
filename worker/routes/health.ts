import { Hono } from 'hono';
import type { AppBindings } from '../env.ts';
import { ok } from '../http.ts';
import { noStore } from '../middleware/cache.ts';

export const health = new Hono<AppBindings>();

/** Technical status only: no versions, secrets, refs or dependency details. */
health.get('/health', noStore, (c) =>
  ok(c, {
    status: 'ok',
    writes_enabled: c.env.WRITES_ENABLED === 'true',
    time: new Date().toISOString(),
  }),
);
