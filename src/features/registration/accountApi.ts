import { AccountProfileResult, type AccountProfileInput } from '@shared/contracts/registration.ts';
import { authedRequest } from '@/lib/auth';

/**
 * Organizer account (ADR 0005): the Clerk session already exists (e-mail verified by code) →
 * POST /registrations/account with the Clerk session token. Idempotent server-side; nothing is
 * reported as success before the Worker answers.
 */
export function submitAccountProfile(input: AccountProfileInput) {
  return authedRequest('/registrations/account', AccountProfileResult, {
    method: 'POST',
    body: input,
  });
}
