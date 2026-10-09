import type { Context } from 'hono';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { clientIp } from '../http.ts';
import { sha256Hex } from '../services/crypto.ts';
import { TURNSTILE_TEST_SECRETS } from '../services/turnstile.ts';
import { subjectHash } from './rate-limit.ts';

export const TURNSTILE_TOKEN_TTL_SECONDS = 300;

async function logFailure(
  c: Context<AppBindings>,
  route: string,
  eventType: string,
): Promise<void> {
  try {
    await c.get('deps').repo.recordAbuse({
      subject_hash: await subjectHash(c.env.RSVP_DEVICE_SECRET, clientIp(c)),
      route,
      event_type: eventType,
      block_code: 'TURNSTILE_FAILED',
    });
  } catch {
    // best effort
  }
}

/**
 * Server-side Turnstile check. The token travels in the JSON body, so this runs inside the
 * handler after parsing (not as a generic middleware). Order:
 *   1. token present;   2. single use (hash stored for 5 min, T17);
 *   3. Siteverify success;   4. hostname ∈ TURNSTILE_EXPECTED_HOSTNAMES and action match
 *      (skipped for Cloudflare TEST secrets, which return a fixed hostname).
 */
export async function requireTurnstile(
  c: Context<AppBindings>,
  token: string | undefined | null,
  route: string,
  expectedAction?: string,
): Promise<void> {
  if (!token) {
    await logFailure(c, route, 'turnstile_missing');
    throw fail('TURNSTILE_FAILED');
  }
  const secret = c.env.TURNSTILE_SECRET_KEY;
  const isTestSecret = TURNSTILE_TEST_SECRETS.has(secret);
  if (!secret || (isTestSecret && !['local', 'test'].includes(c.env.APP_ENV))) {
    console.error(
      JSON.stringify({
        level: 'error',
        event: 'turnstile_misconfigured',
        request_id: c.get('requestId'),
      }),
    );
    throw fail('TURNSTILE_FAILED');
  }

  const { repo, turnstile } = c.get('deps');
  const firstUse = await repo.consumeTurnstileToken(
    await sha256Hex(token),
    TURNSTILE_TOKEN_TTL_SECONDS,
  );
  if (!firstUse) {
    await logFailure(c, route, 'turnstile_reused');
    throw fail('TURNSTILE_FAILED');
  }

  const ip = clientIp(c);
  const result = await turnstile.verify({
    secret,
    token,
    remoteIp: ip === 'local' ? null : ip,
    expectedAction: expectedAction ?? null,
  });
  if (!result.success) {
    await logFailure(c, route, 'turnstile_rejected');
    throw fail('TURNSTILE_FAILED');
  }
  if (!isTestSecret) {
    const allowed = c.env.TURNSTILE_EXPECTED_HOSTNAMES.split(',')
      .map((h) => h.trim())
      .filter(Boolean);
    if (!result.hostname || !allowed.includes(result.hostname)) {
      await logFailure(c, route, 'turnstile_hostname');
      throw fail('TURNSTILE_FAILED');
    }
    if (expectedAction && result.action !== expectedAction) {
      await logFailure(c, route, 'turnstile_action');
      throw fail('TURNSTILE_FAILED');
    }
  }
}
