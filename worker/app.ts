import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { AppBindings, Deps, Env } from './env.ts';
import { onError, onNotFound, respondError } from './middleware/errors.ts';
import { SlidingWindowLimiter } from './middleware/rate-limit.ts';
import { requestContext } from './middleware/request-id.ts';
import { writesEnabled } from './middleware/writes-enabled.ts';
import { SupabaseAuthGateway, SupabaseRepo } from './repositories/supabase.ts';
import { activities } from './routes/activities.ts';
import { admin } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { groups } from './routes/groups.ts';
import { health } from './routes/health.ts';
import { me } from './routes/me.ts';
import { registrations } from './routes/registrations.ts';
import { rsvp } from './routes/rsvp.ts';
import { territories } from './routes/territories.ts';
import { createSiteverifyClient } from './services/turnstile.ts';

export interface CreateAppOptions {
  /** Inject collaborators (tests pass in-memory fakes). Defaults to Supabase TARGET + Siteverify. */
  deps?: (env: Env) => Deps;
}

export function createApp(opts: CreateAppOptions = {}) {
  const limiter = new SlidingWindowLimiter();
  const turnstile = createSiteverifyClient();
  const getDeps =
    opts.deps ??
    ((env: Env): Deps => ({
      repo: new SupabaseRepo(env),
      auth: new SupabaseAuthGateway(env),
      turnstile,
      limiter,
      now: Date.now,
    }));

  const app = new Hono<AppBindings>();
  app.use('*', requestContext(getDeps));
  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 32 * 1024,
      onError: (c) => respondError(c, 'VALIDATION_ERROR', 'Corpo da requisição grande demais.'),
    }),
  );
  app.use('/api/*', writesEnabled);

  const v1 = new Hono<AppBindings>();
  v1.route('/', health);
  v1.route('/', territories);
  v1.route('/', groups);
  v1.route('/', rsvp);
  v1.route('/', activities);
  v1.route('/', registrations);
  v1.route('/', me);
  v1.route('/', authRoutes);
  v1.route('/', admin);
  app.route('/api/v1', v1);

  app.onError(onError);
  app.notFound(onNotFound);
  return app;
}
