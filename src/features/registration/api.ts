import { z } from 'zod';
import {
  RegistrationResult,
  type RegistrationInput,
  type SendLinkInput,
} from '@shared/contracts/registration.ts';
import { apiRequest } from '@/lib/api';
import { authedRequest, ensureProvisionalSession } from '@/lib/auth';

/** Version of the (draft) terms/privacy text the person accepted. */
export const CONSENT_VERSION = 'rascunho-2026-10';

/**
 * Cadastro: provisional session (anonymous sign-in) → POST /registrations with the
 * access token. Nothing is reported as success before the Worker answers.
 */
export async function submitRegistration(input: RegistrationInput) {
  const session = await ensureProvisionalSession();
  return authedRequest('/registrations', RegistrationResult, {
    method: 'POST',
    body: input,
    session,
  });
}

/**
 * Real Worker response of POST /auth/send-link (202). The shared contract
 * `SendLinkResponse` says `{sent: true}`, the Worker returns `{status, message}`;
 * only `message` is used (see report: contract change requested).
 */
export const SendLinkResult = z.object({ message: z.string() });

export function sendMagicLink(input: z.input<typeof SendLinkInput>) {
  return apiRequest('/auth/send-link', SendLinkResult, { method: 'POST', body: input });
}

/** E-mail delivery state handed from /participar to /obrigado via router state (not the URL). */
export interface ObrigadoState {
  emailState: RegistrationResult['email_verification_state'];
}
