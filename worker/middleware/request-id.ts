import type { MiddlewareHandler } from 'hono';
import { routePath } from 'hono/route';
import type { AppBindings, Deps } from '../env.ts';

/**
 * First middleware: assigns an opaque request id, injects deps, sets baseline security
 * headers and emits ONE structured log line per request:
 * {request_id, route, method, status, ms, rate_limited} — no PII, no tokens, no bodies.
 */
export function requestContext(getDeps: (env: AppBindings['Bindings']) => Deps): MiddlewareHandler<AppBindings> {
  return async (c, next) => {
    const deps = getDeps(c.env);
    const requestId = crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('deps', deps);
    c.set('user', null);
    c.set('token', null);
    c.set('rateLimited', false);
    c.set('startedAt', deps.now());

    await next();

    c.header('X-Request-Id', requestId);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('Referrer-Policy', 'no-referrer');
    if (!c.res.headers.get('Cache-Control')) c.header('Cache-Control', 'no-store');

    if (c.env.APP_ENV !== 'test') {
      console.log(
        JSON.stringify({
          request_id: requestId,
          route: routePath(c),
          method: c.req.method,
          status: c.res.status,
          ms: deps.now() - c.get('startedAt'),
          rate_limited: c.get('rateLimited'),
        }),
      );
    }
  };
}
