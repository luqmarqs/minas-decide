/**
 * "Entrar" by e-mail code (ADR 0005, D49). Works for ANY e-mail with the same screen and the
 * same 6-digit code:
 *  - Clerk knows the e-mail: `signIn.create({ identifier })` → `prepareFirstFactor` →
 *    `attemptFirstFactor` → `setActive`;
 *  - Clerk does not (`form_identifier_not_found`): transparent sign-up — `signUp.create
 *    ({ emailAddress })` → `prepareEmailAddressVerification` → `attemptEmailAddressVerification`
 *    → `setActive`. Nothing else is asked; the Worker links the login to the registration with
 *    the same e-mail (D49).
 *
 * FE-12: Clerk lives in a lazy chunk; the resources come from the session store and every
 * step waits for Clerk to be loaded (rejects with `not_loaded` after a timeout).
 */
import { useCallback, useRef } from 'react';
import { AuthFlowError, clerkErrorCode } from '@/lib/clerk';
import { useClerkSnapshot, whenClerkReady, type ClerkSnapshot } from '@/lib/session';

export const CODE_RE = /^\d{6}$/;

/** Keeps only digits (people paste "123 456" or "123-456"). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

/** Loaded Clerk resources, or `AuthFlowError('not_loaded')`. */
export async function readyClerk(): Promise<ClerkSnapshot> {
  try {
    return await whenClerkReady();
  } catch {
    throw new AuthFlowError('not_loaded');
  }
}

export function useEmailCodeSignIn({ lazy = false }: { lazy?: boolean } = {}) {
  const ready = !!useClerkSnapshot({ lazy });
  const emailAddressId = useRef<string | null>(null);
  /** which Clerk flow carries the code: existing user (sign-in) or new one (sign-up) */
  const mode = useRef<'signin' | 'signup'>('signin');

  /** Sends (or re-sends) the code of the current flow. */
  const prepare = useCallback(async () => {
    const { signIn, signUp } = await readyClerk();
    if (mode.current === 'signup') {
      if (!signUp) throw new AuthFlowError('not_loaded');
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      return;
    }
    if (!signIn || !emailAddressId.current) throw new AuthFlowError('not_loaded');
    await signIn.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailAddressId.current,
    });
  }, []);

  /** Starts a sign-in (or, for an unknown e-mail, a sign-up) and sends the code. */
  const start = useCallback(
    async (email: string) => {
      const { signIn, signUp } = await readyClerk();
      if (!signIn || !signUp) throw new AuthFlowError('not_loaded');
      try {
        const res = await signIn.create({ identifier: email });
        const factor = res.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
        if (!factor || !('emailAddressId' in factor)) {
          throw new AuthFlowError('strategy_unavailable');
        }
        emailAddressId.current = factor.emailAddressId;
        mode.current = 'signin';
      } catch (err) {
        if (clerkErrorCode(err) !== 'form_identifier_not_found') throw err;
        await signUp.create({ emailAddress: email });
        mode.current = 'signup';
      }
      await prepare();
    },
    [prepare],
  );

  /** Checks the code and activates the session. */
  const verify = useCallback(async (code: string) => {
    const { signIn, signUp, setActive } = await readyClerk();
    if (!setActive) throw new AuthFlowError('not_loaded');
    let sessionId: string | null | undefined;
    if (mode.current === 'signup') {
      if (!signUp) throw new AuthFlowError('not_loaded');
      const res = await signUp.attemptEmailAddressVerification({ code });
      if (res.status !== 'complete') throw new AuthFlowError('flow_incomplete');
      sessionId = res.createdSessionId;
    } else {
      if (!signIn) throw new AuthFlowError('not_loaded');
      const res = await signIn.attemptFirstFactor({ strategy: 'email_code', code });
      if (res.status !== 'complete') throw new AuthFlowError('flow_incomplete');
      sessionId = res.createdSessionId;
    }
    if (!sessionId) throw new AuthFlowError('flow_incomplete');
    await setActive({ session: sessionId });
  }, []);

  return { ready, start, resend: prepare, verify };
}
