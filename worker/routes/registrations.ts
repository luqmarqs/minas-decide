import { Hono } from 'hono';
import { RegistrationInput, type RegistrationResult } from '../../shared/contracts/registration.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { requireFreshSession, sameEmail } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit, rateLimitPerUser } from '../middleware/rate-limit.ts';
import { requireTurnstile } from '../middleware/turnstile.ts';

export const registrations = new Hono<AppBindings>();

const NEUTRAL_CONFLICT =
  'Não foi possível concluir o cadastro com este e-mail. Se você já tem conta, entre com ele.';

/**
 * Registration on top of a Clerk session (ADR 0005):
 *  1. the client signs up in Clerk (e-mail code verified BEFORE the session exists) and sends
 *     the session token as Bearer;
 *  2. the primary e-mail must be verified by Clerk (403 EMAIL_NOT_VERIFIED otherwise) and the
 *     `email` typed in the form must be that address (the profile contact is ALWAYS the Clerk
 *     e-mail);
 *  3. Turnstile (single use) + validation;
 *  4. profile row created already `verified`. Re-submitting from the same account is
 *     idempotent (200 with the existing profile).
 * The Clerk user is read fresh (no per-isolate cache, no claims shortcut — QA3-01/03); the
 * fresh lookup also replaces the cached one.
 */
registrations.post(
  '/registrations',
  noStore,
  rateLimit('registrations_ip'),
  requireFreshSession,
  rateLimitPerUser('registrations'),
  async (c) => {
    const user = c.get('user')!;
    const input = await parseBody(c, RegistrationInput);
    if (!user.email || !user.email_confirmed) throw fail('EMAIL_NOT_VERIFIED');
    if (!sameEmail(input.email, user.email)) {
      throw fail('VALIDATION_ERROR', undefined, {
        email: 'Use o mesmo e-mail que você confirmou com o código.',
      });
    }

    const { repo } = c.get('deps');
    const existing = await repo.getProfile(user.id);
    if (existing) {
      const result: RegistrationResult = {
        profile_id: user.id,
        territory_id: existing.selected_territory_id ?? input.territory_id,
        email_verification_state: 'verified', // Clerk verified the e-mail before any session (ADR 0005)
        session_state: 'verified',
      };
      return ok(c, result);
    }

    await requireTurnstile(c, input.turnstile_token, 'registrations', 'registration');

    const [territory] = await repo.getTerritories([input.territory_id]);
    if (!territory)
      throw fail('VALIDATION_ERROR', undefined, { territory_id: 'Território inexistente.' });

    if (await repo.emailInUse(user.email, user.id)) throw fail('CONFLICT', NEUTRAL_CONFLICT);

    const created = await repo.createProfile({
      user_id: user.id,
      display_name: sanitizePlainText(input.display_name, 120),
      email: user.email,
      phone: input.phone,
      territory_id: input.territory_id,
      consent_version: input.consent_version,
      contact_opt_in: input.contact_opt_in,
      email_state: 'verified',
    });
    await repo.recordAudit({
      actor: user.id,
      action: 'profile.create',
      entity_type: 'profile',
      entity_id: user.id,
      request_id: c.get('requestId'),
    });

    const result: RegistrationResult = {
      profile_id: created.profile.user_id,
      territory_id: input.territory_id,
      email_verification_state: 'verified',
      session_state: 'verified',
    };
    return ok(c, result, created.created ? 201 : 200);
  },
);
