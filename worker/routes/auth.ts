import { Hono, type Context } from 'hono';
import { SendLinkInput } from '../../shared/contracts/registration.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { requireSession, sameEmail } from '../middleware/auth.ts';
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

/** Revokes every other session; one retry, then fails closed (QA2-02). */
async function revokeOtherSessions(c: Context<AppBindings>, token: string): Promise<void> {
  const { auth } = c.get('deps');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (await auth.signOutOthers(token)) return;
    } catch {
      // treated as a failure below
    }
  }
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'sign_out_others_failed',
      request_id: c.get('requestId'),
    }),
  );
  throw fail('INTERNAL_ERROR');
}

/**
 * Turns a provisional identity into a permanent one AFTER the user clicked the e-mail link.
 * Spike BE-1: verifying the magic link sets email_confirmed_at but keeps is_anonymous=true;
 * only admin.updateUserById(uid, {email: <same>, email_confirm: true}) flips it. Requirements:
 *   - e-mail confirmed by Auth AND this session's `amr` contains an e-mail proof method
 *     (a stale anonymous session of someone who squatted the address can never pass);
 *   - all OTHER sessions are revoked (signOut 'others') when the promotion happens; if that
 *     fails (after one retry) the call fails closed with 500 and nothing is marked verified.
 * QA2-01: "promotion" is ANY transition of the PROFILE to verified, not only the Auth
 * anonymous -> permanent flip done here. GoTrue can make the identity permanent by itself
 * (secure e-mail change of a provisional user), and the address in Auth can diverge from
 * `profiles.email_contact`; both cases get the same treatment: revoke the other sessions,
 * flag the profile for review and re-sync `email_contact` with the Auth address.
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
    const requestId = c.get('requestId');
    const current = await repo.getProfile(user.id);
    const emailChanged = Boolean(current && !sameEmail(current.email_contact, user.email));
    const promotion =
      user.is_anonymous ||
      Boolean(current && (current.email_verification_state !== 'verified' || emailChanged));

    if (user.is_anonymous) {
      if (!(await auth.promoteVerified(user.id, user.email))) throw fail('INTERNAL_ERROR');
    }
    if (promotion) {
      await revokeOtherSessions(c, token);
      await repo.recordAudit({
        actor: user.id,
        action: user.is_anonymous ? 'auth.promote_verified' : 'profile.verify_email',
        entity_type: 'user',
        entity_id: user.id,
        request_id: requestId,
      });
    }
    // P-SEC-1: whoever created the provisional profile may not be the inbox owner. On the
    // promotion, flag the profile for review: the person must confirm/edit name, phone and
    // territory (PATCH /me {profile_reviewed:true}) — the client shows that step.
    const profile =
      current && promotion
        ? await repo.updateProfile(user.id, {
            email_state: 'verified',
            review_required: true,
            ...(emailChanged ? { email_contact: user.email } : {}),
          })
        : current;
    if (emailChanged) {
      // no PII: only who and which kind of change
      await repo.recordAudit({
        actor: user.id,
        action: 'profile.email_changed',
        entity_type: 'profile',
        entity_id: user.id,
        request_id: requestId,
      });
    }
    const me = await buildMe(c, { ...user, is_anonymous: false, jwt_is_anonymous: false }, profile);
    return ok(c, { ...me, requires_session_refresh: true });
  },
);
