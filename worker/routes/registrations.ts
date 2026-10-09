import { Hono } from 'hono';
import { RegistrationInput, type RegistrationResult } from '../../shared/contracts/registration.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { requireSession } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { requireTurnstile } from '../middleware/turnstile.ts';

export const registrations = new Hono<AppBindings>();

const NEUTRAL_CONFLICT =
  'Não foi possível concluir o cadastro com este e-mail. Se você já tem conta, peça um link de acesso.';

export function returnUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/autenticacao/retorno`;
}

/**
 * Registration on top of a PROVISIONAL (anonymous) Supabase session (ADR 0003, spike BE-1):
 *  1. client calls signInAnonymously() and sends its access token;
 *  2. Turnstile (single use) + validation;
 *  3. neutral 409 if the e-mail already belongs to another auth user (Auth itself answers
 *     500 "Error updating user" in that case — observed in the spike);
 *  4. profile row (compensated if step 5 fails);
 *  5. admin.updateUserById(uid, {email, email_confirm:false}) — e-mail linked, unconfirmed,
 *     user stays is_anonymous=true (spike);
 *  6. magic link (shouldCreateUser:false) — clicking it confirms the e-mail; the client then
 *     calls POST /auth/confirm-email to become a permanent identity.
 */
registrations.post('/registrations', noStore, rateLimit('registrations'), requireSession, async (c) => {
  const user = c.get('user')!;
  const input = await parseBody(c, RegistrationInput);
  if (!user.is_anonymous) throw fail('CONFLICT', 'Esta conta já está cadastrada.');
  await requireTurnstile(c, input.turnstile_token, 'registrations', 'registration');

  const { repo, auth } = c.get('deps');
  const [territory] = await repo.getTerritories([input.territory_id]);
  if (!territory) throw fail('VALIDATION_ERROR', undefined, { territory_id: 'Território inexistente.' });

  const existing = await repo.getProfile(user.id);
  if (existing) {
    // Idempotent re-submit of the same registration from the same provisional session.
    if (existing.email_contact === input.email) {
      const result: RegistrationResult = {
        profile_id: user.id,
        territory_id: existing.selected_territory_id ?? input.territory_id,
        email_verification_state: existing.email_verification_state,
        session_state: 'provisional',
      };
      return ok(c, result);
    }
    throw fail('CONFLICT', NEUTRAL_CONFLICT);
  }

  if (await repo.emailInUse(input.email, user.id)) throw fail('CONFLICT', NEUTRAL_CONFLICT);

  const created = await repo.createProfile({
    user_id: user.id,
    display_name: sanitizePlainText(input.display_name, 120),
    email: input.email,
    phone: input.phone,
    territory_id: input.territory_id,
    consent_version: input.consent_version,
    contact_opt_in: input.contact_opt_in,
    email_state: 'pending',
  });

  const link = await auth.linkEmail(user.id, input.email);
  if (!link.ok) {
    // Compensation: never leave a profile pointing to an identity without the e-mail (T18).
    await repo.deleteProfile(user.id);
    if (await repo.emailInUse(input.email, user.id)) throw fail('CONFLICT', NEUTRAL_CONFLICT);
    throw fail('INTERNAL_ERROR');
  }

  const sent = await auth.sendMagicLink(input.email, returnUrl(c.env.PUBLIC_ORIGIN));
  let state: RegistrationResult['email_verification_state'] = 'pending';
  if (!sent.ok) {
    state = 'unverified';
    await repo.updateProfile(user.id, { email_state: 'unverified' });
    console.warn(
      JSON.stringify({ level: 'warn', event: 'magic_link_not_sent', code: sent.code, request_id: c.get('requestId') }),
    );
  }

  const result: RegistrationResult = {
    profile_id: created.profile.user_id,
    territory_id: input.territory_id,
    email_verification_state: state,
    session_state: 'provisional',
  };
  return ok(c, result, 201);
});
