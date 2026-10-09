/**
 * Worker bindings and per-request context. Secrets come from `wrangler secret put`
 * (prod/staging) or `.dev.vars` (local). TARGET project only — no SOURCE variable may
 * ever be added here.
 */
import type { AuthGateway, Repo } from './repositories/types.ts';
import type { TurnstileVerifier } from './services/turnstile.ts';
import type { SlidingWindowLimiter } from './middleware/rate-limit.ts';
import type { UserInfoCache } from './services/user-cache.ts';

export type AppEnvName = 'local' | 'test' | 'staging' | 'production';

export interface Env {
  APP_ENV: string;
  WRITES_ENABLED: string;
  PUBLIC_ORIGIN: string;
  /** optional extra origins allowed to send mutations, comma-separated (QA-1 F14) */
  ALLOWED_ORIGINS?: string;
  TURNSTILE_EXPECTED_HOSTNAMES: string;
  SUPABASE_TARGET_URL: string;
  /** legacy (Supabase Auth); no longer used by the Worker since ADR 0005 */
  SUPABASE_TARGET_ANON_KEY?: string;
  SUPABASE_TARGET_SERVICE_ROLE_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  RSVP_DEVICE_SECRET: string;
  ADMIN_EMAILS?: string;
  /** Clerk Backend secret (ADR 0005). Verifies session tokens and reads users. Worker only. */
  CLERK_SECRET_KEY: string;
  /** optional PEM public key of the Clerk instance: networkless token verification (no JWKS fetch) */
  CLERK_JWT_KEY?: string;
  /**
   * Clerk publishable key (public, `pk_test_…`/`pk_live_…`). The Worker only uses it to derive
   * the expected `iss` of session tokens (the Frontend API host is base64 in the key suffix).
   * Required in staging/production unless CLERK_ISSUER is set (QA3-04).
   */
  CLERK_PUBLISHABLE_KEY?: string;
  /** optional explicit issuer (`https://<frontend-api-host>`); overrides the derived one */
  CLERK_ISSUER?: string;
  /**
   * Svix signing secret (`whsec_…`) of the Clerk webhook endpoint (QA3-02). Optional: without
   * it `POST /api/v1/webhooks/clerk` answers 404 NOT_FOUND (webhook disabled).
   */
  CLERK_WEBHOOK_SIGNING_SECRET?: string;
}

/** Subset of the Workers Cache API used for public GETs (QA-1 F16). */
export interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
  delete(request: Request): Promise<boolean>;
}

/** Collaborators injected per app instance (real Supabase in prod, fakes in tests). */
export interface Deps {
  repo: Repo;
  auth: AuthGateway;
  turnstile: TurnstileVerifier;
  limiter: SlidingWindowLimiter;
  /** per-isolate cache of Clerk `users.getUser` results (QA3-01) */
  userCache: UserInfoCache;
  now: () => number;
  /** `caches.default` on Workers; null where the Cache API does not exist (Node tests). */
  edgeCache: EdgeCache | null;
}

/** Authenticated person, resolved from a verified Clerk session token. */
export interface AuthUser {
  /** Clerk user id (`user_…`) */
  id: string;
  /** primary e-mail (lower-cased) from Clerk */
  email: string | null;
  /** Clerk verified the primary e-mail */
  email_confirmed: boolean;
  /** always false: there are no anonymous sessions with Clerk (kept for contract stability) */
  is_anonymous: false;
}

export interface Vars {
  requestId: string;
  deps: Deps;
  user: AuthUser | null;
  rateLimited: boolean;
  startedAt: number;
}

export type AppBindings = { Bindings: Env; Variables: Vars };

export function isLocal(env: Env): boolean {
  return env.APP_ENV === 'local';
}
