import { Hono } from 'hono';
import { SendLinkInput } from '../../shared/contracts/registration.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { requireSession } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { requireTurnstile } from '../middleware/turnstile.ts';
import { buildMe } from './me.ts';
import { returnUrl } from './registrations.ts';

export const authRoutes = new Hono<AppBindings>();

/**
 * Magic link for EXISTING accounts only (shouldCreateUser:false). Anti-enumeration: the
 * response is identical whether or not the e-mail exists or the provider refused to send.
 */
authRoutes.post('/auth/send-link', noStore, rateLimit('send_link'), async (c) => {
  const input = await parseBody(c, SendLinkInput);
  await requireTurnstile(c, input.turnstile_token, 'send_link', 'send_link');
  const res = await c.get('deps').auth.sendMagicLink(input.email, returnUrl(c.env.PUBLIC_ORIGIN));
  if (!res.ok) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'magic_link_not_sent',
        code: res.code,
        request_id: c.get('requestId'),
      }),
    );
  }
  return ok(
    c,
    {
      status: 'sent_if_exists',
      message: 'Se houver uma conta com este e-mail, enviamos um link de acesso.',
    },
    202,
  );
});

/** Methods proving the CURRENT session was created by possession of the e-mail inbox. */
const EMAIL_PROOF_METHODS = new Set(['otp', 'magiclink', 'email/signup', 'email_change']);

/**
 * Turns a provisional identity into a permanent one AFTER the user clicked the e-mail link.
 * Spike BE-1: verifying the magic link sets email_confirmed_at but keeps is_anonymous=true;
 * only admin.updateUserById(uid, {email: <same>, email_confirm: true}) flips it. Requirements:
 *   - e-mail confirmed by Auth AND this session's `amr` contains an e-mail proof method
 *     (a stale anonymous session of someone who squatted the address can never pass);
 *   - all OTHER sessions are revoked (signOut 'others') when the promotion happens.
 * The client must call supabase.auth.refreshSession() afterwards to get a JWT with
 * is_anonymous=false.
 */
authRoutes.post(
  '/auth/confirm-email',
  noStore,
  rateLimit('confirm_email'),
  requireSession,
  async (c) => {
    const user = c.get('user')!;
    const token = c.get('token')!;
    const { auth, repo } = c.get('deps');
    if (!user.email || !user.email_confirmed) throw fail('EMAIL_NOT_VERIFIED');
    if (!user.amr_methods.some((m) => EMAIL_PROOF_METHODS.has(m))) {
      throw fail(
        'EMAIL_NOT_VERIFIED',
        'Abra o link enviado ao seu e-mail neste dispositivo para confirmar.',
      );
    }
    let promoted = false;
    if (user.is_anonymous) {
      if (!(await auth.promoteVerified(user.id, user.email))) throw fail('INTERNAL_ERROR');
      promoted = true;
      await auth.signOutOthers(token);
      await repo.recordAudit({
        actor: user.id,
        action: 'auth.promote_verified',
        entity_type: 'user',
        entity_id: user.id,
        request_id: c.get('requestId'),
      });
    }
    // P-SEC-1: whoever created the provisional profile may not be the inbox owner. On the
    // promotion, flag the profile for review: the person must confirm/edit name, phone and
    // territory (PATCH /me {profile_reviewed:true}) — the client shows that step.
    const profile = (await repo.getProfile(user.id))
      ? await repo.updateProfile(user.id, {
          email_state: 'verified',
          ...(promoted ? { review_required: true } : {}),
        })
      : null;
    const me = await buildMe(c, { ...user, is_anonymous: false, jwt_is_anonymous: false }, profile);
    return ok(c, { ...me, requires_session_refresh: true });
  },
);
