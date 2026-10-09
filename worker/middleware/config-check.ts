import type { MiddlewareHandler } from 'hono';
import type { AppBindings, Env } from '../env.ts';
import { respondError } from './errors.ts';

/** Placeholder shipped in `.dev.vars.example`; must never be used as the real secret. */
export const RSVP_SECRET_PLACEHOLDER = 'change-me-to-a-random-32-byte-string';
export const RSVP_SECRET_MIN_LENGTH = 32;

/** Returns the names of misconfigured settings (never their values). */
export function configProblems(env: Env): string[] {
  const problems: string[] = [];
  const secret = env.RSVP_DEVICE_SECRET ?? '';
  if (secret.length < RSVP_SECRET_MIN_LENGTH || secret === RSVP_SECRET_PLACEHOLDER) {
    problems.push('RSVP_DEVICE_SECRET');
  }
  return problems;
}

/**
 * QA-1 I03: validates critical secrets on the first request of the isolate (Workers have no
 * boot hook with access to env). The result is memoised per secret value, so a fixed
 * misconfiguration keeps failing and a corrected one starts passing without a redeploy.
 * Failure -> 500 INTERNAL_ERROR for every /api request + one `misconfigured` log line with
 * the setting NAME only.
 */
export function configCheck(): MiddlewareHandler<AppBindings> {
  let checkedFor: string | null = null;
  let problems: string[] = [];
  return async (c, next) => {
    const fingerprint = c.env.RSVP_DEVICE_SECRET ?? '';
    if (checkedFor !== fingerprint) {
      problems = configProblems(c.env);
      checkedFor = fingerprint;
    }
    if (problems.length > 0) {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'misconfigured',
          settings: problems,
          request_id: c.get('requestId'),
        }),
      );
      return respondError(c, 'INTERNAL_ERROR');
    }
    await next();
  };
}
