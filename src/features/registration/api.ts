import { RegistrationResult, type RegistrationInput } from '@shared/contracts/registration.ts';
import { authedRequest } from '@/lib/auth';

/** Version of the (draft) terms/privacy text the person accepted. */
export const CONSENT_VERSION = 'rascunho-2026-10';

/**
 * Cadastro (ADR 0005): the Clerk session already exists (e-mail verified by code) →
 * POST /registrations with the Clerk session token. Idempotent server-side; nothing is
 * reported as success before the Worker answers.
 */
export function submitRegistration(input: RegistrationInput) {
  return authedRequest('/registrations', RegistrationResult, { method: 'POST', body: input });
}

/** Handed from the sign-up form to /obrigado via router state (not the URL). */
export interface ObrigadoState {
  registered: true;
}
