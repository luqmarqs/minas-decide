import { Hono } from 'hono';
import {
  AccountProfileInput,
  RegistrationInput,
  type AccountProfileResult,
  type RegistrationResult,
} from '../../shared/contracts/registration.ts';
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
 * POST /registrations — volunteer sign-up WITHOUT an account (D48, owner 2026-10-14).
 *  - public: no session needed; an Authorization header, if any, is ignored;
 *  - no-store, rate limited per IP, Zod validation, Turnstile (single use, action
 *    `registration`), territory must exist, name sanitized as plain text;
 *  - INSERT ... ON CONFLICT (lower(email)) DO NOTHING: a repeated e-mail gets EXACTLY the same
 *    answer as a new one (no enumeration) and never overwrites the stored row;
 *  - the answer carries no id and no personal data; the audit row carries neither.
 */
registrations.post('/registrations', noStore, rateLimit('volunteer_ip'), async (c) => {
  const input = await parseBody(c, RegistrationInput);
  await requireTurnstile(c, input.turnstile_token, 'registrations', 'registration');

  const { repo } = c.get('deps');
  const [territory] = await repo.getTerritories([input.territory_id]);
  if (!territory)
    throw fail('VALIDATION_ERROR', undefined, { territory_id: 'Território inexistente.' });

  const { created } = await repo.createVolunteerSignup({
    display_name: sanitizePlainText(input.display_name, 120),
    email: input.email,
    phone: input.phone,
    territory_id: input.territory_id,
    consent_version: input.consent_version,
    contact_opt_in: input.contact_opt_in,
  });
  await repo.recordAudit({
    actor: null,
    action: 'volunteer.signup',
    entity_type: 'volunteer_signup',
    entity_id: null,
    request_id: c.get('requestId'),
    reason: created ? 'outcome=created' : 'outcome=duplicate',
  });

  const result: RegistrationResult = { territory_id: input.territory_id, status: 'received' };
  return ok(c, result);
});

/**
 * POST /registrations/account — ORGANIZER profile on top of a Clerk session (ADR 0005; the
 * volunteer sign-up above no longer needs an account since D48):
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
  '/registrations/account',
  noStore,
  rateLimit('registrations_ip'),
  requireFreshSession,
  rateLimitPerUser('registrations'),
  async (c) => {
    const user = c.get('user')!;
    const input = await parseBody(c, AccountProfileInput);
    if (!user.email || !user.email_confirmed) throw fail('EMAIL_NOT_VERIFIED');
    if (!sameEmail(input.email, user.email)) {
      throw fail('VALIDATION_ERROR', undefined, {
        email: 'Use o mesmo e-mail que você confirmou com o código.',
      });
    }

    const { repo } = c.get('deps');
    const existing = await repo.getProfile(user.id);
    if (existing) {
      const result: AccountProfileResult = {
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

    const result: AccountProfileResult = {
      profile_id: created.profile.user_id,
      territory_id: input.territory_id,
      email_verification_state: 'verified',
      session_state: 'verified',
    };
    return ok(c, result, created.created ? 201 : 200);
  },
);
