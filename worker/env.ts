/**
 * Worker bindings and per-request context. Secrets come from `wrangler secret put`
 * (prod/staging) or `.dev.vars` (local). TARGET project only — no SOURCE variable may
 * ever be added here.
 */
import type { AuthGateway, Repo } from './repositories/types.ts';
import type { TurnstileVerifier } from './services/turnstile.ts';
import type { SlidingWindowLimiter } from './middleware/rate-limit.ts';

export type AppEnvName = 'local' | 'test' | 'staging' | 'production';

export interface Env {
  APP_ENV: string;
  WRITES_ENABLED: string;
  PUBLIC_ORIGIN: string;
  TURNSTILE_EXPECTED_HOSTNAMES: string;
  SUPABASE_TARGET_URL: string;
  SUPABASE_TARGET_ANON_KEY: string;
  SUPABASE_TARGET_SERVICE_ROLE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  RSVP_DEVICE_SECRET: string;
  ADMIN_EMAILS?: string;
}

/** Collaborators injected per app instance (real Supabase in prod, fakes in tests). */
export interface Deps {
  repo: Repo;
  auth: AuthGateway;
  turnstile: TurnstileVerifier;
  limiter: SlidingWindowLimiter;
  now: () => number;
}

export interface AuthUser {
  id: string;
  email: string | null;
  email_confirmed: boolean;
  /** true if either the Auth user record or the JWT claim says anonymous */
  is_anonymous: boolean;
  /** raw JWT claim (false only for permanent users) */
  jwt_is_anonymous: boolean;
  aal: string;
  amr_methods: string[];
}

export interface Vars {
  requestId: string;
  deps: Deps;
  user: AuthUser | null;
  token: string | null;
  rateLimited: boolean;
  startedAt: number;
}

export type AppBindings = { Bindings: Env; Variables: Vars };

export function isLocal(env: Env): boolean {
  return env.APP_ENV === 'local';
}
