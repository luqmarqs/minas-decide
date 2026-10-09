/**
 * Clerk sign-in by e-mail code (ADR 0005): `signIn.create({ identifier })` →
 * `prepareFirstFactor({ strategy: 'email_code' })` → `attemptFirstFactor` → `setActive`.
 * Shared by `/entrar` and by the sign-up form ("este e-mail já tem cadastro").
 */
import { useSignIn } from '@clerk/clerk-react';
import { useCallback, useRef } from 'react';
import { AuthFlowError } from '@/lib/clerk';

export const CODE_RE = /^\d{6}$/;

/** Keeps only digits (people paste "123 456" or "123-456"). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export function useEmailCodeSignIn() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const emailAddressId = useRef<string | null>(null);

  const prepare = useCallback(async () => {
    if (!isLoaded || !signIn || !emailAddressId.current) throw new AuthFlowError('not_loaded');
    await signIn.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailAddressId.current,
    });
  }, [isLoaded, signIn]);

  /** Starts a sign-in and sends the code. */
  const start = useCallback(
    async (email: string) => {
      if (!isLoaded || !signIn) throw new AuthFlowError('not_loaded');
      const res = await signIn.create({ identifier: email });
      const factor = res.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
      if (!factor || !('emailAddressId' in factor)) throw new AuthFlowError('strategy_unavailable');
      emailAddressId.current = factor.emailAddressId;
      await prepare();
    },
    [isLoaded, signIn, prepare],
  );

  /** Checks the code and activates the session. */
  const verify = useCallback(
    async (code: string) => {
      if (!isLoaded || !signIn || !setActive) throw new AuthFlowError('not_loaded');
      const res = await signIn.attemptFirstFactor({ strategy: 'email_code', code });
      if (res.status !== 'complete' || !res.createdSessionId) {
        throw new AuthFlowError('flow_incomplete');
      }
      await setActive({ session: res.createdSessionId });
    },
    [isLoaded, signIn, setActive],
  );

  return { ready: isLoaded, start, resend: prepare, verify };
}
