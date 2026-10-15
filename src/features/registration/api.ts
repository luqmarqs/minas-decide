import { RegistrationResult, type RegistrationInput } from '@shared/contracts/registration.ts';
import { apiRequest } from '@/lib/api';

/** Version of the (draft) terms/privacy text the person accepted. */
export const CONSENT_VERSION = 'rascunho-2026-10';

/**
 * Volunteer sign-up WITHOUT an account (D48): public POST /registrations — no session, no
 * Clerk (this module must not import the auth/session code). The answer is the same for a new
 * or an already registered e-mail; nothing is reported as success before the Worker answers.
 */
export function submitRegistration(input: RegistrationInput) {
  return apiRequest('/registrations', RegistrationResult, { method: 'POST', body: input });
}

/** Handed from the sign-up form to /obrigado via router state (not the URL). */
export interface ObrigadoState {
  registered: true;
}
