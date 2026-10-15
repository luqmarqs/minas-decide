import { Hono } from 'hono';
import { RegistrationInput, type RegistrationResult } from '../../shared/contracts/registration.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { requireTurnstile } from '../middleware/turnstile.ts';

export const registrations = new Hono<AppBindings>();

/**
 * POST /registrations — THE registration (D48/D49): no account. Organizers later sign in with
 * a Clerk e-mail code and are linked to this row by their VERIFIED e-mail (svc_link_organizer).
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
