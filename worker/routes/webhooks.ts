import { verifyWebhook } from '@clerk/backend/webhooks';
import { Hono } from 'hono';
import { ClerkUserId } from '../../shared/contracts/registration.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok } from '../http.ts';
import { invalidateUserCache } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';

export const webhooks = new Hono<AppBindings>();

/** Audit actor of erasures triggered by Clerk (not a user id). */
export const CLERK_WEBHOOK_ACTOR = 'system:clerk-webhook';

/**
 * Clerk webhook (QA3-02), delivered by Svix server-to-server:
 *  - disabled (404 NOT_FOUND) unless CLERK_WEBHOOK_SIGNING_SECRET is configured;
 *  - rate limited per IP, body capped by the global /api body limit (32 KiB), `no-store`;
 *  - no Turnstile and no Origin requirement (Svix sends no Origin), but the Svix signature
 *    (`svix-id`/`svix-timestamp`/`svix-signature`, HMAC-SHA256, ±5 min tolerance) is verified
 *    with `verifyWebhook` from @clerk/backend before anything else — invalid -> 401;
 *  - `user.deleted` -> `svc_erase_user_data(user_id)` (RSVPs, activities, profile, admin row)
 *    + an audit row with actor `system:clerk-webhook`; replays are harmless (idempotent);
 *  - any other event type -> 200 `{ handled: false }` (ignored).
 * Exempt from WRITES_ENABLED (middleware/writes-enabled.ts): an erasure only removes data and
 * must not wait for the incident switch.
 */
webhooks.post('/webhooks/clerk', noStore, rateLimit('webhook_ip'), async (c) => {
  const secret = c.env.CLERK_WEBHOOK_SIGNING_SECRET?.trim();
  if (!secret) throw fail('NOT_FOUND', 'Webhook desativado.');

  let event: Awaited<ReturnType<typeof verifyWebhook>>;
  try {
    event = await verifyWebhook(c.req.raw, { signingSecret: secret });
  } catch {
    throw fail('UNAUTHENTICATED', 'Assinatura do webhook inválida.');
  }

  if (event.type !== 'user.deleted') {
    return ok(c, { handled: false });
  }
  const parsed = ClerkUserId.safeParse(event.data.id);
  if (!parsed.success) throw fail('VALIDATION_ERROR', 'Evento sem id de usuário válido.');
  const userId = parsed.data;

  const { repo } = c.get('deps');
  invalidateUserCache(c, userId);
  await repo.eraseUserData(userId, c.get('requestId'));
  await repo.recordAudit({
    actor: CLERK_WEBHOOK_ACTOR,
    action: 'user.erase_by_clerk_webhook',
    entity_type: 'user',
    entity_id: userId,
    request_id: c.get('requestId'),
  });
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'clerk_webhook_user_deleted',
      request_id: c.get('requestId'),
    }),
  );
  return ok(c, { handled: true });
});
