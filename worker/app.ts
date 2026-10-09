import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppBindings, Deps, EdgeCache, Env } from './env.ts';
import { configCheck } from './middleware/config-check.ts';
import { onError, onNotFound, respondError } from './middleware/errors.ts';
import { originGuard } from './middleware/origin.ts';
import { SlidingWindowLimiter } from './middleware/rate-limit.ts';
import { requestContext } from './middleware/request-id.ts';
import { writesEnabled } from './middleware/writes-enabled.ts';
import { ClerkAuthGateway } from './repositories/clerk.ts';
import { SupabaseRepo } from './repositories/supabase.ts';
import { activities } from './routes/activities.ts';
import { admin } from './routes/admin.ts';
import { groups } from './routes/groups.ts';
import { health } from './routes/health.ts';
import { me } from './routes/me.ts';
import { registrations } from './routes/registrations.ts';
import { rsvp } from './routes/rsvp.ts';
import { territories } from './routes/territories.ts';
import { webhooks } from './routes/webhooks.ts';
import { createSiteverifyClient } from './services/turnstile.ts';
import { UserInfoCache } from './services/user-cache.ts';

export interface CreateAppOptions {
  /** Inject collaborators (tests pass in-memory fakes). Defaults to Supabase TARGET + Siteverify. */
  deps?: (env: Env) => Deps;
}

/** `caches.default` when running on Workers (or wrangler dev); null elsewhere. */
function defaultEdgeCache(): EdgeCache | null {
  const g = globalThis as { caches?: { default?: EdgeCache } };
  return g.caches?.default ?? null;
}

export function createApp(opts: CreateAppOptions = {}) {
  const limiter = new SlidingWindowLimiter();
  const turnstile = createSiteverifyClient();
  // QA3-01: one cache per isolate (createApp runs once per isolate in worker/index.ts).
  const userCache = new UserInfoCache();
  const getDeps =
    opts.deps ??
    ((env: Env): Deps => ({
      repo: new SupabaseRepo(env),
      auth: new ClerkAuthGateway(env),
      turnstile,
      limiter,
      userCache,
      now: Date.now,
      edgeCache: defaultEdgeCache(),
    }));

  const app = new Hono<AppBindings>();
  app.use('*', requestContext(getDeps));
  app.use('/api/*', configCheck());
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) => respondError(c, 'VALIDATION_ERROR', 'Corpo da requisição grande demais.'),
    }),
  );
  app.use('/api/*', originGuard);
  app.use('/api/*', writesEnabled);

  const v1 = new Hono<AppBindings>();
  v1.route('/', health);
  v1.route('/', territories);
  v1.route('/', groups);
  v1.route('/', rsvp);
  v1.route('/', activities);
  v1.route('/', registrations);
  v1.route('/', me);
  v1.route('/', admin);
  v1.route('/', webhooks);
  app.route('/api/v1', v1);

  app.onError(onError);
  app.notFound(onNotFound);
  return app;
}
